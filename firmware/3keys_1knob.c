// CH552 RGB MacroPad firmware: keyboard, encoder and bidirectional Raw HID.

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
#define EEPROM_MAGIC_0 0x4d
#define EEPROM_MAGIC_1 0x50
#define EEPROM_VERSION 2
#define EEPROM_V1_SIZE 32
#define EEPROM_SIZE 34

struct key {
  uint8_t mod;
  uint8_t type;
  uint8_t code;
  uint8_t last;
};

struct RGBColor {
  uint8_t r;
  uint8_t g;
  uint8_t b;
};

struct key keys[KEY_COUNT];
struct RGBColor colors[LED_COUNT];
uint8_t brightness[LED_COUNT];
__xdata uint8_t rawPacket[RAW_PACKET_SIZE];

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
  return ((uint16_t)value * ((uint16_t)brightness[led] + 1)) >> 8;
}

void NEO_update(void) {
  uint8_t i;
  EA = 0;
  for (i = 0; i < LED_COUNT; i++)
    NEO_writeColor(scale_color(colors[i].r, i), scale_color(colors[i].g, i),
                   scale_color(colors[i].b, i));
  EA = 1;
}

void defaults_load(void) {
  uint8_t i;
  for (i = 0; i < KEY_COUNT; i++) {
    keys[i].mod = 0;
    keys[i].type = KEYBOARD;
    keys[i].last = 0;
  }
  keys[0].code = 0x68; // F13
  keys[1].code = 0x69; // F14
  keys[2].code = 0x6a; // F15
  keys[3].type = CONSUMER;
  keys[3].code = 0xe2; // mute
  keys[4].type = CONSUMER;
  keys[4].code = 0xe9; // volume up
  keys[5].type = CONSUMER;
  keys[5].code = 0xea; // volume down
  colors[0].r = 0; colors[0].g = 80; colors[0].b = 255;
  colors[1].r = 0; colors[1].g = 255; colors[1].b = 80;
  colors[2].r = 255; colors[2].g = 20; colors[2].b = 0;
  for (i = 0; i < LED_COUNT; i++)
    brightness[i] = 160;
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
  uint8_t version = eeprom_read_byte(2);
  uint8_t size = version == 1 ? EEPROM_V1_SIZE : EEPROM_SIZE;
  if (eeprom_read_byte(0) != EEPROM_MAGIC_0 ||
      eeprom_read_byte(1) != EEPROM_MAGIC_1 ||
      (version != 1 && version != EEPROM_VERSION) ||
      eeprom_read_byte(3) != config_checksum(version, size)) {
    defaults_load();
    return;
  }
  for (i = 0; i < KEY_COUNT; i++) {
    keys[i].mod = eeprom_read_byte(4 + i * KEY_FIELDS);
    keys[i].type = eeprom_read_byte(5 + i * KEY_FIELDS);
    keys[i].code = eeprom_read_byte(6 + i * KEY_FIELDS);
    keys[i].last = 0;
    if (keys[i].type > CONSUMER)
      keys[i].type = KEYBOARD;
  }
  for (i = 0; i < LED_COUNT; i++) {
    colors[i].r = eeprom_read_byte(22 + i * RGB_FIELDS);
    colors[i].g = eeprom_read_byte(23 + i * RGB_FIELDS);
    colors[i].b = eeprom_read_byte(24 + i * RGB_FIELDS);
  }
  brightness[0] = eeprom_read_byte(31);
  brightness[1] = version == 1 ? brightness[0] : eeprom_read_byte(32);
  brightness[2] = version == 1 ? brightness[0] : eeprom_read_byte(33);
}

void config_save(void) {
  uint8_t i;
  uint8_t checksum = EEPROM_VERSION;
  eeprom_write_byte(0, EEPROM_MAGIC_0);
  eeprom_write_byte(1, EEPROM_MAGIC_1);
  eeprom_write_byte(2, EEPROM_VERSION);
  for (i = 0; i < KEY_COUNT; i++) {
    eeprom_write_byte(4 + i * KEY_FIELDS, keys[i].mod);
    eeprom_write_byte(5 + i * KEY_FIELDS, keys[i].type);
    eeprom_write_byte(6 + i * KEY_FIELDS, keys[i].code);
  }
  for (i = 0; i < LED_COUNT; i++) {
    eeprom_write_byte(22 + i * RGB_FIELDS, colors[i].r);
    eeprom_write_byte(23 + i * RGB_FIELDS, colors[i].g);
    eeprom_write_byte(24 + i * RGB_FIELDS, colors[i].b);
  }
  for (i = 0; i < LED_COUNT; i++)
    eeprom_write_byte(31 + i, brightness[i]);
  for (i = 4; i < EEPROM_SIZE; i++)
    checksum ^= eeprom_read_byte(i);
  eeprom_write_byte(3, checksum);
}

void handle_key(uint8_t current, struct key *key) {
  if (current == key->last)
    return;
  key->last = current;
  if (current) {
    if (key->type == KEYBOARD)
      KBD_code_press(key->mod, key->code);
    else
      CON_press(key->code);
  } else {
    if (key->type == KEYBOARD)
      KBD_code_release(key->mod, key->code);
    else
      CON_release(key->code);
  }
}

void raw_response(uint8_t command, uint8_t status) {
  uint8_t i;
  for (i = 0; i < RAW_PACKET_SIZE; i++)
    rawPacket[i] = 0;
  rawPacket[0] = command | CMD_RESPONSE;
  rawPacket[1] = status;
}

void raw_handle(void) {
  uint8_t count = HID_available();
  uint8_t command;
  uint8_t i;
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
    if (count < 19) {
      raw_response(command, STATUS_BAD_LENGTH);
    } else {
      for (i = 0; i < KEY_COUNT; i++) {
        keys[i].mod = rawPacket[1 + i * 3];
        keys[i].type = rawPacket[2 + i * 3] > 1 ? 0 : rawPacket[2 + i * 3];
        keys[i].code = rawPacket[3 + i * 3];
      }
      raw_response(command, STATUS_OK);
    }
  } else if (command == CMD_SAVE_CONFIG) {
    config_save();
    raw_response(command, STATUS_OK);
  } else if (command == CMD_GET_CONFIG) {
    raw_response(command, STATUS_OK);
    rawPacket[2] = PROTOCOL_VERSION;
    rawPacket[3] = brightness[0];
    for (i = 0; i < KEY_COUNT; i++) {
      rawPacket[4 + i * 3] = keys[i].mod;
      rawPacket[5 + i * 3] = keys[i].type;
      rawPacket[6 + i * 3] = keys[i].code;
    }
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
  struct key *encoderKey;
  uint8_t i;

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
  config_load();

  while (1) {
    handle_key(!PIN_read(PIN_KEY1), &keys[0]);
    handle_key(!PIN_read(PIN_KEY2), &keys[1]);
    handle_key(!PIN_read(PIN_KEY3), &keys[2]);
    handle_key(!PIN_read(PIN_ENC_SW), &keys[3]);

    encoderKey = 0;
    if (!PIN_read(PIN_ENC_A)) {
      encoderKey = PIN_read(PIN_ENC_B) ? &keys[4] : &keys[5];
      DLY_ms(10);
      while (!PIN_read(PIN_ENC_A))
        WDT_reset();
    }
    if (encoderKey) {
      if (encoderKey->type == KEYBOARD)
        KBD_code_type(encoderKey->mod, encoderKey->code);
      else
        CON_type(encoderKey->code);
    }

    raw_handle();
    NEO_update();
    DLY_ms(5);
    WDT_reset();
  }
}
