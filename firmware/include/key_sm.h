// key_sm — per-key state machine (FILO-lite state_event pattern).
// States: IDLE / PRESSED / FN_HELD. Events: PRESS / RELEASE / TICK.
// Dispatch: switch (no fn-pointers; SDCC mcs51).
#pragma once

#include <stdint.h>
#include "protocol.h"

#define KEYBOARD 0
#define CONSUMER 1
#define MOUSE 2

#define HOLD_TICKS 40   // ~200 ms @ 5 ms/loop — enter Fn, never emit tap
#define MIN_TAP_TICKS 4 // ~20 ms — ignore bounce "releases" as taps
#define DEBOUNCE_TICKS 2
#define SEQ_GAP_MS 40   // delay between sequential L0 taps

#define KEY_ST_IDLE    0
#define KEY_ST_PRESSED 1
#define KEY_ST_FN_HELD 2

#define KEY_EV_PRESS   0
#define KEY_EV_RELEASE 1
#define KEY_EV_TICK    2

struct binding {
  uint8_t mod;
  uint8_t type;
  uint8_t code;
};

extern __xdata struct binding layers[LAYER_COUNT][KEY_COUNT];
extern __xdata struct binding l0_step1[KEY_COUNT];
extern uint8_t lt_mask;
extern uint8_t fn_mask;

void key_sm_init(void);
void key_sm_event(uint8_t idx, uint8_t ev);
void key_sm_debounced(uint8_t idx, uint8_t raw, uint8_t led);
uint8_t key_sm_active_layer(void);
uint8_t key_sm_any_activity(void);

void binding_press(__xdata struct binding *b);
void binding_release(__xdata struct binding *b);
void binding_tap(__xdata struct binding *b);
uint8_t binding_active(__xdata struct binding *b);
void binding_play_l0(uint8_t idx);
void sanitize_binding(__xdata struct binding *b);
void copy_layer(uint8_t dst, uint8_t src);
