# CH552 RGB MacroPad — complete dossier

This folder holds the analysis, decisions, procedures, diagrams and final status of the project carried out on July 16, 2026 on the three-key USB keypad with encoder based on **CH552G**.

## Index

1. [Complete timeline](00-cronologia-completa.md)
2. [Hardware, package and pinout](01-hardware-e-pinout.md)
3. [Bootloader and the 10 kΩ resistor](02-bootloader-e-resistenza.md)
4. [First flash from macOS](03-primo-flash-macos.md)
5. [Firmware architecture](04-architettura-firmware.md)
6. [Raw HID protocol](05-protocollo-raw-hid.md)
7. [Webapp and Python backend](06-webapp-python.md)
8. [Tests, issues and recovery](07-test-e-troubleshooting.md)
9. [Verified final status](08-stato-finale.md)
10. [Code snapshot and inventory](09-codice-e-snapshot.md)
11. [Technical diagrams](schemi/README.md)
12. [Automatic code graph](graph/README.md)
13. [Original vendor manual](10-manuale-originale.md)

## Warning

Bootloader operations can temporarily render the device unusable if the flash is interrupted. Always check the package orientation, disconnect power during soldering, and make sure there are no short circuits. The resistor-based connection described here is a recovery/first-access procedure, not an ordinary USB connection.

## Main references

- [CH552/CH551 datasheet, version 1G](https://cdn-learn.adafruit.com/assets/assets/000/129/847/original/CH552DS1.PDF?1715004485=)
- [Hackaday — RGB macropad custom firmware](https://hackaday.io/project/189914-rgb-macropad-custom-firmware)
- [Original AliExpress product](https://it.aliexpress.com/item/1005005120738913.html)
- [Original software shared by the vendor](https://drive.google.com/drive/folders/1xqFDp-l5TVA_6Ojsn0rt7GqvF5EvWDCi?usp=share_link) — analyzed, not installed during the initial work.

## Summary of results

- No Windows VM required.
- Firmware compiled with SDCC and flashed from macOS with `wchisp`.
- HID keyboard + consumer control + vendor-defined Raw HID interface.
- Color and brightness controllable from software for each of the three LEDs.
- Six remappable inputs: three keys, encoder click, clockwise and counter-clockwise rotation.
- Persistent configuration in EEPROM with magic number, version and checksum.
- Future firmware updates can be launched from the webapp via a software bootloader.
