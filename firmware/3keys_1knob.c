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
#define EEPROM_V1_SIZE 32
#define EEPROM_V2_SIZE 34
#define EEPROM_V3_SIZE 35
#define EEPROM_V4_SIZE 54
#define EEPROM_V5_SIZE 108
#define EEPROM_V6_SIZE 126
#define EEPROM_V7_SIZE 128
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

uint8_t config_checksum(uint8_t version, uint8_t size) {
  uint8_t i;
  uint8_t value = version;
  for (i = 4; i < size; i++)
    value ^= eeprom_read_byte(i);
  return value;
}

void config_load(void) {
  uint8_t i;
  uint8_t layer;
  uint8_t version = eeprom_read_byte(2);
  uint8_t size;
  if (version == 1)
    size = EEPROM_V1_SIZE;
  else if (version == 2)
    size = EEPROM_V2_SIZE;
  else if (version == 3)
    size = EEPROM_V3_SIZE;
  else if (version == 4)
    size = EEPROM_V4_SIZE;
  else if (version == 5)
    size = EEPROM_V5_SIZE;
  else if (version == 6)
    size = EEPROM_V6_SIZE;
  else if (version == 7)
    size = EEPROM_V7_SIZE;
  else
    size = EEPROM_SIZE;

  if (eeprom_read_byte(0) != EEPROM_MAGIC_0 ||
      eeprom_read_byte(1) != EEPROM_MAGIC_1 ||
      (version < 1 || version > EEPROM_VERSION) ||
      eeprom_read_byte(3) != config_checksum(version, size)) {
    defaults_load();
    return;
  }

  for (i = 0; i < KEY_COUNT; i++) {
    layers[0][i].mod = eeprom_read_byte(4 + i * KEY_FIELDS);
    layers[0][i].type = eeprom_read_byte(5 + i * KEY_FIELDS);
    layers[0][i].code = eeprom_read_byte(6 + i * KEY_FIELDS);
    sanitize_binding(&layers[0][i]);
    l0_step1[i].mod = 0;
    l0_step1[i].type = KEYBOARD;
    l0_step1[i].code = 0;
  }

  if (version >= 6) {
    for (i = 0; i < KEY_COUNT; i++) {
      l0_step1[i].mod = eeprom_read_byte(22 + i * KEY_FIELDS);
      l0_step1[i].type = eeprom_read_byte(23 + i * KEY_FIELDS);
      l0_step1[i].code = eeprom_read_byte(24 + i * KEY_FIELDS);
      sanitize_binding(&l0_step1[i]);
    }
    for (layer = 1; layer < LAYER_COUNT; layer++) {
      for (i = 0; i < KEY_COUNT; i++) {
        layers[layer][i].mod = eeprom_read_byte(22 + layer * 18 + i * KEY_FIELDS);
        layers[layer][i].type = eeprom_read_byte(23 + layer * 18 + i * KEY_FIELDS);
        layers[layer][i].code = eeprom_read_byte(24 + layer * 18 + i * KEY_FIELDS);
        sanitize_binding(&layers[layer][i]);
      }
    }
    for (i = 0; i < LED_COUNT; i++) {
      colors[i].r = eeprom_read_byte(112 + i * RGB_FIELDS);
      colors[i].g = eeprom_read_byte(113 + i * RGB_FIELDS);
      colors[i].b = eeprom_read_byte(114 + i * RGB_FIELDS);
    }
    brightness[0] = eeprom_read_byte(121);
    brightness[1] = eeprom_read_byte(122);
    brightness[2] = eeprom_read_byte(123);
    pulse_en = eeprom_read_byte(124) & 0x07;
    lt_mask = eeprom_read_byte(125) & 0x0f;
  } else if (version >= 5) {
    for (layer = 1; layer < LAYER_COUNT; layer++) {
      for (i = 0; i < KEY_COUNT; i++) {
        layers[layer][i].mod = eeprom_read_byte(4 + layer * 18 + i * KEY_FIELDS);
        layers[layer][i].type = eeprom_read_byte(5 + layer * 18 + i * KEY_FIELDS);
        layers[layer][i].code = eeprom_read_byte(6 + layer * 18 + i * KEY_FIELDS);
        sanitize_binding(&layers[layer][i]);
      }
    }
    for (i = 0; i < LED_COUNT; i++) {
      colors[i].r = eeprom_read_byte(94 + i * RGB_FIELDS);
      colors[i].g = eeprom_read_byte(95 + i * RGB_FIELDS);
      colors[i].b = eeprom_read_byte(96 + i * RGB_FIELDS);
    }
    brightness[0] = eeprom_read_byte(103);
    brightness[1] = eeprom_read_byte(104);
    brightness[2] = eeprom_read_byte(105);
    pulse_en = eeprom_read_byte(106) & 0x07;
    lt_mask = eeprom_read_byte(107) & 0x0f;
  } else if (version >= 4) {
    for (i = 0; i < KEY_COUNT; i++) {
      layers[1][i].mod = eeprom_read_byte(22 + i * KEY_FIELDS);
      layers[1][i].type = eeprom_read_byte(23 + i * KEY_FIELDS);
      layers[1][i].code = eeprom_read_byte(24 + i * KEY_FIELDS);
      sanitize_binding(&layers[1][i]);
    }
    for (layer = 2; layer < LAYER_COUNT; layer++)
      copy_layer(layer, 1);
    for (i = 0; i < LED_COUNT; i++) {
      colors[i].r = eeprom_read_byte(40 + i * RGB_FIELDS);
      colors[i].g = eeprom_read_byte(41 + i * RGB_FIELDS);
      colors[i].b = eeprom_read_byte(42 + i * RGB_FIELDS);
    }
    brightness[0] = eeprom_read_byte(49);
    brightness[1] = eeprom_read_byte(50);
    brightness[2] = eeprom_read_byte(51);
    pulse_en = eeprom_read_byte(52) & 0x07;
    lt_mask = eeprom_read_byte(53) & 0x0f;
  } else {
    copy_layer(1, 0);
    for (layer = 2; layer < LAYER_COUNT; layer++)
      copy_layer(layer, 1);
    for (i = 0; i < LED_COUNT; i++) {
      colors[i].r = eeprom_read_byte(22 + i * RGB_FIELDS);
      colors[i].g = eeprom_read_byte(23 + i * RGB_FIELDS);
      colors[i].b = eeprom_read_byte(24 + i * RGB_FIELDS);
    }
    brightness[0] = eeprom_read_byte(31);
    brightness[1] = version == 1 ? brightness[0] : eeprom_read_byte(32);
    brightness[2] = version == 1 ? brightness[0] : eeprom_read_byte(33);
    pulse_en = version >= 3 ? (eeprom_read_byte(34) & 0x07) : 0x07;
    lt_mask = 0x00;
  }

  if (version >= 8) {
    auto_off_en = eeprom_read_byte(126) & 1;
    auto_off_index = eeprom_read_byte(127);
    if (auto_off_index > AUTO_OFF_MAX_INDEX)
      auto_off_index = AUTO_OFF_MAX_INDEX;
  } else if (version >= 7) {
    auto_off_en = eeprom_read_byte(126) & 1;
    auto_off_index = auto_off_index_from_sec((uint16_t)eeprom_read_byte(127) * 10);
  } else {
    auto_off_en = 0;
    auto_off_index = 9;
  }
}

void config_save(void) {
  uint8_t i;
  uint8_t layer;
  uint8_t checksum = EEPROM_VERSION;
  eeprom_write_byte(0, EEPROM_MAGIC_0);
  eeprom_write_byte(1, EEPROM_MAGIC_1);
  eeprom_write_byte(2, EEPROM_VERSION);
  for (i = 0; i < KEY_COUNT; i++) {
    eeprom_write_byte(4 + i * KEY_FIELDS, layers[0][i].mod);
    eeprom_write_byte(5 + i * KEY_FIELDS, layers[0][i].type);
    eeprom_write_byte(6 + i * KEY_FIELDS, layers[0][i].code);
    eeprom_write_byte(22 + i * KEY_FIELDS, l0_step1[i].mod);
    eeprom_write_byte(23 + i * KEY_FIELDS, l0_step1[i].type);
    eeprom_write_byte(24 + i * KEY_FIELDS, l0_step1[i].code);
  }
  for (layer = 1; layer < LAYER_COUNT; layer++) {
    for (i = 0; i < KEY_COUNT; i++) {
      eeprom_write_byte(22 + layer * 18 + i * KEY_FIELDS, layers[layer][i].mod);
      eeprom_write_byte(23 + layer * 18 + i * KEY_FIELDS, layers[layer][i].type);
      eeprom_write_byte(24 + layer * 18 + i * KEY_FIELDS, layers[layer][i].code);
    }
  }
  for (i = 0; i < LED_COUNT; i++) {
    eeprom_write_byte(112 + i * RGB_FIELDS, colors[i].r);
    eeprom_write_byte(113 + i * RGB_FIELDS, colors[i].g);
    eeprom_write_byte(114 + i * RGB_FIELDS, colors[i].b);
  }
  eeprom_write_byte(121, brightness[0]);
  eeprom_write_byte(122, brightness[1]);
  eeprom_write_byte(123, brightness[2]);
  eeprom_write_byte(124, pulse_en & 0x07);
  eeprom_write_byte(125, lt_mask & 0x0f);
  eeprom_write_byte(126, auto_off_en & 1);
  eeprom_write_byte(127, auto_off_index > AUTO_OFF_MAX_INDEX ? AUTO_OFF_MAX_INDEX
                                                             : auto_off_index);
  for (i = 4; i < EEPROM_SIZE; i++)
    checksum ^= eeprom_read_byte(i);
  eeprom_write_byte(3, checksum);
}

void raw_response(uint8_t command, uint8_t status) {
  uint8_t i;
  for (i = 0; i < RAW_PACKET_SIZE; i++)
    rawPacket[i] = 0;
  rawPacket[0] = command | CMD_RESPONSE;
  rawPacket[1] = status;
}

void pack_layer(uint8_t layer, uint8_t step, uint8_t offset) {
  uint8_t i;
  __xdata struct binding *src;
  for (i = 0; i < KEY_COUNT; i++) {
    if (layer == 0 && step == 1)
      src = &l0_step1[i];
    else
      src = &layers[layer][i];
    rawPacket[offset + i * 3] = src->mod;
    rawPacket[offset + 1 + i * 3] = src->type;
    rawPacket[offset + 2 + i * 3] = src->code;
  }
}

void unpack_layer(uint8_t layer, uint8_t step, uint8_t offset) {
  uint8_t i;
  __xdata struct binding *dst;
  for (i = 0; i < KEY_COUNT; i++) {
    if (layer == 0 && step == 1)
      dst = &l0_step1[i];
    else
      dst = &layers[layer][i];
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

  if (command == CMD_SET_RGB) {
    if (count < 10) {
      raw_response(command, STATUS_BAD_LENGTH);
    } else {
      for (i = 0; i < LED_COUNT; i++)
        light_set_rgb_led(i, rawPacket[1 + i * 3], rawPacket[2 + i * 3],
                          rawPacket[3 + i * 3]);
      light_rqt(LIGHT_RQT_OUTPUT_CHANGE, LIGHT_SRC_EXTERNAL);
      raw_response(command, STATUS_OK);
    }
  } else if (command == CMD_SET_BRIGHTNESS) {
    if (count < 2)
      raw_response(command, STATUS_BAD_LENGTH);
    else {
      if (count >= 4) {
        for (i = 0; i < LED_COUNT; i++)
          light_set_brightness_led(i, rawPacket[1 + i]);
      } else {
        light_set_brightness_all(rawPacket[1]);
      }
      light_rqt(LIGHT_RQT_OUTPUT_CHANGE, LIGHT_SRC_EXTERNAL);
      raw_response(command, STATUS_OK);
    }
  } else if (command == CMD_SET_RGB_LED) {
    if (count < 5) {
      raw_response(command, STATUS_BAD_LENGTH);
    } else if (rawPacket[1] >= LED_COUNT) {
      raw_response(command, STATUS_BAD_COMMAND);
    } else {
      light_set_rgb_led(rawPacket[1], rawPacket[2], rawPacket[3],
                        rawPacket[4]);
      light_rqt(LIGHT_RQT_OUTPUT_CHANGE, LIGHT_SRC_EXTERNAL);
      raw_response(command, STATUS_OK);
    }
  } else if (command == CMD_SET_BRIGHTNESS_LED) {
    if (count < 3) {
      raw_response(command, STATUS_BAD_LENGTH);
    } else if (rawPacket[1] >= LED_COUNT) {
      raw_response(command, STATUS_BAD_COMMAND);
    } else {
      light_set_brightness_led(rawPacket[1], rawPacket[2]);
      light_rqt(LIGHT_RQT_OUTPUT_CHANGE, LIGHT_SRC_EXTERNAL);
      raw_response(command, STATUS_OK);
    }
  } else if (command == CMD_SET_CPULSE_LED) {
    period_ms = (uint16_t)rawPacket[3] | ((uint16_t)rawPacket[4] << 8);
    if (count < 6) {
      raw_response(command, STATUS_BAD_LENGTH);
    } else if (rawPacket[1] >= LED_COUNT || period_ms < 500 ||
               period_ms > 3000 || rawPacket[5] < 2) {
      raw_response(command, STATUS_BAD_COMMAND);
    } else {
      light_set_cpulse_led(rawPacket[1], rawPacket[2], period_ms,
                           rawPacket[5]);
      raw_response(command, STATUS_OK);
    }
  } else if (command == CMD_SET_KEYMAP) {
    step = 0;
    data_off = 2;
    if (count >= 21) {
      step = rawPacket[2];
      data_off = 3;
    }
    if (count < data_off + 18) {
      raw_response(command, STATUS_BAD_LENGTH);
    } else if (rawPacket[1] >= LAYER_COUNT) {
      raw_response(command, STATUS_BAD_COMMAND);
    } else if (step >= MACRO_STEPS || (step > 0 && rawPacket[1] != 0)) {
      raw_response(command, STATUS_BAD_COMMAND);
    } else {
      unpack_layer(rawPacket[1], step, data_off);
      raw_response(command, STATUS_OK);
    }
  } else if (command == CMD_GET_KEYMAP) {
    step = (count >= 3) ? rawPacket[2] : 0;
    if (count < 2) {
      raw_response(command, STATUS_BAD_LENGTH);
    } else if (rawPacket[1] >= LAYER_COUNT) {
      raw_response(command, STATUS_BAD_COMMAND);
    } else if (step >= MACRO_STEPS || (step > 0 && rawPacket[1] != 0)) {
      raw_response(command, STATUS_BAD_COMMAND);
    } else {
      layer = rawPacket[1];
      raw_response(command, STATUS_OK);
      rawPacket[2] = layer;
      rawPacket[3] = step;
      pack_layer(layer, step, 4);
    }
  } else if (command == CMD_SET_LT_MASK) {
    if (count < 2)
      raw_response(command, STATUS_BAD_LENGTH);
    else {
      lt_mask = rawPacket[1] & 0x0f;
      raw_response(command, STATUS_OK);
    }
  } else if (command == CMD_SAVE_CONFIG) {
    config_save();
    raw_response(command, STATUS_OK);
  } else if (command == CMD_GET_CONFIG) {
    raw_response(command, STATUS_OK);
    rawPacket[2] = PROTOCOL_VERSION;
    rawPacket[3] = lt_mask & 0x0f;
    pack_layer(0, 0, 4);
    for (i = 0; i < LED_COUNT; i++) {
      rawPacket[22 + i * 3] = colors[i].r;
      rawPacket[23 + i * 3] = colors[i].g;
      rawPacket[24 + i * 3] = colors[i].b;
    }
  } else if (command == CMD_GET_LIGHTING) {
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
  } else if (command == CMD_SET_PULSE) {
    if (count < 2)
      raw_response(command, STATUS_BAD_LENGTH);
    else {
      light_rqt_u8(LIGHT_RQT_SET_PULSE, LIGHT_SRC_EXTERNAL, rawPacket[1]);
      raw_response(command, STATUS_OK);
    }
  } else if (command == CMD_SET_AUTO_OFF) {
    if (count < 3)
      raw_response(command, STATUS_BAD_LENGTH);
    else {
      light_rqt_u8_u8(LIGHT_RQT_SET_AUTO_OFF, LIGHT_SRC_EXTERNAL, rawPacket[1],
                      rawPacket[2]);
      raw_response(command, STATUS_OK);
    }
  } else if (command == CMD_PING || command == CMD_ENTER_BOOTLOADER) {
    raw_response(command, STATUS_OK);
    rawPacket[2] = PROTOCOL_VERSION;
  } else {
    raw_response(command, STATUS_BAD_COMMAND);
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
