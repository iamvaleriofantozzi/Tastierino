"""Server-side settings file — shared across all browsers on this host."""

from __future__ import annotations

import json
import threading
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"
SETTINGS_PATH = DATA_DIR / "settings.json"
_LOCK = threading.Lock()

_DEFAULT_L0 = [
    {"mod": 0, "type": 0, "code": 0x68},
    {"mod": 0, "type": 0, "code": 0x69},
    {"mod": 0, "type": 0, "code": 0x6A},
    {"mod": 0, "type": 1, "code": 0xE2},
    {"mod": 0, "type": 1, "code": 0xE9},
    {"mod": 0, "type": 1, "code": 0xEA},
]
_DEFAULT_FN = [
    {"mod": 0, "type": 0, "code": 0x6B},
    {"mod": 0, "type": 0, "code": 0x6C},
    {"mod": 0, "type": 0, "code": 0x6D},
    {"mod": 0, "type": 1, "code": 0xCD},
    {"mod": 0, "type": 1, "code": 0xB5},
    {"mod": 0, "type": 1, "code": 0xB6},
]

DEFAULTS = {
    "v": 2,
    "keys_l0": [dict(k) for k in _DEFAULT_L0],
    "keys_fn": [[dict(k) for k in _DEFAULT_FN] for _ in range(4)],
    "lt_mask": 0,
    "hold_entries": [],
    "colors": [[0, 80, 255], [0, 255, 80], [255, 20, 0]],
    "brightness": [160, 160, 160],
    "pulse": [True, True, True],
}


def _clean_key(item: dict) -> dict:
    return {
        "mod": int(item["mod"]) & 0xFF,
        "type": int(item["type"]) & 0xFF,
        "code": int(item["code"]) & 0xFF,
    }


def _clean_keys(keys) -> list:
    if not isinstance(keys, list) or len(keys) != 6:
        raise ValueError("Six key mappings required")
    out = []
    for key in keys:
        cleaned = _clean_key(key)
        if cleaned["type"] not in (0, 1, 2):
            raise ValueError("Invalid key type")
        out.append(cleaned)
    return out


def _clean_keys_fn(keys_fn, legacy_l1=None) -> list:
    if isinstance(keys_fn, list) and len(keys_fn) == 4:
        return [_clean_keys(layer) for layer in keys_fn]
    if legacy_l1 is not None:
        shared = _clean_keys(legacy_l1)
        return [[dict(k) for k in shared] for _ in range(4)]
    return [[dict(k) for k in _DEFAULT_FN] for _ in range(4)]


def _clean_hold_entries(entries) -> list:
    if entries is None:
        return []
    if not isinstance(entries, list):
        raise ValueError("Invalid hold_entries")
    out = []
    seen = set()
    for item in entries:
        fn = int(item["fn"])
        target = int(item["target"])
        if not 0 <= fn <= 3 or not 0 <= target <= 5:
            raise ValueError("Invalid hold entry")
        key = (fn, target)
        if key in seen:
            continue
        seen.add(key)
        out.append({"fn": fn, "target": target})
    return out


def _clean_colors(colors) -> list:
    if not isinstance(colors, list) or len(colors) != 3:
        raise ValueError("Invalid colors")
    out = []
    for color in colors:
        if not isinstance(color, list) or len(color) != 3:
            raise ValueError("Invalid colors")
        out.append([int(c) & 0xFF for c in color])
    return out


def _clean_brightness(values) -> list:
    if not isinstance(values, list) or len(values) != 3:
        raise ValueError("Invalid brightness")
    return [max(0, min(255, int(v))) for v in values]


def _clean_pulse(flags) -> list:
    if not isinstance(flags, list) or len(flags) != 3:
        raise ValueError("Invalid pulse")
    return [bool(flag) for flag in flags]


def normalize(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValueError("Settings must be an object")
    lt_mask = int(data.get("lt_mask", 0)) & 0x0F
    keys_fn = _clean_keys_fn(data.get("keys_fn"), data.get("keys_l1"))
    return {
        "v": 2,
        "keys_l0": _clean_keys(data.get("keys_l0") or data.get("keys") or DEFAULTS["keys_l0"]),
        "keys_fn": keys_fn,
        "keys_l1": [dict(k) for k in keys_fn[0]],
        "lt_mask": lt_mask,
        "hold_entries": _clean_hold_entries(data.get("hold_entries") or data.get("holdEntries")),
        "colors": _clean_colors(data.get("colors") or DEFAULTS["colors"]),
        "brightness": _clean_brightness(data.get("brightness") or DEFAULTS["brightness"]),
        "pulse": _clean_pulse(data.get("pulse") if "pulse" in data else DEFAULTS["pulse"]),
    }


def load() -> dict:
    with _LOCK:
        if not SETTINGS_PATH.is_file():
            return {"exists": False, **DEFAULTS, "keys_l1": [dict(k) for k in _DEFAULT_FN]}
        try:
            raw = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
            normalized = normalize(raw)
            return {"exists": True, **normalized}
        except (OSError, json.JSONDecodeError, ValueError, KeyError, TypeError):
            return {"exists": False, **DEFAULTS, "keys_l1": [dict(k) for k in _DEFAULT_FN]}


def save(data: dict) -> dict:
    normalized = normalize(data)
    with _LOCK:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        tmp = SETTINGS_PATH.with_suffix(".tmp")
        tmp.write_text(json.dumps(normalized, indent=2) + "\n", encoding="utf-8")
        tmp.replace(SETTINGS_PATH)
    return {"exists": True, **normalized}
