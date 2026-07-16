# Original vendor manual

The original PDF is stored at [riferimenti/manuale-venditore.pdf](riferimenti/manuale-venditore.pdf). It's a single, very long vertical page, laid out as a graphic composition; automatic text extraction loses spacing, but the visual rendering is readable.

SHA-256 of the stored PDF: `addc673d8d93239511f18185cb63f3cd47e4f333209023c4c926fd53f450856e`.

## Content

The manual confirms:

- three independent keys, stated as not pressable simultaneously in the original software;
- an encoder with left rotation, right rotation and press;
- a single layer;
- configuration of key combinations and media commands;
- downloading the configuration to the device via Windows software;
- three LED modes: `0`, `1` and `2`;
- the ability to turn the backlight on or off with a "LED mode" entry.

The screenshots show an application called `Mini Keyboard`/similar software with controls `KEY1`, `K1 Left`, `K1 Centre`, `K1 Right`, modifiers, keycodes, media controls, and a `Download` button.

## Limitations compared to the new firmware

The manual describes predefined global LED effects, not a protocol for setting each LED's color and brightness individually from Python. The firmware and webapp built in this project replace that behavior with the documented Raw HID control.

The PDF includes a vendor download link and instructions to disable antivirus on first launch. The original software was not installed, as requested; it was treated as untrusted material and analyzed only through its documentation/files.
