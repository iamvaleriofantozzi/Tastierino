# codex_pad/keygrab.py
"""Grab F13/F14/F15 via Quartz CGEventTap (macOS). Keys are swallowed
always (never typed into apps). Short press < 2s, long press >= 2s.

Requires Input Monitoring permission for the host process.
"""
import logging
import threading
import time

import Quartz

log = logging.getLogger(__name__)

FKEYS = {105: 0, 107: 1, 113: 2}   # mac keycode -> slot index (F13/F14/F15; 111 would be F12)
LONGPRESS_S = 2.0


class KeyGrabber:
    def __init__(self, on_short, on_long):
        self.on_short = on_short    # fn(slot, ts)
        self.on_long = on_long      # fn(slot, ts)
        self._down_at = {}
        self.ok = False

    def _callback(self, proxy, etype, event, refcon):
        if etype == Quartz.kCGEventTapDisabledByTimeout:
            return event
        keycode = Quartz.CGEventGetIntegerValueField(
            event, Quartz.kCGKeyboardEventKeycode)
        if keycode not in FKEYS:
            return event
        now = time.monotonic()
        if etype == Quartz.kCGEventKeyDown:
            if keycode not in self._down_at:        # ignore auto-repeat
                self._down_at[keycode] = now
        elif etype == Quartz.kCGEventKeyUp:
            start = self._down_at.pop(keycode, None)
            if start is not None:
                slot = FKEYS[keycode]
                duration = now - start
                if duration >= LONGPRESS_S:
                    log.info("key %d long press %.3fs", slot + 1, duration)
                    self.on_long(slot, now)
                else:
                    log.info("key %d tap %.3fs", slot + 1, duration)
                    self.on_short(slot, now)
        return None                                 # swallow F13-15

    def _run(self):
        mask = (Quartz.CGEventMaskBit(Quartz.kCGEventKeyDown) |
                Quartz.CGEventMaskBit(Quartz.kCGEventKeyUp))
        tap = Quartz.CGEventTapCreate(
            Quartz.kCGSessionEventTap,
            Quartz.kCGHeadInsertEventTap,
            Quartz.kCGEventTapOptionDefault,
            mask, self._callback, None)
        if tap is None:
            log.error(
                "CGEventTapCreate returned None — grant Input Monitoring "
                "permission: System Settings -> Privacy & Security -> "
                "Input Monitoring")
            return
        source = Quartz.CFMachPortCreateRunLoopSource(None, tap, 0)
        loop = Quartz.CFRunLoopGetCurrent()
        Quartz.CFRunLoopAddSource(loop, source, Quartz.kCFRunLoopDefaultMode)
        Quartz.CGEventTapEnable(tap, True)
        self.ok = True
        log.info("keygrab active on F13/F14/F15")
        Quartz.CFRunLoopRun()

    def start(self):
        t = threading.Thread(target=self._run, daemon=True)
        t.start()
        return t
