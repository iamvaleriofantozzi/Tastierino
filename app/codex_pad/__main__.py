# codex_pad/__main__.py
"""Codex Pad daemon. Run: python3 -m app.codex_pad [--no-keygrab]"""
import argparse
import logging
import signal
import threading
import time

from . import focus as focus_mod
from .device_profile import DeviceProfile
from .keygrab import KeyGrabber
from .leds import LedDriver
from .orchestrator import (
    ABORTED, BOUND, DONE, FREE, GENERATING, GREEN, RED, WHITE, Orchestrator,
)
from .server import serve
from .watcher import SessionWatcher

log = logging.getLogger("codex_pad")


def _request_shutdown(signum, frame):
    raise KeyboardInterrupt


class Runtime:
    """Sink implementation + shared state for server handler."""

    def __init__(self, no_keygrab=False):
        self.leds = LedDriver()
        self.device_profile = DeviceProfile(self.leds.pad)
        self.orch = Orchestrator(self)
        self.orch.load()
        self._lock = threading.Lock()
        self.watcher = SessionWatcher(self._on_session_event)
        self.keygrabber = None if no_keygrab else KeyGrabber(
            self._on_short, self._on_long)

    # --- sink (called from watcher/keygrab/server threads) ---------------
    def led_off(self, i):
        self.leds.off(i)

    def led_breath_cyan(self, i):
        self.leds.breath_cyan(i)

    def led_unbound_ack(self, i):
        self.leds.unbound_ack(i)

    def led_solid(self, i, rgb):
        self.leds.solid(i, rgb)

    def focus(self, name, session_id):
        focus_mod.focus_chat(name, session_id)

    def notify(self, message):
        log.info(message)
        focus_mod.notify(message)

    # --- event entry points ------------------------------------------------
    def _on_session_event(self, session_id, kind, name, ts):
        with self._lock:
            mono = time.monotonic()
            if kind == "task_started":
                self.orch.on_task_started(session_id, name, mono)
            elif kind == "task_complete":
                self.orch.on_task_complete(session_id, mono)
            elif kind == "turn_aborted":
                self.orch.on_turn_aborted(session_id, mono)
            self.orch.save()

    def _on_short(self, slot, ts):
        with self._lock:
            self.orch.on_short_press(slot, ts)
            self.orch.save()

    def _on_long(self, slot, ts):
        with self._lock:
            self.orch.on_long_press(slot, ts)
            self.orch.save()

    def after_mutation(self):
        """Called by HTTP handler after focus/unbind POST."""
        with self._lock:
            self.orch.save()

    # --- main loop -----------------------------------------------------------
    def _tick_loop(self):
        while True:
            time.sleep(0.1)
            with self._lock:
                if self.orch.tick(time.monotonic()):
                    self.orch.save()

    def _sync_leds(self):
        for i, slot in enumerate(self.orch.slots):
            if slot.state == FREE:
                self.leds.off(i)
            elif slot.state == BOUND:
                self.leds.solid(i, WHITE)
            elif slot.state == GENERATING:
                self.leds.breath_cyan(i)
            elif slot.state == DONE:
                self.leds.solid(i, GREEN)
            elif slot.state == ABORTED:
                self.leds.solid(i, RED)

    def run(self):
        self.device_profile.activate()
        try:
            self.watcher.initial_scan()
            self._sync_leds()
            self.watcher.start()
            if self.keygrabber is not None:
                self.keygrabber.start()
            threading.Thread(target=self._tick_loop, daemon=True).start()
            serve(self)
        finally:
            self.device_profile.restore()


def main():
    ap = argparse.ArgumentParser(prog="codex_pad")
    ap.add_argument("--no-keygrab", action="store_true",
                    help="disable F13-F15 key grabbing")
    args = ap.parse_args()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    signal.signal(signal.SIGTERM, _request_shutdown)
    try:
        Runtime(no_keygrab=args.no_keygrab).run()
    except KeyboardInterrupt:
        log.info("shutdown requested")


if __name__ == "__main__":
    main()
