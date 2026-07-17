# Raw HID protocol

## Transport

- logical size: 32 bytes;
- no application-level Report ID;
- macOS host: `write()` sends 33 bytes, with a leading zero as the Report ID;
- response: 33-byte Feature report, from which the host strips the leading zero.

Every response uses `command | 0x80` in byte 0 and the status in byte 1.

| Status | Meaning |
|---:|---|
| 0 | OK |
| 1 | unknown command |
| 2 | wrong length |

## Commands

| Cmd | Name | Payload / response |
|---:|---|---|
| `0x01` | `SET_RGB` | bytes 1–9: three RGB triplets |
| `0x02` | `GET_CONFIG` | protocol in byte 2; LT mask in byte 3; Layer 0 keymap bytes 4–21; RGB bytes 22–30 |
| `0x03` | `SET_KEYMAP` | byte 1 = layer (0 tap, 1–4 = Fn0–Fn3); bytes 2–19: six `[mod,type,code]` |
| `0x04` | `SAVE_CONFIG` | writes current RAM state to Data Flash |
| `0x05` | `SET_BRIGHTNESS` | bytes 1–3: brightness per LED; a single byte sets all of them |
| `0x06` | `ENTER_BOOTLOADER` | replies, waits 50 ms, jumps to the bootloader |
| `0x07` | `PING` | replies with protocol version in byte 2 |
| `0x08` | `GET_LIGHTING` | brightness bytes 2–4; RGB bytes 5–13 |
| `0x0A` | `GET_KEYMAP` | request byte 1 = layer 0–4; response byte 2 = layer; bytes 3–20 keymap |
| `0x0B` | `SET_LT_MASK` | byte 1 = mask bits 0–3 (Button 1–3 + encoder click) |

Protocol version **3**. Keymap: `type=0` Keyboard, `type=1` Consumer/Media, `type=2` Mouse (`code`: `0x01` left / `0x02` right / `0x04` middle / `0x10` scroll up / `0x11` scroll down). LT = tap Layer 0 / hold (~200 ms) → **per-Fn layer** (`1+fn`, Fn key 0..3). Same target can have different shortcuts under different Fn keys. Only the held Fn key LED goes white @ max.

## Host sequence on macOS

The working method is:

1. open only the interface with usage page `0xFF60`;
2. send `0x00 + 32_byte_packet` with `write()`;
3. poll `get_feature_report(0, 33)` until timeout;
4. strip any leading zero;
5. verify the response command and status.

This trade-off is necessary because during testing a plain interrupt read returned zero or no response, while `send_feature_report()` was not reliable on this macOS/IOHID implementation.
