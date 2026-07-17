import json
import mimetypes
import subprocess
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from .device import DeviceError, MacroPad
from . import firmware
from . import settings_store

STATIC = Path(__file__).with_name("static")
DEVICE = MacroPad()


class Handler(BaseHTTPRequestHandler):
    server_version = "CH552Control/1.0"

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def send_json(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length) or b"{}")

    def do_GET(self):
        path = urlparse(self.path).path
        try:
            if path == "/api/status":
                self.send_json(200, DEVICE.status())
                return
            if path == "/api/config":
                self.send_json(200, DEVICE.get_config())
                return
            if path == "/api/settings":
                self.send_json(200, settings_store.load())
                return
            if path == "/api/firmware":
                self.send_json(200, firmware.inspect_binary(firmware.DEFAULT_BIN))
                return
            requested = "index.html" if path == "/" else path.lstrip("/")
            file = (STATIC / requested).resolve()
            if STATIC.resolve() not in file.parents or not file.is_file():
                self.send_error(404)
                return
            data = file.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(file.name)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as exc:
            self.send_json(503, {"error": str(exc)})

    def do_POST(self):
        if self.headers.get("X-Macropad-Client") != "1":
            self.send_json(403, {"error": "Unauthorized local request"})
            return
        path = urlparse(self.path).path
        try:
            if path == "/api/rgb":
                data = self.read_json()
                colors = data["colors"]
                if len(colors) != 3 or any(len(c) != 3 or any(not isinstance(x, int) or x < 0 or x > 255 for x in c) for c in colors):
                    raise ValueError("Invalid RGB colors")
                DEVICE.set_rgb(colors)
                if "brightness" in data:
                    values = data["brightness"]
                    if isinstance(values, int):
                        values = [values] * 3
                    if len(values) != 3 or any(not isinstance(value, int) or not 0 <= value <= 255 for value in values):
                        raise ValueError("Invalid brightness")
                    DEVICE.set_brightness(values)
                if "pulse" in data:
                    pulse = data["pulse"]
                    if len(pulse) != 3 or any(not isinstance(flag, bool) for flag in pulse):
                        raise ValueError("Invalid pulse flags")
                    DEVICE.set_pulse(pulse)
                self.send_json(200, {"ok": True})
            elif path == "/api/keymap":
                data = self.read_json()
                keys = data["keys"]
                layer = int(data.get("layer", 0))
                step = int(data.get("step", 0))
                if layer not in range(5):
                    raise ValueError("Invalid layer")
                if step not in range(2):
                    raise ValueError("Invalid step")
                if len(keys) != 6:
                    raise ValueError("Six mappings required")
                for key in keys:
                    steps = key.get("steps")
                    if isinstance(steps, list):
                        if not steps and step == 0:
                            continue
                        src = steps[step] if step < len(steps) else {"mod": 0, "type": 0, "code": 0}
                    else:
                        src = key
                    if int(src.get("type", 0)) not in (0, 1, 2):
                        raise ValueError("Invalid mapping")
                    if any(not 0 <= int(src.get(x, 0)) <= 255 for x in ("mod", "code", "type")):
                        raise ValueError("Invalid mapping")
                if layer == 0:
                    DEVICE.set_keymap(keys, layer=0, step=0)
                    DEVICE.set_keymap(keys, layer=0, step=1)
                else:
                    DEVICE.set_keymap(keys, layer=layer, step=0)
                if "lt_mask" in data:
                    mask = int(data["lt_mask"])
                    if not 0 <= mask <= 0x0F:
                        raise ValueError("Invalid LT mask")
                    DEVICE.set_lt_mask(mask)
                self.send_json(200, {"ok": True})
            elif path == "/api/lt-mask":
                data = self.read_json()
                mask = int(data["lt_mask"])
                if not 0 <= mask <= 0x0F:
                    raise ValueError("Invalid LT mask")
                DEVICE.set_lt_mask(mask)
                self.send_json(200, {"ok": True})
            elif path == "/api/settings":
                saved = settings_store.save(self.read_json())
                self.send_json(200, saved)
            elif path == "/api/save":
                data = self.read_json()
                if data.get("keys_l0") or data.get("keys"):
                    settings_store.save(data)
                DEVICE.save()
                self.send_json(200, {"ok": True})
            elif path == "/api/build":
                self.send_json(200, firmware.build())
            elif path == "/api/firmware/upload":
                length = int(self.headers.get("Content-Length", 0))
                self.send_json(200, firmware.save_upload(self.rfile.read(length)))
            elif path == "/api/bootloader":
                DEVICE.enter_bootloader()
                self.send_json(200, {"ok": True})
            elif path == "/api/flash":
                data = self.read_json()
                if data.get("confirm") is not True:
                    raise ValueError("Flash confirmation missing")
                source = firmware.UPLOAD_BIN if data.get("uploaded") else firmware.DEFAULT_BIN
                if data.get("enter_bootloader"):
                    try:
                        DEVICE.enter_bootloader()
                        time.sleep(1)
                    except DeviceError:
                        pass
                self.send_json(200, firmware.flash(source))
            else:
                self.send_json(404, {"error": "Unknown endpoint"})
        except (DeviceError, ValueError, RuntimeError, subprocess.SubprocessError) as exc:
            self.send_json(400, {"error": str(exc)})
        except Exception as exc:
            self.send_json(500, {"error": str(exc)})


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 8765), Handler)
    print("CH552 Control Center: http://127.0.0.1:8765")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
