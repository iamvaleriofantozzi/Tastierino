# Verified final status

Snapshot date: **July 16, 2026**.

## Hardware and USB

- MCU: CH552G, SOP16;
- Application VID:PID: `1189:8890`;
- Raw HID: usage page `0xFF60`, 32-byte packets;
- three addressable RGB LEDs with independent brightness;
- three buttons and an encoder with click.

## Configuration persisted during the session

- LED 1: red `[255,0,0]`, brightness `51/255` (20%);
- LED 2: red `[255,0,0]`, brightness `140/255` (55%);
- LED 3: red `[255,0,0]`, brightness `255/255` (100%);
- buttons: F13, F14, F15;
- encoder: mute, volume up, volume down.

The lighting values were re-read after saving/resetting during the session.

## Firmware

- file: `firmware/3keys_1knob.bin`;
- snapshot size: 6,204 bytes;
- limit: 14,336 bytes;
- SHA-256: `2ceffde3bff9a2a5f6176ac49a287ac443a3d4d92bf7a9ab2a203ba3b365cf1b`.

## Tests

The suite contains four unit tests for the device protocol and firmware handling. Build and tests are re-run in the final verification of this archive.

## Known limitations

- `wchisp` must be in the `PATH`, or specified via the `WCHISP` environment variable.
- The local CH55x header includes many generic USB structures that aren't used directly: the static graph shows them as communities or isolated nodes.
- Software control requires the custom firmware; the original firmware did not expose the protocol documented here.
