#pragma once

#define RAW_PACKET_SIZE       32
#define PROTOCOL_VERSION      4
#define MACRO_STEPS           2  /* max sequential taps on layer 0 (Tap) */

#define CMD_SET_RGB           0x01
#define CMD_GET_CONFIG        0x02
#define CMD_SET_KEYMAP        0x03
#define CMD_SAVE_CONFIG       0x04
#define CMD_SET_BRIGHTNESS    0x05
#define CMD_ENTER_BOOTLOADER  0x06
#define CMD_PING              0x07
#define CMD_GET_LIGHTING      0x08
#define CMD_SET_PULSE         0x09
#define CMD_GET_KEYMAP        0x0A
#define CMD_SET_LT_MASK       0x0B
#define CMD_RESPONSE          0x80

#define STATUS_OK             0
#define STATUS_BAD_COMMAND    1
#define STATUS_BAD_LENGTH     2

#define KEY_COUNT             6
#define LAYER_COUNT           5  /* L0 tap + L1..L4 per Fn key 0..3 */
#define LT_KEY_COUNT          4
#define LED_COUNT             3
#define KEY_FIELDS            3
#define RGB_FIELDS            3
