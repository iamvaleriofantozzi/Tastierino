# 3keys_1knob

Custom firmware for a 3-key + rotary encoder macropad (https://hackaday.io/project/189914)

## Architecture (FILO-lite dual)

```
scan+debounce ──► PRESS/RELEASE/TICK ──► key_sm (×4)
                                            │
encoder rot (edge, fuori SM) ───────────────┤
                                            ▼
                              binding layer (KBD/CON/MOUSE)
                                            │
raw HID EXTERNAL ──► light_ctrl ◄── USER / INTERNAL
                          │ HAL = neo.h
                          ▼
                       NeoPixel
```

### `key_sm` — per-key LT state machine

| State | PRESS | RELEASE | TICK |
|---|---|---|---|
| **IDLE** | → PRESSED (wake/pulse; LT reset hold, else arm+press/seq) | — | — |
| **PRESSED** | — | LT: tap L0 if hold≥MIN else ignore; non-LT: release | LT: hold++; ≥HOLD → FN_HELD |
| **FN_HELD** | — | clear fn_mask → IDLE | — |

Timing (@ 5 ms/loop): `HOLD_TICKS=40` (~200 ms), `MIN_TAP_TICKS=4` (~20 ms), `DEBOUNCE_TICKS=2`.

### `light_ctrl` — LED requests

Sources: `USER` / `EXTERNAL` / `INTERNAL`. Requests via `light_rqt*` (switch dispatch). Owns fade, pulse, auto-off; `light_tick()` each loop.

Encoder stays edge-driven outside `key_sm` (v1).

## Installation

### Prerequisite
- Add yourself to `plugdev` group (`$ usermod -a -G plugdev <username>`)
- Copy `udev/99-macropad.rules` to `/etc/udev/rules.d/`
- Reload udev rules `$ udevadm control --reload-rules`
- Eventually replug the device

### compile:
`$ make bin`

### compile & flash to pad:
- if on original firmware: depending on hardware you need to connect P3.6 to
  5V (VCC) using a 1k resistor or P1.5 to GND, while connecting USB
- if on this firmware: press key1 while connecting USB
- `$ make flash`

### configure keys:
1. `$ isp55e0 --data-dump flashdata.bin`
2. edit first 6 bytes of this binary (3 keys, plus 3 for the knob), and write it back:
3. edit the next 9 bytes to flash colors (RR1 GG1 BB1 RR2 GG2 BB2 RR3 GG3 BB3)
4. `$ isp55e0 --data-flash flashdata.bin`

## Runtime
### lsusb
After flashing, it should show in `$ lsusb -d 4249: -vv`

### Changing colors
You can run the python script with examples in `tools/rgb.py`
