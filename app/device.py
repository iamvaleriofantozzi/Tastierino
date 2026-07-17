import sys
import threading
import time
from . import protocol

try:
    import hid
except ImportError:
    hid = None


class DeviceError(RuntimeError):
    pass


class MacroPad:
    def __init__(self):
        self._lock = threading.Lock()

    @staticmethod
    def enumerate():
        if hid is None:
            return []
        return [d for d in hid.enumerate(protocol.VID, protocol.PID)
                if d.get("usage_page") == protocol.USAGE_PAGE]

    def status(self):
        devices = self.enumerate()
        return {
            "connected": bool(devices),
            "hidapi": hid is not None,
            "vid": f"{protocol.VID:04x}",
            "pid": f"{protocol.PID:04x}",
            "product": devices[0].get("product_string") if devices else None,
            "serial": devices[0].get("serial_number") if devices else None,
        }

    def exchange(self, command, payload=b"", timeout=1000):
        if hid is None:
            raise DeviceError("hidapi module not installed")
        devices = self.enumerate()
        if not devices:
            raise DeviceError("Raw HID interface not found")
        packet = bytes([command]) + bytes(payload)
        if len(packet) > protocol.PACKET_SIZE:
            raise DeviceError("HID packet too long")
        packet += bytes(protocol.PACKET_SIZE - len(packet))
        with self._lock:
            dev = hid.device()
            try:
                dev.open_path(devices[0]["path"])
                written = dev.write(bytes([0]) + packet)
                if written <= 0:
                    raise DeviceError("HID write failed")
                if sys.platform == "darwin":
                    response = b""
                    deadline = time.monotonic() + timeout / 1000
                    while time.monotonic() < deadline:
                        candidate = bytes(dev.get_feature_report(0, protocol.PACKET_SIZE + 1))
                        if len(candidate) == protocol.PACKET_SIZE + 1 and candidate[0] == 0:
                            candidate = candidate[1:]
                        if candidate and candidate[0] == (command | protocol.RESPONSE):
                            response = candidate
                            break
                        time.sleep(0.02)
                else:
                    response = bytes(dev.read(protocol.PACKET_SIZE, timeout))
            finally:
                dev.close()
        if len(response) != protocol.PACKET_SIZE:
            raise DeviceError("No complete response from macropad")
        if response[0] != (command | protocol.RESPONSE):
            raise DeviceError("Invalid HID response")
        if response[1] != 0:
            raise DeviceError(f"Firmware rejected command (status {response[1]})")
        return response

    @staticmethod
    def _parse_keys(packet, offset, names=True):
        keys = []
        for i, name in enumerate(protocol.CONTROL_NAMES):
            base = offset + i * 3
            item = {"mod": packet[base], "type": packet[base + 1], "code": packet[base + 2]}
            if names:
                item["name"] = name
            keys.append(item)
        return keys

    def get_keymap(self, layer=0, step=0, protocol_version=None):
        if layer not in range(protocol.LAYER_COUNT):
            raise DeviceError("Invalid keymap layer")
        if step not in range(protocol.MACRO_STEPS):
            raise DeviceError("Invalid keymap step")
        if step and layer != 0:
            raise DeviceError("Only Tap layer supports multi-step")
        modern = (protocol_version is None) or (protocol_version >= 4)
        payload = bytes([layer, step]) if modern else bytes([layer])
        r = self.exchange(protocol.GET_KEYMAP, payload)
        return self._parse_keys(r, 4 if modern else 3)

    def get_config(self):
        r = self.exchange(protocol.GET_CONFIG)
        keys = self._parse_keys(r, 4)
        lighting = self.get_lighting()
        protocol_version = r[2]
        lt_mask = r[3] & 0x0F
        if protocol_version >= 4:
            try:
                keys = self._merge_l0_steps(
                    self.get_keymap(0, 0, protocol_version=protocol_version),
                    self.get_keymap(0, 1, protocol_version=protocol_version),
                )
            except DeviceError:
                pass
        keys_fn = []
        if protocol_version >= 3:
            for fn in range(protocol.LT_CAPABLE):
                try:
                    keys_fn.append(self.get_keymap(1 + fn, 0, protocol_version=protocol_version))
                except DeviceError:
                    keys_fn.append([{"mod": k["mod"], "type": k["type"], "code": k["code"]} for k in keys])
        else:
            try:
                shared = self.get_keymap(1, protocol_version=protocol_version) if protocol_version >= 2 else [
                    {"mod": k["mod"], "type": k["type"], "code": k["code"]} for k in keys
                ]
            except DeviceError:
                shared = [{"mod": k["mod"], "type": k["type"], "code": k["code"]} for k in keys]
            keys_fn = [[dict(k) for k in shared] for _ in range(protocol.LT_CAPABLE)]
        return {
            "protocol": protocol_version,
            "brightness": lighting["brightness"],
            "keys": keys,
            "keys_l0": keys,
            "keys_l1": keys_fn[0],
            "keys_fn": keys_fn,
            "lt_mask": lt_mask,
            "colors": lighting["colors"],
            "pulse": lighting["pulse"],
            "auto_off_enabled": lighting["auto_off_enabled"],
            "auto_off_steps": lighting["auto_off_steps"],
            "macro_steps": protocol.MACRO_STEPS if protocol_version >= 4 else 1,
        }

    @staticmethod
    def _binding_active(key):
        return bool(key.get("code") or key.get("mod") or key.get("type"))

    @classmethod
    def _merge_l0_steps(cls, step0, step1):
        merged = []
        for a, b in zip(step0, step1):
            steps = []
            base = {"mod": a["mod"], "type": a["type"], "code": a["code"]}
            if cls._binding_active(base):
                steps.append(dict(base))
            extra = {"mod": b["mod"], "type": b["type"], "code": b["code"]}
            if cls._binding_active(extra):
                steps.append(dict(extra))
            item = dict(steps[0]) if steps else {"mod": 0, "type": 0, "code": 0}
            item["steps"] = steps
            if "name" in a:
                item["name"] = a["name"]
            merged.append(item)
        return merged

    def set_keymap(self, keys, layer=0, step=0):
        if layer not in range(protocol.LAYER_COUNT):
            raise DeviceError("Invalid keymap layer")
        if step not in range(protocol.MACRO_STEPS):
            raise DeviceError("Invalid keymap step")
        if step and layer != 0:
            raise DeviceError("Only Tap layer supports multi-step")
        if len(keys) != 6:
            raise DeviceError("Six mappings required")
        flat = []
        for key in keys:
            if isinstance(key.get("steps"), list):
                if step < len(key["steps"]):
                    src = key["steps"][step]
                else:
                    src = {"mod": 0, "type": 0, "code": 0}
            else:
                src = key if step == 0 else {"mod": 0, "type": 0, "code": 0}
            flat.append((int(src.get("mod", 0)), int(src.get("type", 0)), int(src.get("code", 0))))
        payload = bytes([layer, step]) + bytes(value for triple in flat for value in triple)
        self.exchange(protocol.SET_KEYMAP, payload)

    def get_lighting(self):
        r = self.exchange(protocol.GET_LIGHTING)
        colors = []
        for i in range(3):
            offset = 5 + i * 3
            colors.append([r[offset], r[offset + 1], r[offset + 2]])
        mask = r[14] if len(r) > 14 else 0x07
        auto_off_enabled = bool(r[15] & 1) if len(r) > 15 else False
        auto_off_steps = r[16] if len(r) > 16 else 9
        if auto_off_steps > protocol.AUTO_OFF_MAX_INDEX:
            auto_off_steps = protocol.AUTO_OFF_MAX_INDEX
        return {
            "brightness": [r[2], r[3], r[4]],
            "colors": colors,
            "pulse": [bool(mask & (1 << i)) for i in range(3)],
            "auto_off_enabled": auto_off_enabled,
            "auto_off_steps": auto_off_steps,
        }

    def set_rgb(self, colors):
        payload = bytes(channel for color in colors for channel in color)
        self.exchange(protocol.SET_RGB, payload)

    def set_brightness(self, values):
        if isinstance(values, int):
            values = [values] * 3
        self.exchange(protocol.SET_BRIGHTNESS, bytes(values))

    def set_pulse(self, enabled):
        if len(enabled) != 3 or any(not isinstance(flag, bool) for flag in enabled):
            raise DeviceError("Invalid pulse flags")
        mask = sum((1 << i) for i, flag in enumerate(enabled) if flag)
        self.exchange(protocol.SET_PULSE, bytes([mask]))

    def set_auto_off(self, enabled, steps):
        if not isinstance(enabled, bool):
            raise DeviceError("Invalid auto-off flag")
        steps = int(steps)
        if not 0 <= steps <= protocol.AUTO_OFF_MAX_INDEX:
            raise DeviceError("Invalid auto-off timeout")
        self.exchange(protocol.SET_AUTO_OFF, bytes([1 if enabled else 0, steps]))

    def set_lt_mask(self, mask):
        if not isinstance(mask, int) or not 0 <= mask <= 0x0F:
            raise DeviceError("Invalid LT mask")
        self.exchange(protocol.SET_LT_MASK, bytes([mask & 0x0F]))

    def save(self):
        self.exchange(protocol.SAVE_CONFIG)

    def enter_bootloader(self):
        self.exchange(protocol.ENTER_BOOTLOADER, timeout=300)

    def wait_until_ready(self, timeout=12.0):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.enumerate():
                time.sleep(0.25)
                try:
                    self.exchange(protocol.PING, timeout=500)
                    return True
                except DeviceError:
                    pass
            time.sleep(0.15)
        return False

    @staticmethod
    def _wave_led_color(phase, led_index):
        """White↔blue traveling wave. phase 0..255, led_index 0..2."""
        t = (phase + led_index * 85) & 0xFF
        mix = (t << 1) & 0xFF if t < 128 else ((255 - t) << 1) & 0xFF
        # mix 0 = blue (0,50,255), 255 = white
        return [mix, 50 + ((205 * mix) >> 8), 255]

    def play_wave_pulse(self, duration=3.0, frame_ms=40):
        """White/blue wave pulse — used after flash (boot anim often missed)."""
        saved = self.get_lighting()
        try:
            self.set_brightness([255, 255, 255])
            phase = 0
            started = time.monotonic()
            while time.monotonic() - started < duration:
                colors = [self._wave_led_color(phase, i) for i in range(3)]
                self.set_rgb(colors)
                phase = (phase + 8) & 0xFF
                time.sleep(frame_ms / 1000.0)
        finally:
            self.set_rgb(saved["colors"])
            self.set_brightness(saved["brightness"])

    # Back-compat alias
    play_rainbow_pulse = play_wave_pulse
