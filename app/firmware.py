import hashlib
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIRMWARE_DIR = ROOT / "firmware"
DEFAULT_BIN = FIRMWARE_DIR / "3keys_1knob.bin"
UPLOAD_BIN = ROOT / "work" / "uploaded-firmware.bin"
MAX_CODE_SIZE = 0x3800


def locate_wchisp():
    override = os.environ.get("WCHISP")
    if override:
        path = Path(override).expanduser()
        if path.is_file():
            return path
        raise RuntimeError(f"WCHISP non valido: {path}")
    found = shutil.which("wchisp")
    if found:
        return Path(found)
    raise RuntimeError("wchisp non trovato nel PATH (oppure imposta WCHISP)")


def inspect_binary(path):
    path = Path(path).resolve()
    if not path.is_file():
        raise RuntimeError("File firmware non trovato")
    data = path.read_bytes()
    if not data:
        raise RuntimeError("Il firmware è vuoto")
    if len(data) > MAX_CODE_SIZE:
        raise RuntimeError(f"Firmware troppo grande: {len(data)} > {MAX_CODE_SIZE} byte")
    return {"path": str(path), "size": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def build():
    process = subprocess.run(["make", "clean", "all"], cwd=FIRMWARE_DIR, text=True,
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120)
    if process.returncode:
        raise RuntimeError(process.stdout)
    return {"firmware": inspect_binary(DEFAULT_BIN), "log": process.stdout}


def save_upload(data):
    if not data or len(data) > MAX_CODE_SIZE:
        raise RuntimeError("Dimensione firmware non valida")
    UPLOAD_BIN.parent.mkdir(parents=True, exist_ok=True)
    UPLOAD_BIN.write_bytes(data)
    return inspect_binary(UPLOAD_BIN)


def flash(path=DEFAULT_BIN):
    info = inspect_binary(path)
    tool = locate_wchisp()
    process = subprocess.run([str(tool), "flash", info["path"]], cwd=ROOT, text=True,
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=45)
    if process.returncode:
        raise RuntimeError(process.stdout)
    return {"firmware": info, "log": process.stdout}

