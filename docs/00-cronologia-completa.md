# Complete work timeline

## 1. Device identification

The device is a cheap USB macropad sold as a programmable RGB mechanical keyboard with three keys and an encoder. The vendor material included a PDF and a Google Drive folder with proprietary software. As requested, the software was not installed: it was only treated as material for analysis.

USB inspection and board photography led to identifying the microcontroller as a **CH552G**, an 8051 MCU with full-speed USB, 16 KiB of ROM, 128 bytes of DataFlash/EEPROM, and a built-in ISP bootloader.

## 2. First LED control attempt

The original firmware did not expose a documented protocol sufficient to reliably change the color. Several HID attempts did not produce the desired change. The LEDs were physically RGB: pressing the three keys produced blue, green and red pulses, so the NeoPixel chain, power and data connection were working.

## 3. Bootloader research

Research on the Hackaday project revealed two historical methods:

- older bootloader/IDE: `P1.5` pulled to GND;
- method used by more recent ch55xduino versions: `P3.6` pulled to `3V3/V33`.

This difference explained why guidance found online seemed contradictory. The actual device later reported, in the bootloader configuration register, `DOWNLOAD_CFG ... P4.6 / P1.5 / P3.6 (Default set)`, with bootloader version **2.50**.

## 4. Pin correction in the photograph

During the photographic analysis, the description "third pin from the bottom on the left" was initially used, then corrected. For the **CH552G SOP16** package, with orientation determined by the notch/dot:

- `P1.5` = physical pin **3**;
- `P3.6/UDP` = physical pin **12**;
- `GND` = physical pin **14**;
- `V33` = physical pin **16**.

The "second/third from the left" position must not be used without specifying the chip orientation.

## 5. Resistor and first ISP access

A 1 kΩ resistor was initially considered, but the procedure actually adopted used **10 kΩ** between `P3.6/UDP` and `V33`. The resistor was kept in place during reset, detection and flashing. LEDs turning on and then off were a hint of reset; certain recognition only came from `wchisp info` with the WCH bootloader VID:PID.

A reliable dump of the original firmware was not obtained before overwriting it. The absence of code protection, discovered later, does not automatically mean a verified backup procedure existed.

## 6. First custom firmware

The first custom binary enumerated as `1189:8890`, but read EEPROM bytes directly without magic number/version/checksum. Random leftover data was therefore interpreted as a keymap:

- counter-clockwise encoder rotation produced `Y`;
- clockwise encoder rotation and click produced no useful events;
- the three buttons had no understandable mapping;
- the LED pulses, however, demonstrated that the GPIOs and the RGB chain were correct.

This observation led to redesigning the EEPROM format.

## 7. Native macOS toolchain

SDCC 4.6 was installed via Homebrew. The project is compiled with `sdcc`, `packihx` and `sdobjcopy`. Flashing is performed with the native `wchisp` binary; no Windows VM is needed.

## 8. USB/HID evolution

The Raw HID implementation required several successive fixes:

1. EP2 endpoint size increased from 16 to 32 bytes;
2. added an IN direction in addition to OUT;
3. fixed the two-endpoint configuration descriptor;
4. selected the report descriptor via `wIndexL` (interface number), not `wValueL`;
5. corrected HID Input/Output flags as Data/Variable/Absolute;
6. added support for the `SET_REPORT` control request used by macOS;
7. added a Feature Report for a reliable response via IOHID.

The final macOS transport uses a 33-byte HID write (zero Report ID + 32 data bytes) and a 33-byte Feature Report read.

## 9. Local webapp

A webapp was built, served only on `127.0.0.1:8765`, with:

- device status;
- color pickers for the three LEDs;
- independent brightness for each LED;
- keymap for the six inputs;
- EEPROM save;
- firmware build;
- `.bin` upload with size/SHA-256 verification;
- software bootloader entry;
- flashing and verification with logging.

## 10. Final status

The final firmware was written with a `Verify OK` result. The following were verified:

- Raw HID interface visible on macOS;
- reading and writing colors;
- independent brightness levels `[51, 140, 255]`;
- persistence after EEPROM save and reboot;
- software bootloader entry and return to the application;
- firmware build and four passing automated tests.
