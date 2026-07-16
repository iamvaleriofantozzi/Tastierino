# Tests and troubleshooting

## Issues encountered and fixes

| Symptom | Root cause | Fix |
|---|---|---|
| Color did not change with the original software | proprietary protocol unknown | custom Raw HID firmware |
| Counter-clockwise encoder produced `Y`; other inputs silent | Data Flash not initialized/provisional firmware | signature, version and checksum; safe defaults |
| Raw HID not enumerated | wrong report descriptor selection (`wValueL` instead of the interface index) | correct dispatch using `wIndexL` |
| Truncated packets | descriptor/endpoint initially at 16 bytes | unified to 32 bytes |
| Commands arrived but no response | endpoint configured OUT only | endpoint 2 made bidirectional |
| macOS read zeros | IOHID differences in Output/Feature handling | `write()` + stored response + `get_feature_report()` |
| `send_feature_report()` failed | unreliable control path in hidapi/macOS | use the sequence above |
| UI showed odd values during update | stale/cached tabs and changed config schema | disabled caching for JSON, page reload |
| `wchisp` couldn't see the device | bootloader window expired | reset and issue the command immediately |
| Uncertainty about the boot button | physical order not certain | hold all three down; the firmware reads `PIN_KEY1` |

## Local checks

```sh
make -C firmware clean all
python3 -m unittest discover -s tests
```

Recommended manual checks:

1. read `/api/status` and `/api/config`;
2. set different colors and brightness levels of 20%, 55%, 100%;
3. reset without saving and verify it returns to the persisted values;
4. save, reset and re-read;
5. try F13/F14/F15, mute, volume up and volume down;
6. only enter the bootloader when actually necessary.

## Recovery

- **Webapp offline:** close any previous instances, reconnect USB, relaunch `start.command`.
- **Raw HID missing but keyboard present:** an old firmware or outdated descriptor is likely running.
- **All LEDs white:** the firmware has detected `PIN_KEY1` pressed and is jumping to the bootloader.
- **Flash doesn't start:** repeat reset/reconnection and launch `wchisp` within a few seconds.
- **No USB enumeration:** disconnect, inspect the soldering, and remove the temporary connection before further attempts.
