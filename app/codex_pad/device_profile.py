"""Temporary exclusive key profile for Codex Pad.

Backs up the complete configurable keymap to disk, applies a RAM-only
F13/F14/F15 profile with every macro/Fn/layer-tap action cleared, then
restores the original profile on clean daemon shutdown. EEPROM is untouched.
"""
import json
import logging
from pathlib import Path

from app.configurator import protocol

log = logging.getLogger(__name__)

BACKUP_FILE = Path(__file__).resolve().parent / "data" / "device_keymap_backup.json"


def _empty_keys():
    return [{"mod": 0, "type": 0, "code": 0} for _ in range(6)]


def _codex_keys():
    keys = _empty_keys()
    keys[0] = {"mod": 0, "type": 0, "code": 0x68}  # F13
    keys[1] = {"mod": 0, "type": 0, "code": 0x69}  # F14
    keys[2] = {"mod": 0, "type": 0, "code": 0x6A}  # F15
    return keys


class DeviceProfile:
    def __init__(self, pad, backup_path=BACKUP_FILE):
        self.pad = pad
        self.backup_path = Path(backup_path)
        self.active = False

    def _write_backup(self, data):
        self.backup_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.backup_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2))
        tmp.replace(self.backup_path)

    def _capture(self):
        config = self.pad.get_config()
        return {
            "version": 1,
            "lt_mask": config["lt_mask"],
            "keys_l0": config["keys_l0"],
            "keys_fn": config["keys_fn"],
        }

    def _apply_codex(self):
        empty = _empty_keys()
        self.pad.set_lt_mask(0)
        self.pad.set_keymap(_codex_keys(), layer=0, step=0)
        self.pad.set_keymap(empty, layer=0, step=1)
        for layer in range(1, protocol.LAYER_COUNT):
            self.pad.set_keymap(empty, layer=layer, step=0)

    def activate(self):
        if not self.backup_path.exists():
            self._write_backup(self._capture())
            log.info("saved device keymap backup to %s", self.backup_path)
        else:
            log.info("reusing existing device keymap backup %s", self.backup_path)
        self._apply_codex()
        self.active = True
        log.info("exclusive F13/F14/F15 key profile active (RAM only)")

    def restore(self):
        if not self.backup_path.exists():
            return
        data = json.loads(self.backup_path.read_text())
        keys_l0 = data["keys_l0"]
        self.pad.set_lt_mask(0)
        self.pad.set_keymap(keys_l0, layer=0, step=0)
        self.pad.set_keymap(keys_l0, layer=0, step=1)
        for layer, keys in enumerate(data["keys_fn"], start=1):
            self.pad.set_keymap(keys, layer=layer, step=0)
        self.pad.set_lt_mask(data["lt_mask"])
        self.backup_path.unlink()
        self.active = False
        log.info("restored original device keymap")
