# First flash from macOS

No Windows VM is needed. Compilation is done with SDCC and programming with `wchisp`, directly from macOS.

## Prerequisites

```sh
brew install sdcc
```

Also install `wchisp` and make it discoverable. The webapp looks for it in this order:

1. `WCHISP` environment variable
2. `PATH`
3. project-local `tools/wchisp`
4. common locations (`~/.local/bin`, Homebrew)

```sh
# recommended for this repo
ln -s /absolute/path/to/wchisp tools/wchisp
wchisp --help
```

`start.command` also widens `PATH` so Finder launches can still find Homebrew tools.

## Compilation

From the project root:

```sh
make -C firmware clean all
```

The linker is configured with a `0x3800` limit, i.e. 14,336 bytes. The binary documented in this snapshot is 6,204 bytes and has SHA-256:

```text
2ceffde3bff9a2a5f6176ac49a287ac443a3d4d92bf7a9ab2a203ba3b365cf1b
```

The range size reported by the programmer can be larger than the actual file size because the image gets aligned or padded during writing.

## Detection and flashing

Enter the bootloader with the procedure described in [02-bootloader-e-resistenza.md](02-bootloader-e-resistenza.md), then quickly run:

```sh
wchisp info
wchisp flash firmware/3keys_1knob.bin
```

The device detected during testing was a `CH552` with bootloader `2.50`. Consider the flash successful only when the tool exits without error and reports a positive verification.

## Follow-up check

After rebooting, macOS should see:

- VID:PID `1189:8890`;
- keyboard/consumer HID interface;
- vendor-defined Raw HID interface, usage page `0xFF60`.

The webapp should show "connected" and be able to read the configuration and lighting.
