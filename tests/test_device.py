import unittest
from unittest.mock import patch

from app.device import MacroPad
from app import protocol


class FakeDevice:
    last_write = None
    config_response = bytes(
        [protocol.GET_CONFIG | protocol.RESPONSE, 0, 2, 0x0F] + [0, 0, 0x68] * 6
    ).ljust(32, b"\0")
    keymap_l1_response = bytes(
        [protocol.GET_KEYMAP | protocol.RESPONSE, 0, 1] + [0, 0, 0x6B] * 6
    ).ljust(32, b"\0")
    lighting_response = bytes(
        [protocol.GET_LIGHTING | protocol.RESPONSE, 0, 20, 120, 240, 0, 80, 255, 0, 255, 80, 255, 20, 0, 0x05]
    ).ljust(32, b"\0")

    def open_path(self, path):
        pass

    def write(self, data):
        FakeDevice.last_write = data
        return len(data)

    def read(self, size, timeout):
        return list(self.config_response)

    def send_feature_report(self, data):
        FakeDevice.last_write = data
        return len(data)

    def get_feature_report(self, report_id, size):
        command = self.last_write[1]
        if command == protocol.GET_LIGHTING:
            response = self.lighting_response
        elif command == protocol.GET_CONFIG:
            response = self.config_response
        elif command == protocol.GET_KEYMAP:
            response = self.keymap_l1_response
        else:
            response = bytes([command | protocol.RESPONSE, 0]).ljust(32, b"\0")
        return list(bytes([0]) + response)

    def close(self):
        pass


class FakeHid:
    @staticmethod
    def enumerate(vid, pid):
        return [{"path": b"fake", "usage_page": protocol.USAGE_PAGE, "product_string": "Test"}]

    @staticmethod
    def device():
        return FakeDevice()


class DeviceTests(unittest.TestCase):
    @patch("app.device.hid", FakeHid)
    def test_get_config_packet_layout(self):
        config = MacroPad().get_config()
        self.assertEqual(config["protocol"], 2)
        self.assertEqual(config["lt_mask"], 0x0F)
        self.assertEqual(config["brightness"], [20, 120, 240])
        self.assertEqual(config["keys"][0]["code"], 0x68)
        self.assertEqual(config["keys_l1"][0]["code"], 0x6B)
        self.assertEqual(config["colors"][2], [255, 20, 0])
        self.assertEqual(config["pulse"], [True, False, True])
        self.assertEqual(len(FakeDevice.last_write), 33)

    @patch("app.device.hid", FakeHid)
    def test_sets_three_brightness_values(self):
        MacroPad().set_brightness([10, 100, 250])
        self.assertEqual(FakeDevice.last_write[1:5], bytes([protocol.SET_BRIGHTNESS, 10, 100, 250]))

    @patch("app.device.hid", FakeHid)
    def test_sets_pulse_mask(self):
        MacroPad().set_pulse([True, False, True])
        self.assertEqual(FakeDevice.last_write[1:3], bytes([protocol.SET_PULSE, 0x05]))

    @patch("app.device.hid", FakeHid)
    def test_set_keymap_includes_layer(self):
        keys = [{"mod": 0, "type": 0, "code": 0x04}] * 6
        MacroPad().set_keymap(keys, layer=1)
        self.assertEqual(FakeDevice.last_write[1], protocol.SET_KEYMAP)
        self.assertEqual(FakeDevice.last_write[2], 1)
        self.assertEqual(FakeDevice.last_write[3], 0)  # step
        self.assertEqual(FakeDevice.last_write[4:7], bytes([0, 0, 0x04]))

    @patch("app.device.hid", FakeHid)
    def test_set_lt_mask(self):
        MacroPad().set_lt_mask(0x05)
        self.assertEqual(FakeDevice.last_write[1:3], bytes([protocol.SET_LT_MASK, 0x05]))


if __name__ == "__main__":
    unittest.main()
