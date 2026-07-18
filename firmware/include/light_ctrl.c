// light_ctrl — fade / pulse / idle auto-off / NeoPixel HAL bridge.
// Per-LED fade: color change dips to 1/3 current luma, then back to start.
// Max duration: LIGHT_FADE_MAX_MS (see light_ctrl.h).
#include <light_ctrl.h>
#include <key_sm.h>
#include <neo.h>
#include <ch554.h>

#define PRESS_PULSE_LEN 16
#define U8_FULL_SCALE 255
#define BREATH_PHASE_HALF 128
#define BREATH_EASE_SHIFT 7
#define BREATH_EASE_SCALE (1 << BREATH_EASE_SHIFT)
#define BREATH_EASE_MAX (BREATH_EASE_SCALE - 1)
#define BREATH_EASE_ROUND (BREATH_EASE_SCALE >> 1)
#define BREATH_PERIOD_MIN_MS 500
#define BREATH_PERIOD_MAX_MS 3000

#if BREATH_PERIOD_MS < BREATH_PERIOD_MIN_MS || BREATH_PERIOD_MS > BREATH_PERIOD_MAX_MS
#error BREATH_PERIOD_MS must be between 500 and 3000
#endif
#if BREATH_MIN_DIVISOR < 2 || BREATH_MIN_DIVISOR > 255
#error BREATH_MIN_DIVISOR must be between 2 and 255
#endif

struct RGBColor colors[LED_COUNT];
uint8_t brightness[LED_COUNT];
static __xdata uint8_t pulse_t[LED_COUNT];
uint8_t pulse_en;
uint8_t cpulse_en;
static __xdata uint8_t cpulse_pre_bri[LED_COUNT];
static __xdata uint16_t cpulse_phase_accum[LED_COUNT];
static __xdata uint16_t cpulse_phase_increment[LED_COUNT];
static __xdata uint16_t cpulse_drop_coefficient[LED_COUNT];
uint16_t cpulse_period_ms[LED_COUNT];
uint8_t cpulse_min_divisor[LED_COUNT];
uint8_t auto_off_en;
uint8_t auto_off_index;
static uint16_t idle_ticks;
static uint8_t out_pending_mask; // bit i = LED i waiting fade-out commit
static uint8_t out_dirty;        // OUTPUT_CHANGE requested
static uint8_t out_settle;       // ticks to wait (coalesce RGB+bri HID pair)

// Per-LED fade gate + timed segment
static __xdata uint8_t led_fade[LED_COUNT];
static __xdata uint8_t led_fade_tgt[LED_COUNT];
static __xdata uint8_t out_dip_tgt[LED_COUNT];
static __xdata uint8_t out_return_tgt[LED_COUNT]; // luma after dip (usually start level)
static __xdata uint8_t fade_active[LED_COUNT];
static __xdata uint8_t fade_from[LED_COUNT];
static __xdata uint8_t fade_to[LED_COUNT];
static __xdata uint8_t fade_tick[LED_COUNT];
static __xdata uint8_t fade_len[LED_COUNT];

// What NeoPixel actually renders (lag behind config during fade transition)
static __xdata struct RGBColor show_c[LED_COUNT];
static __xdata uint8_t show_b[LED_COUNT];

static const uint8_t __code press_pulse_curve[PRESS_PULSE_LEN] = {
  200, 140, 100, 90, 100, 125, 155, 180,
  200, 218, 232, 242, 248, 252, 254, 255
};

// Exact match of former auto_off_sec_table[] (0,1,3,5, then 10..300 step 10).
static uint16_t auto_off_sec_from_index(uint8_t index) {
  if (index > AUTO_OFF_MAX_INDEX)
    index = AUTO_OFF_MAX_INDEX;
  if (index >= 4)
    return (uint16_t)(index - 3) * 10;
  if (index == 0)
    return 0;
  if (index == 1)
    return 1;
  if (index == 2)
    return 3;
  return 5;
}

static uint8_t leds_any_brightness(void) {
  return brightness[0] | brightness[1] | brightness[2];
}

static void commit_show_led(uint8_t led) {
  show_c[led].r = colors[led].r;
  show_c[led].g = colors[led].g;
  show_c[led].b = colors[led].b;
  show_b[led] = brightness[led];
}

static void commit_show_all(void) {
  uint8_t i;
  for (i = 0; i < LED_COUNT; i++)
    commit_show_led(i);
}

static uint8_t u8_diff(uint8_t a, uint8_t b) {
  return (a > b) ? (uint8_t)(a - b) : (uint8_t)(b - a);
}

// Max |Δ| bri/RGB for one LED (0..255).
static uint8_t output_distance_led(uint8_t led) {
  uint8_t m;
  uint8_t d;

  m = u8_diff(show_b[led], brightness[led]);
  d = u8_diff(show_c[led].r, colors[led].r);
  if (d > m)
    m = d;
  d = u8_diff(show_c[led].g, colors[led].g);
  if (d > m)
    m = d;
  d = u8_diff(show_c[led].b, colors[led].b);
  if (d > m)
    m = d;
  return m;
}

static void finish_out_pending_led(uint8_t led);

// |Δ|=255 → LIGHT_FADE_MAX_TICKS (= LIGHT_FADE_MAX_MS).
static void set_fade_tgt_led(uint8_t led, uint8_t tgt) {
  uint8_t dist;

  // No-op only if already at tgt (or actively fading toward it)
  if (tgt == led_fade_tgt[led] && (fade_active[led] || led_fade[led] == tgt))
    return;
  led_fade_tgt[led] = tgt;
  if (led_fade[led] == tgt) {
    fade_active[led] = 0;
    return;
  }
  fade_from[led] = led_fade[led];
  fade_to[led] = tgt;
  dist = u8_diff(fade_from[led], fade_to[led]);
  fade_len[led] = (uint8_t)(((uint16_t)dist * LIGHT_FADE_MAX_TICKS) / 255);
  if (fade_len[led] == 0)
    fade_len[led] = 1;
  fade_tick[led] = 0;
  fade_active[led] = 1;
}

static void set_fade_tgt_all(uint8_t tgt) {
  uint8_t i;
  for (i = 0; i < LED_COUNT; i++) {
    if (out_pending_mask & (1 << i))
      continue;
    // Don't yank LEDs mid color-transition segment
    if (fade_active[i])
      continue;
    set_fade_tgt_led(i, tgt);
  }
}

static void finish_out_pending_led(uint8_t led) {
  commit_show_led(led);
  out_pending_mask &= (uint8_t)~(1 << led);
  set_fade_tgt_led(led, out_return_tgt[led]);
}

// (value * (factor+1)) >> 8 — same as former scale/fade/output helpers.
static uint8_t u8_mul_scale(uint8_t value, uint8_t factor) {
  return (uint8_t)(((uint16_t)value * ((uint16_t)factor + 1)) >> 8);
}

static uint8_t scale_color(uint8_t value, uint8_t led) {
  return u8_mul_scale(value, show_b[led]);
}

static uint8_t apply_led_fade(uint8_t value, uint8_t led) {
  return u8_mul_scale(value, led_fade[led]);
}

static uint16_t breath_period_to_increment(uint16_t period_ms) {
  uint16_t ticks = period_ms / LIGHT_LOOP_MS;
  return (uint16_t)(65535U / ticks);
}

static uint16_t breath_divisor_to_coefficient(uint8_t divisor) {
  uint16_t drop_scale = U8_FULL_SCALE - (U8_FULL_SCALE / divisor);
  return (uint16_t)(((drop_scale * BREATH_EASE_SCALE) +
                     BREATH_EASE_MAX - 1) / BREATH_EASE_MAX);
}

// Algorithmic breathing: full brightness → configured fraction → full.
// x is triangular distance from peak; x*(full-x) creates smooth easing.
static uint8_t breath_factor(uint8_t phase, uint16_t drop_coefficient) {
  uint8_t x;
  uint8_t smooth;
  uint8_t drop;
  x = phase < BREATH_PHASE_HALF
          ? phase
          : (uint8_t)(U8_FULL_SCALE - phase);
  smooth = (uint8_t)(((uint16_t)x *
                      (uint16_t)(U8_FULL_SCALE - x)) >> BREATH_EASE_SHIFT);
  drop = (uint8_t)(((drop_coefficient * smooth) +
                    BREATH_EASE_ROUND) >> BREATH_EASE_SHIFT);
  return (uint8_t)(U8_FULL_SCALE - drop);
}

// Apply pulse after gamma correction: equal PWM scaling on R/G/B preserves hue.
static uint8_t apply_output_factor(uint8_t value, uint8_t factor) {
  if (factor == U8_FULL_SCALE)
    return value;
  return u8_mul_scale(value, factor);
}

static void leds_fade_tick(void) {
  uint8_t i;

  for (i = 0; i < LED_COUNT; i++) {
    if (fade_active[i]) {
      fade_tick[i]++;
      if (fade_tick[i] >= fade_len[i]) {
        led_fade[i] = fade_to[i];
        fade_active[i] = 0;
      } else if (fade_to[i] >= fade_from[i]) {
        led_fade[i] = (uint8_t)(fade_from[i] +
                                 (((uint16_t)(fade_to[i] - fade_from[i]) * fade_tick[i]) /
                                  fade_len[i]));
      } else {
        led_fade[i] = (uint8_t)(fade_from[i] -
                                 (((uint16_t)(fade_from[i] - fade_to[i]) * fade_tick[i]) /
                                  fade_len[i]));
      }
    }

    if ((out_pending_mask & (1 << i)) && !fade_active[i] &&
        led_fade[i] == out_dip_tgt[i])
      finish_out_pending_led(i);
  }
}

static void do_wake(void) {
  idle_ticks = 0;
  if (leds_any_brightness())
    set_fade_tgt_all(255);
  else
    set_fade_tgt_all(0);
}

static void do_output_change(void) {
  uint8_t i;
  uint8_t dist;
  uint8_t start;

  idle_ticks = 0;
  for (i = 0; i < LED_COUNT; i++) {
    dist = output_distance_led(i);
    if (dist == 0) {
      if (!(out_pending_mask & (1 << i)))
        commit_show_led(i);
      continue;
    }

    // Fresh transition for this LED (coalesced RGB+bri already in globals)
    out_pending_mask |= (uint8_t)(1 << i);

    if (!brightness[i]) {
      out_dip_tgt[i] = 0;
      out_return_tgt[i] = 0;
    } else if (led_fade[i] == 0) {
      out_dip_tgt[i] = 0;
      out_return_tgt[i] = 255;
    } else {
      start = led_fade[i];
      out_return_tgt[i] = start;
      out_dip_tgt[i] = (uint8_t)(start / 3);
    }

    set_fade_tgt_led(i, out_dip_tgt[i]);

    if (led_fade[i] == out_dip_tgt[i])
      finish_out_pending_led(i);
  }
}

static void do_pulse_led(uint8_t led) {
  if (led < LED_COUNT && (pulse_en & (1 << led)) &&
      !(cpulse_en & (1 << led)) && !(fn_mask & (1 << led)))
    pulse_t[led] = PRESS_PULSE_LEN;
}

static void do_set_pulse(uint8_t mask) {
  pulse_en = mask & 0x07;
}

static void do_set_auto_off(uint8_t en, uint8_t index) {
  uint8_t new_en = en & 1;
  uint8_t new_idx = index;

  if (new_idx > AUTO_OFF_MAX_INDEX)
    new_idx = AUTO_OFF_MAX_INDEX;

  // No-op updates must NOT wake/yank fades (host resends auto-off on every /api/rgb)
  if (new_en == auto_off_en && new_idx == auto_off_index)
    return;

  auto_off_en = new_en;
  auto_off_index = new_idx;
  do_wake();
}

void light_set_cpulse_led(uint8_t led, uint8_t en, uint16_t period_ms,
                         uint8_t min_divisor) {
  uint8_t bit;

  cpulse_period_ms[led] = period_ms;
  cpulse_min_divisor[led] = min_divisor;
  cpulse_phase_increment[led] = breath_period_to_increment(period_ms);
  cpulse_drop_coefficient[led] = breath_divisor_to_coefficient(min_divisor);

  bit = (uint8_t)(1 << led);
  if (en && !(cpulse_en & bit)) {
    cpulse_pre_bri[led] = brightness[led];
    cpulse_en |= bit;
    pulse_t[led] = 0;
    cpulse_phase_accum[led] = 0;
  } else if (!en && (cpulse_en & bit)) {
    cpulse_en &= ~bit;
    pulse_t[led] = 0;
    cpulse_phase_accum[led] = 0;
    brightness[led] = cpulse_pre_bri[led];
    out_dirty = 1;
    out_settle = 2;
  }
}

static void leds_idle_tick(void) {
  uint16_t limit;
  uint16_t sec;
  uint8_t i;

  if (!leds_any_brightness()) {
    set_fade_tgt_all(0);
    return;
  }

  // Continuous breathing is an explicit active state; auto-off must not stop it.
  if (cpulse_en) {
    idle_ticks = 0;
    set_fade_tgt_all(255);
    return;
  }

  if (!auto_off_en) {
    // Stay on: only lift LEDs that are fully off — never fight active fades
    for (i = 0; i < LED_COUNT; i++) {
      if (out_pending_mask & (1 << i))
        continue;
      if (fade_active[i])
        continue;
      if (brightness[i] && led_fade[i] == 0 && led_fade_tgt[i] == 0)
        set_fade_tgt_led(i, 255);
    }
    return;
  }

  if (key_sm_any_activity()) {
    idle_ticks = 0;
    set_fade_tgt_all(255);
    return;
  }

  for (i = 0; i < LED_COUNT; i++) {
    if (!(out_pending_mask & (1 << i)) && !fade_active[i] && led_fade_tgt[i] != 0)
      break;
  }
  if (i >= LED_COUNT)
    return;

  sec = auto_off_sec_from_index(auto_off_index);
  if (sec == 0) {
    set_fade_tgt_all(0);
    return;
  }
  limit = sec * LIGHT_TICKS_PER_SEC;
  if (idle_ticks < 65535)
    idle_ticks++;
  if (idle_ticks >= limit)
    set_fade_tgt_all(0);
}

static void neo_update(void) {
  uint8_t i;
  uint8_t factor;
  uint8_t nr[LED_COUNT], ng[LED_COUNT], nb[LED_COUNT];

  // Pre-compute all 9 channel values BEFORE EA=0 — keeps inter-LED gap <5µs.
  // If computed inside EA=0, apply_led_fade slow-path (~200 cyc) during LED2 dip
  // pushes LED1→LED2 gap to ~50µs, crossing WS2812 reset threshold → premature
  // latch mid-frame → LEDs 0,1 flicker with LED1's shift-register data.
  for (i = 0; i < LED_COUNT; i++) {
    if (led_fade[i] == 0) {
      nr[i] = 0; ng[i] = 0; nb[i] = 0;
    } else if (fn_mask & (1 << i)) {
      uint8_t v = apply_led_fade(255, i);
      v = NEO_gamma8(v);
      nr[i] = v; ng[i] = v; nb[i] = v;
    } else {
      if (cpulse_en & (1 << i))
        factor = breath_factor((uint8_t)(cpulse_phase_accum[i] >> 8),
                               cpulse_drop_coefficient[i]);
      else if (pulse_t[i])
        factor = press_pulse_curve[PRESS_PULSE_LEN - pulse_t[i]];
      else
        factor = U8_FULL_SCALE;
      nr[i] = apply_output_factor(
          NEO_gamma8(apply_led_fade(scale_color(show_c[i].r, i), i)), factor);
      ng[i] = apply_output_factor(
          NEO_gamma8(apply_led_fade(scale_color(show_c[i].g, i), i)), factor);
      nb[i] = apply_output_factor(
          NEO_gamma8(apply_led_fade(scale_color(show_c[i].b, i), i)), factor);
    }
  }

  EA = 0;
  for (i = 0; i < LED_COUNT; i++)
    NEO_writeRawColor(nr[i], ng[i], nb[i]);
  EA = 1;

  for (i = 0; i < LED_COUNT; i++)
    if (pulse_t[i])
      pulse_t[i]--;

  // Fixed-point phase: short periods skip imperceptible levels; long periods
  // repeat levels. Phase wraps naturally at 16 bits with no endpoint blink.
  for (i = 0; i < LED_COUNT; i++)
    if (cpulse_en & (1 << i))
      cpulse_phase_accum[i] += cpulse_phase_increment[i];
  leds_fade_tick();
}

void light_init(void) {
  uint8_t i;
  for (i = 0; i < LED_COUNT; i++) {
    pulse_t[i] = 0;
    cpulse_pre_bri[i] = 0;
    cpulse_phase_accum[i] = 0;
    cpulse_period_ms[i] = BREATH_PERIOD_MS;
    cpulse_min_divisor[i] = BREATH_MIN_DIVISOR;
    cpulse_phase_increment[i] = breath_period_to_increment(BREATH_PERIOD_MS);
    cpulse_drop_coefficient[i] =
        breath_divisor_to_coefficient(BREATH_MIN_DIVISOR);
    led_fade[i] = 0;
    led_fade_tgt[i] = 0;
    out_dip_tgt[i] = 0;
    out_return_tgt[i] = 0;
    fade_active[i] = 0;
  }
  commit_show_all();
  out_pending_mask = 0;
  out_dirty = 0;
  out_settle = 0;
  idle_ticks = 0;
  cpulse_en = 0;
}

void light_rqt(uint8_t rqt, uint8_t src) {
  (void)src;
  switch (rqt) {
  case LIGHT_RQT_WAKE:
    do_wake();
    break;
  case LIGHT_RQT_OUTPUT_CHANGE:
    // Coalesce back-to-back SET_RGB + SET_BRIGHTNESS into one fade
    out_dirty = 1;
    out_settle = 2; // ~10 ms @ 5 ms/tick
    break;
  default:
    break;
  }
}

void light_rqt_u8(uint8_t rqt, uint8_t src, uint8_t a) {
  (void)src;
  switch (rqt) {
  case LIGHT_RQT_PULSE_LED:
    do_pulse_led(a);
    break;
  case LIGHT_RQT_SET_PULSE:
    do_set_pulse(a);
    break;
  default:
    break;
  }
}

void light_rqt_u8_u8(uint8_t rqt, uint8_t src, uint8_t a, uint8_t b) {
  (void)src;
  switch (rqt) {
  case LIGHT_RQT_SET_AUTO_OFF:
    do_set_auto_off(a, b);
    break;
  default:
    break;
  }
}

void light_set_rgb_led(uint8_t led, uint8_t r, uint8_t g, uint8_t b) {
  if (led >= LED_COUNT)
    return;
  colors[led].r = r;
  colors[led].g = g;
  colors[led].b = b;
}

void light_set_brightness_led(uint8_t led, uint8_t bri) {
  if (led >= LED_COUNT)
    return;
  brightness[led] = bri;
}

void light_set_brightness_all(uint8_t bri) {
  uint8_t i;
  for (i = 0; i < LED_COUNT; i++)
    brightness[i] = bri;
}

void light_tick(void) {
  leds_idle_tick();
  if (out_dirty) {
    if (out_settle)
      out_settle--;
    else {
      out_dirty = 0;
      do_output_change();
    }
  }
  neo_update();
}
