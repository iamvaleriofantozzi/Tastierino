# codex_pad/server.py
"""HTTP UI for the orchestrator. Loopback only, port 8766.

Routes:
  GET  /api/status              -> {slots, unbound, device}
  POST /api/slots/<i>/focus     -> trigger focus (same as short press)
  POST /api/slots/<i>/unbind    -> force unbind (same as long press)
  GET  /, /app.js, /styles.css  -> static UI
"""
import json
import mimetypes
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

STATIC = Path(__file__).with_name("static")
HOST = "127.0.0.1"
PORT = 8766


class Handler(BaseHTTPRequestHandler):
    server_version = "CodexPad/1.0"
    runtime = None          # injected: object with .orch, .leds

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def send_json(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        rt = self.runtime
        if path == "/api/status":
            data = rt.orch.status()
            data["device"] = {"connected": rt.leds.connected}
            self.send_json(200, data)
            return
        if path == "/":
            path = "/index.html"
        target = STATIC / path.lstrip("/")
        if target.is_file() and target.resolve().is_relative_to(STATIC.resolve()):
            body = target.read_bytes()
            self.send_response(200)
            self.send_header(
                "Content-Type",
                mimetypes.guess_type(str(target))[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_json(404, {"error": "not found"})

    def do_POST(self):
        path = urlparse(self.path).path
        rt = self.runtime
        parts = path.strip("/").split("/")
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "slots":
            try:
                i = int(parts[2].split("?")[0]) if parts[2].isdigit() else int(parts[2])
            except ValueError:
                self.send_json(400, {"error": "bad slot"})
                return
            if not 0 <= i < len(rt.orch.slots):
                self.send_json(404, {"error": "no such slot"})
                return
            now = time.monotonic()
            # path form is /api/slots/<i>/<action>
            action = parts[2]
            return self.send_json(400, {"error": "missing action"})
        if len(parts) == 4 and parts[0] == "api" and parts[1] == "slots":
            try:
                i = int(parts[2])
            except ValueError:
                self.send_json(400, {"error": "bad slot"})
                return
            if not 0 <= i < len(rt.orch.slots):
                self.send_json(404, {"error": "no such slot"})
                return
            now = time.monotonic()
            if parts[3] == "focus":
                rt.orch.on_short_press(i, now)
            elif parts[3] == "unbind":
                rt.orch.on_long_press(i, now)
            else:
                self.send_json(404, {"error": "unknown action"})
                return
            rt.after_mutation()
            self.send_json(200, rt.orch.status())
            return
        self.send_json(404, {"error": "not found"})


def serve(runtime, host=HOST, port=PORT):
    Handler.runtime = runtime
    httpd = ThreadingHTTPServer((host, port), Handler)
    print("orchestrator listening on http://%s:%d" % (host, port))
    httpd.serve_forever()
