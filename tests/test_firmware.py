import tempfile
import unittest
from pathlib import Path

from app import firmware


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


if __name__ == "__main__":
    unittest.main()
