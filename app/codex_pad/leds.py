# codex_pad/leds.py
"""LED driver over app.configurator.device.MacroPad (raw HID, protocol v7).

Dedups commands per LED: same command twice in a row is not re-sent.
On DeviceError: mark disconnected, keep last-command cache so state
re-syncs automatically on next successful send.
Disables firmware auto-off while daemon controls LEDs. Manual unbind emits
a short fast red pulse, then guarantees the now-free LED is off.
"""
import logging
import threading

from app.configurator.device import DeviceError, MacroPad

log = logging.getLogger(__name__)

CYAN = (0, 200, 220)
GREEN = (0, 200, 0)
RED = (200, 0, 0)
BLACK = (0, 0, 0)
BREATH_PERIOD_MS = 1500
BREATH_MIN_DIVISOR = 8
UNBOUND_ACK_PERIOD_MS = 500
UNBOUND_ACK_DURATION_S = 0.5
LED_COUNT = 3


class LedDriver:
    def __init__(self):
        self.pad = MacroPad()
        self.connected = False
        self._last = [None] * LED_COUNT
        self._timers = [None] * LED_COUNT
        self._auto_off_disabled = False

    def _cancel_timer(self, led):
        timer = self._timers[led]
        if timer is not None:
            timer.cancel()
            self._timers[led] = None

    def _finish_unbound_ack(self, led):
        self._timers[led] = None
        if self._last[led] == ("unbound_ack",):
            self.off(led)

    def _send(self, led, cmd):
        if cmd == self._last[led] and self.connected:
            return
        self._cancel_timer(led)
        kind = cmd[0]
        try:
            if not self._auto_off_disabled:
                self.pad.set_auto_off(False, 0)
                self._auto_off_disabled = True
            if kind == "off":
                self.pad.set_continuous_pulse_led(
                    led, False, BREATH_PERIOD_MS, BREATH_MIN_DIVISOR)
                self.pad.set_rgb_led(led, BLACK)
            elif kind == "solid":
                self.pad.set_continuous_pulse_led(
                    led, False, BREATH_PERIOD_MS, BREATH_MIN_DIVISOR)
                self.pad.set_rgb_led(led, cmd[1])
            elif kind == "breath":
                self.pad.set_rgb_led(led, CYAN)
                self.pad.set_continuous_pulse_led(
                    led, True, BREATH_PERIOD_MS, BREATH_MIN_DIVISOR)
            elif kind == "unbound_ack":
                self.pad.set_rgb_led(led, RED)
                self.pad.set_continuous_pulse_led(
                    led, True, UNBOUND_ACK_PERIOD_MS, BREATH_MIN_DIVISOR)
            self._last[led] = cmd
            self.connected = True
            if kind == "unbound_ack":
                timer = threading.Timer(
                    UNBOUND_ACK_DURATION_S, self._finish_unbound_ack, args=(led,))
                timer.daemon = True
                self._timers[led] = timer
                timer.start()
        except DeviceError as e:
            self.connected = False
            self._auto_off_disabled = False
            log.warning("HID command failed: %s", e)

    def off(self, led):
        self._send(led, ("off",))

    def solid(self, led, rgb):
        self._send(led, ("solid", tuple(rgb)))

    def breath_cyan(self, led):
        self._send(led, ("breath",))

    def unbound_ack(self, led):
        self._send(led, ("unbound_ack",))
