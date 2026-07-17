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

    def get_keymap(self, layer=0):
        if layer not in range(protocol.LAYER_COUNT):
            raise DeviceError("Invalid keymap layer")
        r = self.exchange(protocol.GET_KEYMAP, bytes([layer]))
        return self._parse_keys(r, 3)

    def get_config(self):
        r = self.exchange(protocol.GET_CONFIG)
        keys = self._parse_keys(r, 4)
        lighting = self.get_lighting()
        protocol_version = r[2]
        lt_mask = r[3] & 0x0F
        keys_fn = []
        if protocol_version >= 3:
            for fn in range(protocol.LT_CAPABLE):
                try:
                    keys_fn.append(self.get_keymap(1 + fn))
                except DeviceError:
                    keys_fn.append([dict(k) for k in keys])
        else:
            try:
                shared = self.get_keymap(1) if protocol_version >= 2 else [dict(k) for k in keys]
            except DeviceError:
                shared = [dict(k) for k in keys]
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
        }

    def get_lighting(self):
        r = self.exchange(protocol.GET_LIGHTING)
        colors = []
        for i in range(3):
            offset = 5 + i * 3
            colors.append([r[offset], r[offset + 1], r[offset + 2]])
        mask = r[14] if len(r) > 14 else 0x07
        return {
            "brightness": [r[2], r[3], r[4]],
            "colors": colors,
            "pulse": [bool(mask & (1 << i)) for i in range(3)],
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

    def set_keymap(self, keys, layer=0):
        if layer not in range(protocol.LAYER_COUNT):
            raise DeviceError("Invalid keymap layer")
        if len(keys) != 6:
            raise DeviceError("Six mappings required")
        payload = bytes([layer]) + bytes(
            value for key in keys for value in (key["mod"], key["type"], key["code"])
        )
        self.exchange(protocol.SET_KEYMAP, payload)

    def set_lt_mask(self, mask):
        if not isinstance(mask, int) or not 0 <= mask <= 0x0F:
            raise DeviceError("Invalid LT mask")
        self.exchange(protocol.SET_LT_MASK, bytes([mask & 0x0F]))

    def save(self):
        self.exchange(protocol.SAVE_CONFIG)

    def enter_bootloader(self):
        self.exchange(protocol.ENTER_BOOTLOADER, timeout=300)
