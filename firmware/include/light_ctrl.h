// light_ctrl — LED request API (FILO-lite controller pattern).
// Dispatch: switch (no fn-pointers; SDCC mcs51). HAL = neo.h.
//
// Tunable fade: change ONLY LIGHT_FADE_MAX_MS — ticks/duration derive from it.
// Fade is per-LED (only LEDs whose RGB/bri changed animate).
#pragma once

#include <stdint.h>
#include "protocol.h"

// --- Fade timing (single knob) -----------------------------------------------
// Max one-way fade when |Δ|=255. Shorter deltas scale down proportionally.
#define LIGHT_FADE_MAX_MS    300
// Must match main-loop period (DLY_ms in 3keys_1knob.c).
#define LIGHT_LOOP_MS        5
#define LIGHT_FADE_MAX_TICKS (LIGHT_FADE_MAX_MS / LIGHT_LOOP_MS)
#define LIGHT_TICKS_PER_SEC  (1000 / LIGHT_LOOP_MS)
// -----------------------------------------------------------------------------

#define LIGHT_SRC_USER      0
#define LIGHT_SRC_EXTERNAL  1
#define LIGHT_SRC_INTERNAL  2

#define LIGHT_RQT_WAKE           0
#define LIGHT_RQT_OUTPUT_CHANGE  1
#define LIGHT_RQT_PULSE_LED      2
#define LIGHT_RQT_SET_PULSE      3
#define LIGHT_RQT_SET_AUTO_OFF   4
#define LIGHT_RQT_SET_CPULSE     5

struct RGBColor {
  uint8_t r;
  uint8_t g;
  uint8_t b;
};

extern struct RGBColor colors[LED_COUNT];
extern uint8_t brightness[LED_COUNT];
extern uint8_t pulse_en;
extern uint8_t cpulse_en;
extern uint8_t auto_off_en;
extern uint8_t auto_off_index;

void light_init(void);
void light_rqt(uint8_t rqt, uint8_t src);
void light_rqt_u8(uint8_t rqt, uint8_t src, uint8_t a);
void light_rqt_u8_u8(uint8_t rqt, uint8_t src, uint8_t a, uint8_t b);
void light_set_rgb_led(uint8_t led, uint8_t r, uint8_t g, uint8_t b);
void light_set_brightness_led(uint8_t led, uint8_t bri);
void light_set_brightness_all(uint8_t bri);
void light_tick(void);

uint8_t auto_off_index_from_sec(uint16_t sec);
