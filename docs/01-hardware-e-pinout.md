# Hardware, package and pinout

## Microcontroller

The component is a **CH552G** in a SOP16 package. The datasheet lists a total of 16 KiB of ROM; with the resident bootloader, the application area used by the project is limited to `0x3800` bytes, i.e. 14 KiB. The available DataFlash is 128 bytes.

## Correct orientation

First locate the notch or dot that marks pin 1. SOP numbering proceeds counter-clockwise when viewed from above. Do not use descriptions such as "second pin from the bottom on the left" without first fixing the orientation.

## Relevant CH552G pins

| Physical pin | Signal | Use in the project |
|---:|---|---|
| 3 | `P1.5` | old bootloader entry method cited online; not used by the final firmware |
| 4 | `P1.6` | button 3 (`PIN_KEY3`) |
| 5 | `P1.7` | button 2 (`PIN_KEY2`) |
| 7 | `P3.1` | encoder A (`PIN_ENC_A`) |
| 8 | `P3.0` | encoder B (`PIN_ENC_B`) |
| 9 | `P1.1` | button 1 (`PIN_KEY1`) |
| 10 | `P3.3` | encoder click (`PIN_ENC_SW`) |
| 11 | `P3.4` | NeoPixel data line (`PIN_NEO`) |
| 12 | `P3.6/UDP` | USB D+ and bootloader entry method via pull-up to V33 |
| 13 | `P3.7/UDM` | USB D− |
| 14 | `GND/VSS` | ground |
| 15 | `VCC/VDD` | power supply |
| 16 | `V33` | USB regulator 3.3 V output / bootloader reference |

The key and encoder mappings come from the working firmware and physical testing; the package pinout comes from the datasheet.

## LED chain

The three LEDs are driven as NeoPixel/WS2812-compatible devices from a single `P3.4` line. The color format is configured as **GRB**. The logical order in the firmware is LED 1, LED 2, LED 3; each element has an independent RGB value and 8-bit brightness.

Brightness does not use separate PWM: the firmware scales each channel with:

```c
scaled = (channel * (brightness + 1)) >> 8;
```

## USB

- D+ = `P3.6/UDP`, pin 12.
- D− = `P3.7/UDM`, pin 13.
- The datasheet warns against inserting resistors **in series** on P3.6/P3.7 when used for USB.
- The 10 kΩ resistor from the initial procedure is a temporary pull-up connection between P3.6 and V33, not a series resistor on the data line.

## Verified identity

| Field | Value |
|---|---|
| MCU | CH552, ID `0x5211` |
| UID | `57-07-60-BE-00-00-00-00` |
| Bootloader | `02.50` |
| Application code flash | 14 KiB |
| Data EEPROM | 128 bytes |
| Application VID:PID | `1189:8890` |
| USB manufacturer | `OpenMacroPad` |
| USB product | `CH552 RGB MacroPad` |
| USB serial | `CH552xHID` |
