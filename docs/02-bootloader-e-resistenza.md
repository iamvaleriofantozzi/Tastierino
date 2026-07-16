# Bootloader and the 10 kΩ resistor

## Verified conclusion

For first access to the WCH bootloader, a **temporary 10 kΩ** pull-up was used between:

- `P3.6 / UDP`, physical pin 12 of the CH552G;
- `V33`, physical pin 16.

The resistor must not be inserted in series on the USB line. The datasheet explicitly advises against series resistors on `UDM` and `UDP`, because the CH552 already integrates the ones it needs.

## Why not P1.5

There are two procedures, referring to different bootloaders/configurations:

- historical method: `P1.5` to GND during reset;
- more recent method adopted by ch55xduino: `P3.6` to `3V3/V33` during reset.

The Hackaday project cited during the analysis describes exactly this change. On this unit, the approach that allowed progress was `P3.6 → 10 kΩ → V33`. `P1.5` is physical pin 3; it is not the "second pin from the bottom on the left".

## First flash procedure

1. Disconnect USB and work with the board unpowered.
2. Connect a 10 kΩ resistor between pin 12 (`P3.6/UDP`) and pin 16 (`V33`).
3. Check with a magnifier or multimeter that there are no bridges to adjacent pins.
4. Reconnect USB or reset the board.
5. Verify immediately with `wchisp info`: the bootloader stays available for a short window, about ten seconds.
6. If the device is recognized as a CH552 bootloader, proceed with flashing and wait for `Verify OK`.
7. Disconnect USB and remove the temporary connection, unless it's needed for another recovery session.

LEDs turning on and off is a hint, not proof, of entering the bootloader. The proof is positive identification by `wchisp`.

## After the first custom firmware

The new firmware offers two simpler paths:

- Raw HID command `ENTER_BOOTLOADER` (`0x06`), used by the webapp;
- startup with `PIN_KEY1` held down; the LEDs turn white before jumping to the bootloader.

Since the physical order of the buttons was initially uncertain, all three buttons were held down on reconnection during recovery. This guarantees that `PIN_KEY1` is also pressed. In the code, however, only `PIN_KEY1` triggers the jump.

## Precautions

- Do not solder or move the resistor while the board is powered.
- Do not short `V33` to GND.
- Do not apply 5 V directly to `P3.6`.
- Do not interrupt USB during writing or verification.
- Confirm the MCU and binary file before every flash.
