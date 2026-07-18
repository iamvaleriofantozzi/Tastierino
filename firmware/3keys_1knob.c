// CH552 RGB MacroPad firmware: keyboard, encoder and bidirectional Raw HID.
// Architecture: key_sm (LT state machine) + light_ctrl (LED requests) + main wiring.

#include <config.h>
#include <delay.h>
#include <key_sm.h>
#include <light_ctrl.h>
#include <neo.h>
#include <protocol.h>
#include <system.h>
#include <usb_conkbd.h>
#include <usb_descr.h>

void USB_interrupt(void);
void USB_ISR(void) __interrupt(INT_NO_USB) { USB_interrupt(); }

#define EEPROM_MAGIC_0 0x4d
#define EEPROM_MAGIC_1 0x50
#define EEPROM_VERSION 8
#define EEPROM_SIZE 128

__xdata uint8_t rawPacket[RAW_PACKET_SIZE];

// Power-on white/blue wave pulse (before USB). Host replays after flash.
#define BOOT_WAVE_FRAMES 240
#define BOOT_WAVE_SPEED 3
#define BOOT_WAVE_PHASE 85 // ~256/3 — crest lag between keys

void boot_wave_pulse(void) {
  uint16_t frame;
  uint8_t i;
  uint8_t phase;
  uint8_t t;
  uint8_t mix;
  uint8_t r;
  uint8_t g;

  for (frame = 0; frame < BOOT_WAVE_FRAMES; frame++) {
    phase = (uint8_t)(frame * BOOT_WAVE_SPEED);
    EA = 0;
    for (i = 0; i < LED_COUNT; i++) {
      t = phase + i * BOOT_WAVE_PHASE;
      if (t < 128)
        mix = t << 1;
      else
        mix = (uint8_t)((255 - t) << 1);
      r = mix;
      g = 50 + (uint8_t)(((uint16_t)205 * mix) >> 8);
      NEO_writeColor(r, g, 255);
    }
    EA = 1;
    DLY_ms(12);
    WDT_reset();
  }
}

uint8_t eeprom_read_byte(uint8_t addr) {
  ROM_ADDR_H = DATA_FLASH_ADDR >> 8;
  ROM_ADDR_L = addr << 1;
  ROM_CTRL = ROM_CMD_READ;
  return ROM_DATA_L;
}

void eeprom_write_byte(__data uint8_t addr, __xdata uint8_t val) {
  if (addr >= 128)
    return;
  SAFE_MOD = 0x55;
  SAFE_MOD = 0xAA;
  GLOBAL_CFG |= bDATA_WE;
  SAFE_MOD = 0;
  ROM_ADDR_H = DATA_FLASH_ADDR >> 8;
  ROM_ADDR_L = addr << 1;
  ROM_DATA_L = val;
  if (ROM_STATUS & bROM_ADDR_OK)
    ROM_CTRL = ROM_CMD_WRITE;
  SAFE_MOD = 0x55;
  SAFE_MOD = 0xAA;
  GLOBAL_CFG &= ~bDATA_WE;
  SAFE_MOD = 0;
}

void defaults_load(void) {
  uint8_t i;
  uint8_t layer;
  for (layer = 0; layer < LAYER_COUNT; layer++) {
    for (i = 0; i < KEY_COUNT; i++) {
      layers[layer][i].mod = 0;
      layers[layer][i].type = KEYBOARD;
      layers[layer][i].code = 0;
    }
  }
  layers[0][0].code = 0x68; // F13
  layers[0][1].code = 0x69; // F14
  layers[0][2].code = 0x6a; // F15
  layers[0][3].type = CONSUMER;
  layers[0][3].code = 0xe2; // mute
  layers[0][4].type = CONSUMER;
  layers[0][4].code = 0xe9; // volume up
  layers[0][5].type = CONSUMER;
  layers[0][5].code = 0xea; // volume down

  layers[1][0].code = 0x6b; // F16
  layers[1][1].code = 0x6c; // F17
  layers[1][2].code = 0x6d; // F18
  layers[1][3].type = CONSUMER;
  layers[1][3].code = 0xcd; // play/pause
  layers[1][4].type = CONSUMER;
  layers[1][4].code = 0xb5; // next
  layers[1][5].type = CONSUMER;
  layers[1][5].code = 0xb6; // prev
  for (layer = 2; layer < LAYER_COUNT; layer++)
    copy_layer(layer, 1);

  for (i = 0; i < KEY_COUNT; i++) {
    l0_step1[i].mod = 0;
    l0_step1[i].type = KEYBOARD;
    l0_step1[i].code = 0;
  }

  colors[0].r = 0; colors[0].g = 80; colors[0].b = 255;
  colors[1].r = 0; colors[1].g = 255; colors[1].b = 80;
  colors[2].r = 255; colors[2].g = 20; colors[2].b = 0;
  for (i = 0; i < LED_COUNT; i++)
    brightness[i] = 160;
  pulse_en = 0x07;
  lt_mask = 0x00;
  auto_off_en = 0;
  auto_off_index = 9; // 60s
}

uint8_t config_checksum(void) {
  uint8_t i;
  uint8_t value = EEPROM_VERSION;
  for (i = 4; i < EEPROM_SIZE; i++)
    value ^= eeprom_read_byte(i);
  return value;
}

static void eeprom_load_binding(__xdata struct binding *b, uint8_t addr) {
  b->mod = eeprom_read_byte(addr);
  b->type = eeprom_read_byte((uint8_t)(addr + 1));
  b->code = eeprom_read_byte((uint8_t)(addr + 2));
  sanitize_binding(b);
}

static void eeprom_load_layer_keys(uint8_t layer, uint8_t base) {
  uint8_t i;
  for (i = 0; i < KEY_COUNT; i++)
    eeprom_load_binding(&layers[layer][i], (uint8_t)(base + i * KEY_FIELDS));
}

static void eeprom_store_binding(__xdata struct binding *b, uint8_t addr) {
  eeprom_write_byte(addr, b->mod);
  eeprom_write_byte((uint8_t)(addr + 1), b->type);
  eeprom_write_byte((uint8_t)(addr + 2), b->code);
}

void config_load(void) {
  uint8_t i;
  uint8_t layer;

  if (eeprom_read_byte(0) != EEPROM_MAGIC_0 ||
      eeprom_read_byte(1) != EEPROM_MAGIC_1 ||
      eeprom_read_byte(2) != EEPROM_VERSION ||
      eeprom_read_byte(3) != config_checksum()) {
    defaults_load();
    return;
  }

  eeprom_load_layer_keys(0, 4);
  for (i = 0; i < KEY_COUNT; i++)
    eeprom_load_binding(&l0_step1[i], (uint8_t)(22 + i * KEY_FIELDS));
  for (layer = 1; layer < LAYER_COUNT; layer++)
    eeprom_load_layer_keys(layer, (uint8_t)(22 + layer * 18));

  for (i = 0; i < LED_COUNT; i++) {
    colors[i].r = eeprom_read_byte((uint8_t)(112 + i * RGB_FIELDS));
    colors[i].g = eeprom_read_byte((uint8_t)(113 + i * RGB_FIELDS));
    colors[i].b = eeprom_read_byte((uint8_t)(114 + i * RGB_FIELDS));
  }
  brightness[0] = eeprom_read_byte(121);
  brightness[1] = eeprom_read_byte(122);
  brightness[2] = eeprom_read_byte(123);
  pulse_en = eeprom_read_byte(124) & 0x07;
  lt_mask = eeprom_read_byte(125) & 0x0f;
  auto_off_en = eeprom_read_byte(126) & 1;
  auto_off_index = eeprom_read_byte(127);
  if (auto_off_index > AUTO_OFF_MAX_INDEX)
    auto_off_index = AUTO_OFF_MAX_INDEX;
}

void config_save(void) {
  uint8_t i;
  uint8_t layer;
  eeprom_write_byte(0, EEPROM_MAGIC_0);
  eeprom_write_byte(1, EEPROM_MAGIC_1);
  eeprom_write_byte(2, EEPROM_VERSION);
  for (i = 0; i < KEY_COUNT; i++) {
    eeprom_store_binding(&layers[0][i], (uint8_t)(4 + i * KEY_FIELDS));
    eeprom_store_binding(&l0_step1[i], (uint8_t)(22 + i * KEY_FIELDS));
  }
  for (layer = 1; layer < LAYER_COUNT; layer++) {
    for (i = 0; i < KEY_COUNT; i++)
      eeprom_store_binding(&layers[layer][i],
                           (uint8_t)(22 + layer * 18 + i * KEY_FIELDS));
  }
  for (i = 0; i < LED_COUNT; i++) {
    eeprom_write_byte((uint8_t)(112 + i * RGB_FIELDS), colors[i].r);
    eeprom_write_byte((uint8_t)(113 + i * RGB_FIELDS), colors[i].g);
    eeprom_write_byte((uint8_t)(114 + i * RGB_FIELDS), colors[i].b);
  }
  eeprom_write_byte(121, brightness[0]);
  eeprom_write_byte(122, brightness[1]);
  eeprom_write_byte(123, brightness[2]);
  eeprom_write_byte(124, pulse_en & 0x07);
  eeprom_write_byte(125, lt_mask & 0x0f);
  eeprom_write_byte(126, auto_off_en & 1);
  eeprom_write_byte(127, auto_off_index > AUTO_OFF_MAX_INDEX ? AUTO_OFF_MAX_INDEX
                                                             : auto_off_index);
  eeprom_write_byte(3, config_checksum());
}

void raw_response(uint8_t command, uint8_t status) {
  uint8_t i;
  for (i = 0; i < RAW_PACKET_SIZE; i++)
    rawPacket[i] = 0;
  rawPacket[0] = command | CMD_RESPONSE;
  rawPacket[1] = status;
}

static uint8_t raw_require(uint8_t command, uint8_t count, uint8_t min) {
  if (count < min) {
    raw_response(command, STATUS_BAD_LENGTH);
    return 0;
  }
  return 1;
}

static void raw_ok_output(uint8_t command) {
  light_rqt(LIGHT_RQT_OUTPUT_CHANGE, LIGHT_SRC_EXTERNAL);
  raw_response(command, STATUS_OK);
}

static __xdata struct binding *layer_slot(uint8_t layer, uint8_t step,
                                          uint8_t i) {
  if (layer == 0 && step == 1)
    return &l0_step1[i];
  return &layers[layer][i];
}

void pack_layer(uint8_t layer, uint8_t step, uint8_t offset) {
  uint8_t i;
  __xdata struct binding *src;
  for (i = 0; i < KEY_COUNT; i++) {
    src = layer_slot(layer, step, i);
    rawPacket[offset + i * 3] = src->mod;
    rawPacket[offset + 1 + i * 3] = src->type;
    rawPacket[offset + 2 + i * 3] = src->code;
  }
}

void unpack_layer(uint8_t layer, uint8_t step, uint8_t offset) {
  uint8_t i;
  __xdata struct binding *dst;
  for (i = 0; i < KEY_COUNT; i++) {
    dst = layer_slot(layer, step, i);
    dst->mod = rawPacket[offset + i * 3];
    dst->type = rawPacket[offset + 1 + i * 3] > MOUSE ? 0 : rawPacket[offset + 1 + i * 3];
    dst->code = rawPacket[offset + 2 + i * 3];
  }
}

void raw_handle(void) {
  uint8_t count = HID_available();
  uint8_t command;
  uint8_t i;
  uint8_t layer;
  uint8_t step;
  uint8_t data_off;
  uint16_t period_ms;
  if (!count)
    return;
  for (i = 0; i < count && i < RAW_PACKET_SIZE; i++)
    rawPacket[i] = HID_read();
  HID_ack();
  command = rawPacket[0];

  switch (command) {
  case CMD_SET_RGB:
    if (!raw_require(command, count, 10))
      break;
    for (i = 0; i < LED_COUNT; i++)
      light_set_rgb_led(i, rawPacket[1 + i * 3], rawPacket[2 + i * 3],
                        rawPacket[3 + i * 3]);
    raw_ok_output(command);
    break;

  case CMD_SET_BRIGHTNESS:
    if (!raw_require(command, count, 2))
      break;
    if (count >= 4) {
      for (i = 0; i < LED_COUNT; i++)
        light_set_brightness_led(i, rawPacket[1 + i]);
    } else {
      light_set_brightness_all(rawPacket[1]);
    }
    raw_ok_output(command);
    break;

  case CMD_SET_RGB_LED:
    if (!raw_require(command, count, 5))
      break;
    if (rawPacket[1] >= LED_COUNT) {
      raw_response(command, STATUS_BAD_COMMAND);
      break;
    }
    light_set_rgb_led(rawPacket[1], rawPacket[2], rawPacket[3], rawPacket[4]);
    raw_ok_output(command);
    break;

  case CMD_SET_BRIGHTNESS_LED:
    if (!raw_require(command, count, 3))
      break;
    if (rawPacket[1] >= LED_COUNT) {
      raw_response(command, STATUS_BAD_COMMAND);
      break;
    }
    light_set_brightness_led(rawPacket[1], rawPacket[2]);
    raw_ok_output(command);
    break;

  case CMD_SET_CPULSE_LED:
    period_ms = (uint16_t)rawPacket[3] | ((uint16_t)rawPacket[4] << 8);
    if (!raw_require(command, count, 6))
      break;
    if (rawPacket[1] >= LED_COUNT || period_ms < 500 || period_ms > 3000 ||
        rawPacket[5] < 2) {
      raw_response(command, STATUS_BAD_COMMAND);
      break;
    }
    light_set_cpulse_led(rawPacket[1], rawPacket[2], period_ms, rawPacket[5]);
    raw_response(command, STATUS_OK);
    break;

  case CMD_SET_KEYMAP:
    step = 0;
    data_off = 2;
    if (count >= 21) {
      step = rawPacket[2];
      data_off = 3;
    }
    if (!raw_require(command, count, (uint8_t)(data_off + 18)))
      break;
    if (rawPacket[1] >= LAYER_COUNT || step >= MACRO_STEPS ||
        (step > 0 && rawPacket[1] != 0)) {
      raw_response(command, STATUS_BAD_COMMAND);
      break;
    }
    unpack_layer(rawPacket[1], step, data_off);
    raw_response(command, STATUS_OK);
    break;

  case CMD_GET_KEYMAP:
    step = (count >= 3) ? rawPacket[2] : 0;
    if (!raw_require(command, count, 2))
      break;
    if (rawPacket[1] >= LAYER_COUNT || step >= MACRO_STEPS ||
        (step > 0 && rawPacket[1] != 0)) {
      raw_response(command, STATUS_BAD_COMMAND);
      break;
    }
    layer = rawPacket[1];
    raw_response(command, STATUS_OK);
    rawPacket[2] = layer;
    rawPacket[3] = step;
    pack_layer(layer, step, 4);
    break;

  case CMD_SET_LT_MASK:
    if (!raw_require(command, count, 2))
      break;
    lt_mask = rawPacket[1] & 0x0f;
    raw_response(command, STATUS_OK);
    break;

  case CMD_SAVE_CONFIG:
    config_save();
    raw_response(command, STATUS_OK);
    break;

  case CMD_GET_CONFIG:
    raw_response(command, STATUS_OK);
    rawPacket[2] = PROTOCOL_VERSION;
    rawPacket[3] = lt_mask & 0x0f;
    pack_layer(0, 0, 4);
    for (i = 0; i < LED_COUNT; i++) {
      rawPacket[22 + i * 3] = colors[i].r;
      rawPacket[23 + i * 3] = colors[i].g;
      rawPacket[24 + i * 3] = colors[i].b;
    }
    break;

  case CMD_GET_LIGHTING:
    raw_response(command, STATUS_OK);
    for (i = 0; i < LED_COUNT; i++) {
      rawPacket[2 + i] = brightness[i];
      rawPacket[5 + i * 3] = colors[i].r;
      rawPacket[6 + i * 3] = colors[i].g;
      rawPacket[7 + i * 3] = colors[i].b;
    }
    rawPacket[14] = pulse_en & 0x07;
    rawPacket[15] = auto_off_en & 1;
    rawPacket[16] = auto_off_index > AUTO_OFF_MAX_INDEX ? AUTO_OFF_MAX_INDEX
                                                        : auto_off_index;
    rawPacket[17] = cpulse_en & 0x07;
    for (i = 0; i < LED_COUNT; i++) {
      rawPacket[18 + i * 2] = (uint8_t)cpulse_period_ms[i];
      rawPacket[19 + i * 2] = (uint8_t)(cpulse_period_ms[i] >> 8);
      rawPacket[24 + i] = cpulse_min_divisor[i];
    }
    break;

  case CMD_SET_PULSE:
    if (!raw_require(command, count, 2))
      break;
    light_rqt_u8(LIGHT_RQT_SET_PULSE, LIGHT_SRC_EXTERNAL, rawPacket[1]);
    raw_response(command, STATUS_OK);
    break;

  case CMD_SET_AUTO_OFF:
    if (!raw_require(command, count, 3))
      break;
    light_rqt_u8_u8(LIGHT_RQT_SET_AUTO_OFF, LIGHT_SRC_EXTERNAL, rawPacket[1],
                    rawPacket[2]);
    raw_response(command, STATUS_OK);
    break;

  case CMD_PING:
  case CMD_ENTER_BOOTLOADER:
    raw_response(command, STATUS_OK);
    rawPacket[2] = PROTOCOL_VERSION;
    break;

  case CMD_GET_VERSION:
    raw_response(command, STATUS_OK);
    rawPacket[2] = FW_VERSION_MAJOR;
    rawPacket[3] = FW_VERSION_MINOR;
    rawPacket[4] = FW_VERSION_PATCH;
    break;

  default:
    raw_response(command, STATUS_BAD_COMMAND);
    break;
  }

  HID_rawSend(rawPacket, RAW_PACKET_SIZE);
  if (command == CMD_ENTER_BOOTLOADER) {
    DLY_ms(50);
    BOOT_now();
  }
}

void main(void) {
  uint8_t i;
  uint8_t layer;

  NEO_init();
  if (!PIN_read(PIN_KEY1)) {
    NEO_latch();
    for (i = 9; i; i--)
      NEO_sendByte(255);
    BOOT_now();
  }

  CLK_config();
  DLY_ms(5);
  WDT_start();
  boot_wave_pulse();
  KBD_init();
  defaults_load();
  config_load();
  key_sm_init();
  light_init();
  light_rqt(LIGHT_RQT_WAKE, LIGHT_SRC_INTERNAL);

  while (1) {
    key_sm_debounced(0, !PIN_read(PIN_KEY1), 0);
    key_sm_debounced(1, !PIN_read(PIN_KEY2), 1);
    key_sm_debounced(2, !PIN_read(PIN_KEY3), 2);
    key_sm_debounced(3, !PIN_read(PIN_ENC_SW), 0xff);

    // Encoder: edge-driven, outside key_sm (permanent for v1)
    if (!PIN_read(PIN_ENC_A)) {
      light_rqt(LIGHT_RQT_WAKE, LIGHT_SRC_USER);
      layer = key_sm_active_layer();
      i = PIN_read(PIN_ENC_B) ? 4 : 5;
      DLY_ms(10);
      while (!PIN_read(PIN_ENC_A))
        WDT_reset();
      if (layer == 0)
        binding_play_l0(i);
      else
        binding_tap(&layers[layer][i]);
    }

    raw_handle();
    light_tick();
    DLY_ms(LIGHT_LOOP_MS);
    WDT_reset();
  }
}
