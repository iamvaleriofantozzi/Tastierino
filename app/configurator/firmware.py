import hashlib
import os
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIRMWARE_DIR = ROOT / "firmware"
DEFAULT_BIN = FIRMWARE_DIR / "3keys_1knob.bin"
UPLOAD_BIN = ROOT / "work" / "uploaded-firmware.bin"
MAX_CODE_SIZE = 0x3800
_ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
_INFO_PREFIX_RE = re.compile(r"^(?:\d{1,2}:\d{2}:\d{2}\s+)?\[INFO\]\s*")

# Project-local first, then common install locations (Finder/.command has a thin PATH).
_WCHISP_CANDIDATES = (
    ROOT / "tools" / "wchisp",
    ROOT / "bin" / "wchisp",
    Path.home() / ".local" / "bin" / "wchisp",
    Path.home() / "bin" / "wchisp",
    Path("/opt/homebrew/bin/wchisp"),
    Path("/usr/local/bin/wchisp"),
)


def sanitize_log(text):
    """Strip ANSI colors and noisy register dumps from tool output."""
    text = _ANSI_RE.sub("", text or "")
    lines = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith(("REVERSED:", "WPROTECT:", "GLOBAL_CFG:", "`-")):
            continue
        if re.match(r"^\[\d+:\d+\]", line):
            continue
        line = _INFO_PREFIX_RE.sub("", line)
        lines.append(line)
    return "\n".join(lines)


def locate_wchisp():
    override = os.environ.get("WCHISP")
    if override:
        path = Path(override).expanduser()
        if path.is_file() and os.access(path, os.X_OK):
            return path.resolve()
        raise RuntimeError(f"Invalid WCHISP path: {path}")

    found = shutil.which("wchisp")
    if found:
        return Path(found).resolve()

    for candidate in _WCHISP_CANDIDATES:
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return candidate.resolve()

    hint = ROOT / "tools" / "wchisp"
    raise RuntimeError(
        "wchisp not found. Put the binary at "
        f"{hint}, add it to PATH, or set WCHISP to the absolute path."
    )


def inspect_binary(path):
    path = Path(path).resolve()
    if not path.is_file():
        raise RuntimeError("Firmware file not found")
    data = path.read_bytes()
    if not data:
        raise RuntimeError("Firmware is empty")
    if len(data) > MAX_CODE_SIZE:
        raise RuntimeError(f"Firmware too large: {len(data)} > {MAX_CODE_SIZE} bytes")
    from . import protocol as proto

    return {
        "path": str(path),
        "size": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "version": proto.FW_VERSION,
        "major": proto.FW_VERSION_MAJOR,
        "minor": proto.FW_VERSION_MINOR,
        "patch": proto.FW_VERSION_PATCH,
    }


def build():
    process = subprocess.run(["make", "clean", "all"], cwd=FIRMWARE_DIR, text=True,
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120)
    log = sanitize_log(process.stdout)
    if process.returncode:
        raise RuntimeError(log or process.stdout)
    return {"firmware": inspect_binary(DEFAULT_BIN), "log": log}


def save_upload(data):
    if not data or len(data) > MAX_CODE_SIZE:
        raise RuntimeError("Invalid firmware size")
    UPLOAD_BIN.parent.mkdir(parents=True, exist_ok=True)
    UPLOAD_BIN.write_bytes(data)
    return inspect_binary(UPLOAD_BIN)


def flash(path=DEFAULT_BIN):
    info = inspect_binary(path)
    tool = locate_wchisp()
    env = os.environ.copy()
    env.setdefault("NO_COLOR", "1")
    env.setdefault("TERM", "dumb")
    process = subprocess.run(
        [str(tool), "flash", info["path"]],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=45,
        env=env,
    )
    log = sanitize_log(process.stdout)
    if process.returncode:
        raise RuntimeError(log or process.stdout)
    return {"firmware": info, "log": log, "wchisp": str(tool)}
