// CH552 RGB MacroPad firmware: keyboard, encoder and bidirectional Raw HID.
// Layers L0/L1 + per-key LT (tap-on-release, hold-on-timer).

#include <config.h>
#include <delay.h>
#include <neo.h>
#include <protocol.h>
#include <system.h>
#include <usb_conkbd.h>
#include <usb_descr.h>

void USB_interrupt(void);
void USB_ISR(void) __interrupt(INT_NO_USB) { USB_interrupt(); }

#define KEYBOARD 0
#define CONSUMER 1
#define MOUSE 2
#define EEPROM_MAGIC_0 0x4d
#define EEPROM_MAGIC_1 0x50
#define EEPROM_VERSION 5
#define EEPROM_V1_SIZE 32
#define EEPROM_V2_SIZE 34
#define EEPROM_V3_SIZE 35
#define EEPROM_V4_SIZE 54
#define EEPROM_SIZE 108
#define HOLD_TICKS 40   // ~200 ms @ 5 ms/loop — enter Fn, never emit tap
#define MIN_TAP_TICKS 4 // ~20 ms — ignore bounce "releases" as taps
#define DEBOUNCE_TICKS 2

struct binding {
  uint8_t mod;
  uint8_t type;
  uint8_t code;
};

struct RGBColor {
  uint8_t r;
  uint8_t g;
  uint8_t b;
};

__xdata struct binding layers[LAYER_COUNT][KEY_COUNT];
struct RGBColor colors[LED_COUNT];
uint8_t brightness[LED_COUNT];
uint8_t pulse_t[LED_COUNT];
uint8_t pulse_en;
uint8_t lt_mask;   // bits 0..3 = LT on Button1..3 + Enc click
uint8_t fn_mask;   // bits 0..3 = keys currently held as Fn (bits 0..2 → LED white)
uint8_t key_last[KEY_COUNT];
uint8_t key_raw[KEY_COUNT];
uint8_t key_db[KEY_COUNT];
uint8_t hold_cnt[LT_KEY_COUNT];
uint8_t lt_became_fn[LT_KEY_COUNT]; // this press already entered Fn — never tap
uint8_t armed_layer[KEY_COUNT];
__xdata uint8_t rawPacket[RAW_PACKET_SIZE];

// Non-linear press pulse: dip intensity, never black. ~80ms @ 5ms/tick.
#define PULSE_LEN 16
static const uint8_t pulse_curve[PULSE_LEN] = {
  200, 140, 100, 90, 100, 125, 155, 180,
  200, 218, 232, 242, 248, 252, 254, 255
};

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

uint8_t scale_color(uint8_t value, uint8_t led) {
  uint8_t bri = brightness[led];
  if (pulse_t[led])
    bri = ((uint16_t)bri * pulse_curve[PULSE_LEN - pulse_t[led]]) >> 8;
  return ((uint16_t)value * ((uint16_t)bri + 1)) >> 8;
}

void NEO_update(void) {
  uint8_t i;
  EA = 0;
  for (i = 0; i < LED_COUNT; i++) {
    if (fn_mask & (1 << i))
      NEO_writeColor(255, 255, 255); // Fn key only: white @ max
    else
      NEO_writeColor(scale_color(colors[i].r, i), scale_color(colors[i].g, i),
                     scale_color(colors[i].b, i));
  }
  EA = 1;
  for (i = 0; i < LED_COUNT; i++)
    if (pulse_t[i])
      pulse_t[i]--;
}

void copy_layer(uint8_t dst, uint8_t src) {
  uint8_t i;
  for (i = 0; i < KEY_COUNT; i++) {
    layers[dst][i].mod = layers[src][i].mod;
    layers[dst][i].type = layers[src][i].type;
    layers[dst][i].code = layers[src][i].code;
  }
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

  // Default Fn layers (copied to all Fn maps)
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

  colors[0].r = 0; colors[0].g = 80; colors[0].b = 255;
  colors[1].r = 0; colors[1].g = 255; colors[1].b = 80;
  colors[2].r = 255; colors[2].g = 20; colors[2].b = 0;
  for (i = 0; i < LED_COUNT; i++)
    brightness[i] = 160;
  pulse_en = 0x07;
  lt_mask = 0x00; // opt-in via UI Add
}

uint8_t config_checksum(uint8_t version, uint8_t size) {
  uint8_t i;
  uint8_t value = version;
  for (i = 4; i < size; i++)
    value ^= eeprom_read_byte(i);
  return value;
}

void sanitize_binding(__xdata struct binding *b) {
  if (b->type > MOUSE)
    b->type = KEYBOARD;
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
  }

  if (version >= 5) {
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
}

void config_save(void) {
  uint8_t i;
  uint8_t layer;
  uint8_t checksum = EEPROM_VERSION;
  eeprom_write_byte(0, EEPROM_MAGIC_0);
  eeprom_write_byte(1, EEPROM_MAGIC_1);
  eeprom_write_byte(2, EEPROM_VERSION);
  for (layer = 0; layer < LAYER_COUNT; layer++) {
    for (i = 0; i < KEY_COUNT; i++) {
      eeprom_write_byte(4 + layer * 18 + i * KEY_FIELDS, layers[layer][i].mod);
      eeprom_write_byte(5 + layer * 18 + i * KEY_FIELDS, layers[layer][i].type);
      eeprom_write_byte(6 + layer * 18 + i * KEY_FIELDS, layers[layer][i].code);
    }
  }
  for (i = 0; i < LED_COUNT; i++) {
    eeprom_write_byte(94 + i * RGB_FIELDS, colors[i].r);
    eeprom_write_byte(95 + i * RGB_FIELDS, colors[i].g);
    eeprom_write_byte(96 + i * RGB_FIELDS, colors[i].b);
  }
  for (i = 0; i < LED_COUNT; i++)
    eeprom_write_byte(103 + i, brightness[i]);
  eeprom_write_byte(106, pulse_en & 0x07);
  eeprom_write_byte(107, lt_mask & 0x0f);
  for (i = 4; i < EEPROM_SIZE; i++)
    checksum ^= eeprom_read_byte(i);
  eeprom_write_byte(3, checksum);
}

uint8_t active_layer(void) {
  uint8_t i;
  for (i = 0; i < LT_KEY_COUNT; i++) {
    if (fn_mask & (1 << i))
      return (uint8_t)(1 + i); // Fn key i → layer 1+i
  }
  return 0;
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

// Tap-on-release + hold-on-timer. Long-press must NEVER emit tap.
void process_key(uint8_t idx, uint8_t current, uint8_t led) {
  uint8_t was = key_last[idx];
  uint8_t lt = (idx < LT_KEY_COUNT) && (lt_mask & (1 << idx));

  if (current && !was) {
    if (led < LED_COUNT && (pulse_en & (1 << led)) && !(fn_mask & (1 << led)))
      pulse_t[led] = PULSE_LEN;
    if (lt) {
      hold_cnt[idx] = 0;
      lt_became_fn[idx] = 0;
    } else {
      armed_layer[idx] = active_layer();
      binding_press(&layers[armed_layer[idx]][idx]);
    }
  } else if (current && was) {
    if (lt && !lt_became_fn[idx]) {
      if (hold_cnt[idx] < 255)
        hold_cnt[idx]++;
      if (hold_cnt[idx] >= HOLD_TICKS) {
        lt_became_fn[idx] = 1;
        fn_mask |= (1 << idx);
      }
    }
  } else if (!current && was) {
    if (lt) {
      if (lt_became_fn[idx]) {
        // Long-press Fn: release only, no tap
        fn_mask &= ~(1 << idx);
      } else if (hold_cnt[idx] >= MIN_TAP_TICKS) {
        // Short intentional press
        binding_tap(&layers[0][idx]);
      }
      // else: bounce / noise — ignore
      hold_cnt[idx] = 0;
      lt_became_fn[idx] = 0;
    } else {
      binding_release(&layers[armed_layer[idx]][idx]);
    }
  }
  key_last[idx] = current;
}

// Stabilize pin before LT state machine (kills press→bounce-release→tap→hold).
void process_key_debounced(uint8_t idx, uint8_t raw, uint8_t led) {
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
  process_key(idx, raw, led);
}

void raw_response(uint8_t command, uint8_t status) {
  uint8_t i;
  for (i = 0; i < RAW_PACKET_SIZE; i++)
    rawPacket[i] = 0;
  rawPacket[0] = command | CMD_RESPONSE;
  rawPacket[1] = status;
}

void pack_layer(uint8_t layer, uint8_t offset) {
  uint8_t i;
  for (i = 0; i < KEY_COUNT; i++) {
    rawPacket[offset + i * 3] = layers[layer][i].mod;
    rawPacket[offset + 1 + i * 3] = layers[layer][i].type;
    rawPacket[offset + 2 + i * 3] = layers[layer][i].code;
  }
}

void unpack_layer(uint8_t layer, uint8_t offset) {
  uint8_t i;
  for (i = 0; i < KEY_COUNT; i++) {
    layers[layer][i].mod = rawPacket[offset + i * 3];
    layers[layer][i].type = rawPacket[offset + 1 + i * 3] > MOUSE ? 0 : rawPacket[offset + 1 + i * 3];
    layers[layer][i].code = rawPacket[offset + 2 + i * 3];
  }
}

void raw_handle(void) {
  uint8_t count = HID_available();
  uint8_t command;
  uint8_t i;
  uint8_t layer;
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
      for (i = 0; i < LED_COUNT; i++) {
        colors[i].r = rawPacket[1 + i * 3];
        colors[i].g = rawPacket[2 + i * 3];
        colors[i].b = rawPacket[3 + i * 3];
      }
      raw_response(command, STATUS_OK);
    }
  } else if (command == CMD_SET_BRIGHTNESS) {
    if (count < 2)
      raw_response(command, STATUS_BAD_LENGTH);
    else {
      if (count >= 4) {
        for (i = 0; i < LED_COUNT; i++)
          brightness[i] = rawPacket[1 + i];
      } else {
        for (i = 0; i < LED_COUNT; i++)
          brightness[i] = rawPacket[1];
      }
      raw_response(command, STATUS_OK);
    }
  } else if (command == CMD_SET_KEYMAP) {
    // byte1 = layer 0..4, bytes2..19 = six [mod,type,code]
    if (count < 20) {
      raw_response(command, STATUS_BAD_LENGTH);
    } else if (rawPacket[1] >= LAYER_COUNT) {
      raw_response(command, STATUS_BAD_COMMAND);
    } else {
      unpack_layer(rawPacket[1], 2);
      raw_response(command, STATUS_OK);
    }
  } else if (command == CMD_GET_KEYMAP) {
    if (count < 2) {
      raw_response(command, STATUS_BAD_LENGTH);
    } else if (rawPacket[1] >= LAYER_COUNT) {
      raw_response(command, STATUS_BAD_COMMAND);
    } else {
      layer = rawPacket[1];
      raw_response(command, STATUS_OK);
      rawPacket[2] = layer;
      pack_layer(layer, 3);
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
    pack_layer(0, 4);
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
  } else if (command == CMD_SET_PULSE) {
    if (count < 2)
      raw_response(command, STATUS_BAD_LENGTH);
    else {
      pulse_en = rawPacket[1] & 0x07;
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
  __xdata struct binding *encoderKey;
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
  KBD_init();
  WDT_start();
  defaults_load();
  config_load();
  fn_mask = 0;
  for (i = 0; i < KEY_COUNT; i++) {
    key_last[i] = 0;
    key_raw[i] = 0;
    key_db[i] = 0;
    armed_layer[i] = 0;
  }
  for (i = 0; i < LT_KEY_COUNT; i++) {
    hold_cnt[i] = 0;
    lt_became_fn[i] = 0;
  }
  for (i = 0; i < LED_COUNT; i++)
    pulse_t[i] = 0;

  while (1) {
    process_key_debounced(0, !PIN_read(PIN_KEY1), 0);
    process_key_debounced(1, !PIN_read(PIN_KEY2), 1);
    process_key_debounced(2, !PIN_read(PIN_KEY3), 2);
    process_key_debounced(3, !PIN_read(PIN_ENC_SW), 0xff);

    encoderKey = 0;
    if (!PIN_read(PIN_ENC_A)) {
      layer = active_layer();
      encoderKey = PIN_read(PIN_ENC_B) ? &layers[layer][4] : &layers[layer][5];
      DLY_ms(10);
      while (!PIN_read(PIN_ENC_A))
        WDT_reset();
    }
    if (encoderKey)
      binding_tap(encoderKey);

    raw_handle();
    NEO_update();
    DLY_ms(5);
    WDT_reset();
  }
}
