VID = 0x1189
PID = 0x8890
USAGE_PAGE = 0xFF60
PACKET_SIZE = 32

SET_RGB = 0x01
GET_CONFIG = 0x02
SET_KEYMAP = 0x03
SAVE_CONFIG = 0x04
SET_BRIGHTNESS = 0x05
ENTER_BOOTLOADER = 0x06
PING = 0x07
GET_LIGHTING = 0x08
SET_PULSE = 0x09
GET_KEYMAP = 0x0A
SET_LT_MASK = 0x0B
RESPONSE = 0x80

CONTROL_NAMES = ("Button 1", "Button 2", "Button 3", "Encoder click", "Encoder clockwise", "Encoder counterclockwise")
LT_CAPABLE = 4  # first four controls support long-press Fn
LAYER_COUNT = 5  # 0 = tap, 1..4 = Fn key 0..3
MACRO_STEPS = 2  # sequential taps on layer 0 (Tap)
