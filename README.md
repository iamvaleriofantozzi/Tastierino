# 🎹 CH552 Control Center

> The AliExpress RGB macropad becomes a real tool: independent LEDs, live keymap, persistent EEPROM, and flash from macOS — no Windows VM.

Stock firmware is locked. **This repo unlocks it**: local webapp, Raw HID protocol, SDCC build, and a documented bootloader procedure. Three keys + encoder → full control.

📚 Full documentation (pinout, schematics, protocol, troubleshooting): [`docs/README.md`](docs/README.md)

---

## ✨ What you unlock

| Before (stock) | After (this repo) |
|---|---|
| Fixed colors / Windows tool | 🎨 RGB + brightness **per LED**, live |
| Locked keymap | ⌨️ Six remappable inputs (HID) |
| Hard to flash | ⚡ Bootloader + `wchisp` from macOS |
| No API | 🔌 Raw HID vendor (`0xFF60`), 32-byte packets |
| Reset = lose everything | 💾 EEPROM save (magic + checksum) |

---

## 🚀 Quick start (macOS)

```sh
./start.command
```

Or double-click `start.command`.

🌐 Local UI only: [http://127.0.0.1:8765](http://127.0.0.1:8765)

---

## 🧰 Flash prerequisites

```sh
brew install sdcc
# install wchisp and put it on PATH
wchisp --help
make -C firmware clean all
```

If `wchisp` is not on `PATH`, set `WCHISP` to the binary path. Details: [`docs/03-primo-flash-macos.md`](docs/03-primo-flash-macos.md).

---

## 🔓 First flash (stock firmware)

Original firmware has **no** software bootloader command. You need a **temporary 10 kΩ** pull-up on the CH552G (SOP16) — that is the step that opens the chip.

| 🔌 Resistor | From | To |
|---|---|---|
| **10 kΩ** | pin **12** (`P3.6` / USB D+) | pin **16** (`V33`) |

⚠️ This is not a resistor **in series** on the USB cable (the chip already has those). Do not put 5 V on `P3.6`. Do not solder with the board powered.

Pinout: [`docs/01-hardware-e-pinout.md`](docs/01-hardware-e-pinout.md) · Detailed procedure: [`docs/02-bootloader-e-resistenza.md`](docs/02-bootloader-e-resistenza.md)

### Steps

1. 🔌 Unplug USB — board powered off.
2. 🔧 Connect the 10 kΩ between pins 12 and 16. Check for bridges to nearby pins.
3. ⚡ Plug USB back in (or reset). Bootloader stays open ~**10 seconds**.
4. 🚀 Immediately:

```sh
wchisp info
wchisp flash firmware/3keys_1knob.bin
```

5. ✅ Wait for `Verify OK` → unplug USB → **remove** the resistor.
6. 🎉 Replug: VID:PID `1189:8890` and webapp shows “connected”.

💡 Blinking LEDs ≠ bootloader. Hard proof: `wchisp info` sees the CH552.

If `P3.6→V33` fails, some guides mention `P1.5` to GND — on this hardware the **10 kΩ** method worked.

---

## ♻️ Later flashes (custom firmware already installed)

After the first flash the resistor is **no longer needed**. You unlocked the easy path.

**🖥️ From webapp:** **Start flash** → sends `ENTER_BOOTLOADER` and writes the binary.

**⌨️ From hardware:**

1. Unplug USB
2. Hold **button 1** (or all three if you are unsure of the order)
3. Replug — white LEDs → jump to bootloader
4. Flash from webapp or `wchisp flash firmware/3keys_1knob.bin`

⛔ Do not unplug USB during write/verify.

---

## 🗺️ Default mapping

| Input | Action |
|---|---|
| Buttons 1–3 | F13, F14, F15 |
| Encoder click | Mute |
| Encoder clockwise | Volume up |
| Encoder counterclockwise | Volume down |

UI codes are decimal USB HID. `Apply` = RAM · `Save to memory` = EEPROM (colors, 3 brightness levels, keymap, magic + checksum).

---

## 🛠️ Development

```sh
brew install sdcc
make -C firmware all
python3 -m unittest discover -s tests
```

Firmware: VID:PID `1189:8890` · Raw HID usage page `0xFF60` · bidirectional 32-byte packets.

---

## ⚠️ Warning

Bootloader operations can leave the device temporarily unusable if you interrupt the flash. Check package orientation, power disconnected while soldering, no shorts. The 10 kΩ is only for **first access / recovery**, not a normal USB connection.
