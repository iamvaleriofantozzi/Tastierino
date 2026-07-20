from app.codex_pad.device_profile import DeviceProfile


def mapping(code=0, key_type=0):
    return {"mod": 0, "type": key_type, "code": code}


class FakePad:
    def __init__(self):
        self.calls = []
        self.keys_l0 = [
            {**mapping(4), "steps": [mapping(4), mapping(5)]},
            *[mapping() for _ in range(5)],
        ]
        self.keys_fn = [[mapping(10 + layer) for _ in range(6)]
                        for layer in range(4)]

    def get_config(self):
        return {"lt_mask": 2, "keys_l0": self.keys_l0,
                "keys_fn": self.keys_fn}

    def set_lt_mask(self, mask):
        self.calls.append(("mask", mask))

    def set_keymap(self, keys, layer=0, step=0):
        self.calls.append(("keymap", layer, step, keys))


def test_device_profile_backup_apply_restore(tmp_path):
    pad = FakePad()
    backup = tmp_path / "backup.json"
    profile = DeviceProfile(pad, backup_path=backup)

    profile.activate()

    assert backup.exists()
    assert pad.calls[0] == ("mask", 0)
    active_l0 = pad.calls[1][3]
    assert [k["code"] for k in active_l0[:3]] == [0x68, 0x69, 0x6A]
    assert all(k["code"] == 0 for k in pad.calls[2][3])

    profile.restore()

    assert not backup.exists()
    assert pad.calls[-1] == ("mask", 2)
