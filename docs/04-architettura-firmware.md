# Firmware architecture

The main firmware is `firmware/3keys_1knob.c`; the CH55x, USB, keyboard/consumer, NeoPixel and timing drivers are in `firmware/include/`.

## Main loop

At startup the firmware initializes the NeoPixel, checks for a manual bootloader request, configures the clock and USB, starts the watchdog and loads the configuration from Data Flash. In the loop it:

1. reads the three buttons and the encoder click;
2. decodes an encoder rotation;
3. handles any incoming Raw HID packet;
4. updates the three LEDs;
5. feeds the watchdog.

## Logical pins

| Function | Symbol | CH552 pin |
|---|---|---|
| Button 1 | `PIN_KEY1` | P1.1, pin 9 |
| Button 2 | `PIN_KEY2` | P1.7, pin 5 |
| Button 3 | `PIN_KEY3` | P1.6, pin 4 |
| Encoder click | `PIN_ENC_SW` | P3.3, pin 10 |
| Encoder A | `PIN_ENC_A` | P3.1, pin 7 |
| Encoder B | `PIN_ENC_B` | P3.0, pin 8 |
| NeoPixel data | `PIN_NEO` | P3.4, pin 11 |

## Composite USB

The device uses VID:PID `1189:8890` and two interfaces:

- interface 0: keyboard and consumer HID controls;
- interface 1: vendor-defined Raw HID, usage page `0xFF60`, usage `0x61`.

Endpoint 1 carries keyboard/media reports. Endpoint 2 is bidirectional and carries 32-byte Raw HID packets. On macOS the firmware also accepts `SET_REPORT` on the control endpoint and keeps the last response available for reading as a Feature report.

## Default mapping

| Control | Type | HID code |
|---|---:|---:|
| Button 1 | Keyboard | `0x68` F13 |
| Button 2 | Keyboard | `0x69` F14 |
| Button 3 | Keyboard | `0x6A` F15 |
| Encoder click | Consumer | `0xE2` Mute |
| Encoder clockwise | Consumer | `0xE9` Volume Up |
| Encoder counter-clockwise | Consumer | `0xEA` Volume Down |

## Data Flash / EEPROM layout v2

| Offset | Content |
|---:|---|
| 0–1 | signature `0x4D 0x50` (`MP`) |
| 2 | version `2` |
| 3 | XOR checksum |
| 4–21 | six `[mod, type, code]` records |
| 22–30 | three colors `[R,G,B]` |
| 31–33 | brightness for LED 1, 2 and 3 |

The checksum is the XOR of the version and bytes 4–33. If the signature, version or checksum are invalid, the defaults are loaded. A 32-byte v1 configuration is migrated by duplicating the global brightness onto the three LEDs.

## Brightness

Each color component is scaled independently:

```text
output = color × (brightness + 1) / 256
```

Brightness is therefore independent for each LED, without changing the stored RGB color.
