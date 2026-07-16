# Local Python webapp

The webapp exposes control of the keypad on `http://127.0.0.1:8765/`. The server is bound exclusively to loopback and is not reachable from the LAN.

## Components

- `app/device.py`: HID enumeration, packet exchange and device API;
- `app/protocol.py`: VID/PID, commands and control names;
- `app/firmware.py`: build, binary validation and flashing;
- `app/server.py`: HTTP server and JSON API;
- `app/static/`: HTML/CSS/JavaScript interface;
- `start.command`: virtualenv, dependencies, startup and browser launch.

## API

| Method | Endpoint | Function |
|---|---|---|
| GET | `/api/status` | HID status and identity |
| GET | `/api/config` | keymap, colors and brightness |
| GET | `/api/firmware` | binary size and SHA-256 |
| POST | `/api/rgb` | live colors and brightness |
| POST | `/api/keymap` | live keymap |
| POST | `/api/save` | persistence to Data Flash |
| POST | `/api/build` | `make clean all` |
| POST | `/api/firmware/upload` | validates an external binary |
| POST | `/api/bootloader` | software jump to bootloader |
| POST | `/api/flash` | flash after explicit confirmation |

All POST requests must include `X-Macropad-Client: 1`. This is a minimal safeguard against random requests from other pages; it is not an authentication system.

## Usage

```sh
./start.command
```

Moving a slider or picking a color changes the firmware's RAM. "Save to memory" sends the current keymap and lighting, then `SAVE_CONFIG`; only then does the configuration survive a reset.

Flashing requires explicit confirmation. The server also checks that the file is not empty and does not exceed `0x3800` bytes, but it cannot semantically prove that an external binary is intended for this board.
