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
SET_AUTO_OFF = 0x0C
RESPONSE = 0x80

CONTROL_NAMES = ("Button 1", "Button 2", "Button 3", "Encoder click", "Encoder clockwise", "Encoder counterclockwise")
LT_CAPABLE = 4  # first four controls support long-press Fn
LAYER_COUNT = 5  # 0 = tap, 1..4 = Fn key 0..3
MACRO_STEPS = 2  # sequential taps on layer 0 (Tap)

# Timeout table (seconds): 0, 1, 3, 5, then 10..300 step 10
AUTO_OFF_SECONDS = (
    0, 1, 3, 5,
    *range(10, 301, 10),
)
AUTO_OFF_MAX_INDEX = len(AUTO_OFF_SECONDS) - 1
# Back-compat alias used by older callers
AUTO_OFF_MAX_STEPS = AUTO_OFF_MAX_INDEX


def auto_off_index_from_seconds(seconds: int) -> int:
    seconds = max(0, int(seconds))
    for i, value in enumerate(AUTO_OFF_SECONDS):
        if value >= seconds:
            return i
    return AUTO_OFF_MAX_INDEX
