// key_sm — LT tap/hold + non-LT press/release (switch dispatch).
#include <key_sm.h>
#include <light_ctrl.h>
#include <delay.h>
#include <system.h>
#include <usb_conkbd.h>

__xdata struct binding layers[LAYER_COUNT][KEY_COUNT];
__xdata struct binding l0_step1[KEY_COUNT];
uint8_t lt_mask;
uint8_t fn_mask;

static __xdata uint8_t key_state[KEY_COUNT];
static __xdata uint8_t key_last[KEY_COUNT];
static __xdata uint8_t key_raw[KEY_COUNT];
static __xdata uint8_t key_db[KEY_COUNT];
static __xdata uint8_t hold_cnt[LT_KEY_COUNT];
static __xdata uint8_t armed_layer[KEY_COUNT];
static __xdata uint8_t armed_seq[KEY_COUNT];
static __xdata uint8_t key_led[KEY_COUNT]; // LED index for pulse; 0xff = none

void copy_layer(uint8_t dst, uint8_t src) {
  uint8_t i;
  for (i = 0; i < KEY_COUNT; i++) {
    layers[dst][i].mod = layers[src][i].mod;
    layers[dst][i].type = layers[src][i].type;
    layers[dst][i].code = layers[src][i].code;
  }
}

void sanitize_binding(__xdata struct binding *b) {
  if (b->type > MOUSE)
    b->type = KEYBOARD;
}

void binding_press(__xdata struct binding *b) {
  if (b->type == KEYBOARD)
    KBD_code_press(b->mod, b->code);
  else if (b->type == CONSUMER)
    CON_press(b->code);
  else
    MOUSE_press(b->code);
}

void binding_release(__xdata struct binding *b) {
  if (b->type == KEYBOARD)
    KBD_code_release(b->mod, b->code);
  else if (b->type == CONSUMER)
    CON_release(b->code);
  else
    MOUSE_release(b->code);
}

void binding_tap(__xdata struct binding *b) {
  if (b->type == KEYBOARD)
    KBD_code_type(b->mod, b->code);
  else if (b->type == CONSUMER)
    CON_type(b->code);
  else
    MOUSE_type(b->code);
}

uint8_t binding_active(__xdata struct binding *b) {
  return b->code || b->mod || b->type;
}

void binding_play_l0(uint8_t idx) {
  binding_tap(&layers[0][idx]);
  if (binding_active(&l0_step1[idx])) {
    DLY_ms(SEQ_GAP_MS);
    WDT_reset();
    binding_tap(&l0_step1[idx]);
  }
}

uint8_t key_sm_active_layer(void) {
  uint8_t i;
  for (i = 0; i < LT_KEY_COUNT; i++) {
    if (fn_mask & (1 << i))
      return (uint8_t)(1 + i);
  }
  return 0;
}

uint8_t key_sm_any_activity(void) {
  return key_last[0] || key_last[1] || key_last[2] || key_last[3] || fn_mask;
}

void key_sm_event(uint8_t idx, uint8_t ev) {
  uint8_t st;
  uint8_t lt;
  uint8_t led;

  if (idx >= KEY_COUNT)
    return;

  st = key_state[idx];
  lt = (idx < LT_KEY_COUNT) && (lt_mask & (1 << idx));

  if (st == KEY_ST_IDLE && ev == KEY_EV_PRESS) {
    led = key_led[idx];
    light_rqt(LIGHT_RQT_WAKE, LIGHT_SRC_USER);
    light_rqt_u8(LIGHT_RQT_PULSE_LED, LIGHT_SRC_USER, led);
    if (lt) {
      hold_cnt[idx] = 0;
      armed_seq[idx] = 0;
    } else {
      armed_layer[idx] = key_sm_active_layer();
      if (armed_layer[idx] == 0 && binding_active(&l0_step1[idx])) {
        binding_play_l0(idx);
        armed_seq[idx] = 1;
      } else {
        binding_press(&layers[armed_layer[idx]][idx]);
        armed_seq[idx] = 0;
      }
    }
    key_state[idx] = KEY_ST_PRESSED;
    return;
  }

  if (st == KEY_ST_PRESSED && ev == KEY_EV_TICK) {
    if (lt) {
      if (hold_cnt[idx] < 255)
        hold_cnt[idx]++;
      if (hold_cnt[idx] >= HOLD_TICKS) {
        fn_mask |= (1 << idx);
        key_state[idx] = KEY_ST_FN_HELD;
      }
    }
    return;
  }

  if ((st == KEY_ST_PRESSED || st == KEY_ST_FN_HELD) && ev == KEY_EV_RELEASE) {
    if (lt) {
      if (st == KEY_ST_FN_HELD)
        fn_mask &= ~(1 << idx);
      else if (hold_cnt[idx] >= MIN_TAP_TICKS)
        binding_play_l0(idx);
      hold_cnt[idx] = 0;
    } else if (!armed_seq[idx]) {
      binding_release(&layers[armed_layer[idx]][idx]);
    }
    armed_seq[idx] = 0;
    key_state[idx] = KEY_ST_IDLE;
  }
}

void key_sm_debounced(uint8_t idx, uint8_t raw, uint8_t led) {
  if (idx >= KEY_COUNT)
    return;
  key_led[idx] = led;

  if (raw != key_raw[idx]) {
    key_raw[idx] = raw;
    key_db[idx] = 0;
    return;
  }
  if (key_db[idx] < DEBOUNCE_TICKS) {
    key_db[idx]++;
    if (key_db[idx] < DEBOUNCE_TICKS)
      return;
  }

  if (raw && !key_last[idx])
    key_sm_event(idx, KEY_EV_PRESS);
  else if (raw && key_last[idx])
    key_sm_event(idx, KEY_EV_TICK);
  else if (!raw && key_last[idx])
    key_sm_event(idx, KEY_EV_RELEASE);

  key_last[idx] = raw;
}

void key_sm_init(void) {
  uint8_t i;
  fn_mask = 0;
  for (i = 0; i < KEY_COUNT; i++) {
    key_state[i] = KEY_ST_IDLE;
    key_last[i] = 0;
    key_raw[i] = 0;
    key_db[i] = 0;
    armed_layer[i] = 0;
    armed_seq[i] = 0;
    key_led[i] = 0xff;
  }
  for (i = 0; i < LT_KEY_COUNT; i++)
    hold_cnt[i] = 0;
}
