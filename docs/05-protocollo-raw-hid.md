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
| `0x02` | `GET_CONFIG` | version in byte 2; legacy brightness in byte 3; keymap bytes 4–21; RGB bytes 22–30 |
| `0x03` | `SET_KEYMAP` | bytes 1–18: six `[mod,type,code]` records |
| `0x04` | `SAVE_CONFIG` | writes current RAM state to Data Flash |
| `0x05` | `SET_BRIGHTNESS` | bytes 1–3: brightness per LED; a single byte sets all of them |
| `0x06` | `ENTER_BOOTLOADER` | replies, waits 50 ms, jumps to the bootloader |
| `0x07` | `PING` | replies with protocol version in byte 2 |
| `0x08` | `GET_LIGHTING` | brightness bytes 2–4; RGB bytes 5–13 |

For the keymap, `type=0` means Keyboard and `type=1` means Consumer. Modifier and code are HID bytes.

## Host sequence on macOS

The working method is:

1. open only the interface with usage page `0xFF60`;
2. send `0x00 + 32_byte_packet` with `write()`;
3. poll `get_feature_report(0, 33)` until timeout;
4. strip any leading zero;
5. verify the response command and status.

This trade-off is necessary because during testing a plain interrupt read returned zero or no response, while `send_feature_report()` was not reliable on this macOS/IOHID implementation.
