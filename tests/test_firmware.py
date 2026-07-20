import tempfile
import unittest
from pathlib import Path

from app.configurator import firmware


class FirmwareTests(unittest.TestCase):
    def test_binary_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.bin"
            path.write_bytes(b"\x01\x02\x03")
            info = firmware.inspect_binary(path)
            self.assertEqual(info["size"], 3)
            self.assertEqual(len(info["sha256"]), 64)

    def test_rejects_oversized_binary(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "large.bin"
            path.write_bytes(bytes(firmware.MAX_CODE_SIZE + 1))
            with self.assertRaises(RuntimeError):
                firmware.inspect_binary(path)

    def test_sanitize_log_strips_ansi_and_register_dump(self):
        raw = (
            "13:59:53 \x1b[0m\x1b[34m[INFO] \x1b[0mOpening USB device #0\n"
            "13:59:53 \x1b[34m[INFO] \x1b[0mChip: CH552[0x5211] (Code Flash: 14KiB, Data EEPROM: 128 Bytes)\n"
            "REVERSED: 0xFFFFFFFF\n"
            "WPROTECT: 0x00000003\n"
            "  [0:0]   NO_KEY_SERIAL_DOWNLOAD 0x1 (0b1)\n"
            "    `- Enable\n"
            "GLOBAL_CFG: 0x000052FF\n"
            "13:59:56 \x1b[34m[INFO] \x1b[0mVerify OK\n"
        )
        clean = firmware.sanitize_log(raw)
        self.assertNotIn("\x1b", clean)
        self.assertNotIn("[0m", clean)
        self.assertNotIn("REVERSED", clean)
        self.assertNotIn("GLOBAL_CFG", clean)
        self.assertIn("Opening USB device #0", clean)
        self.assertIn("Chip: CH552[0x5211]", clean)
        self.assertIn("Verify OK", clean)


if __name__ == "__main__":
    unittest.main()
