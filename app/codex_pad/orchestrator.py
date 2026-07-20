# codex_pad/orchestrator.py
"""Codex chat <-> slot binding: per-slot FSM + FIFO assign.

Pure logic, no IO. Every method takes explicit ts (injectable clock).
Effects emitted through sink:
  sink.led_off(i) / sink.led_breath_cyan(i) / sink.led_solid(i, (r,g,b))
  sink.led_unbound_ack(i)
  sink.focus(name, session_id) / sink.notify(message)

Bindings persist until manual long-press unbind. Acknowledged completed or
aborted chats remain bound with a solid white LED.
"""
import json
from pathlib import Path

FREE = "free"
BOUND = "bound"
GENERATING = "generating"
DONE = "done"
ABORTED = "aborted"

WHITE = (200, 200, 200)
GREEN = (0, 200, 0)
RED = (200, 0, 0)

MAX_UNBOUND = 10

STATE_FILE = Path(__file__).resolve().parent / "data" / "bindings.json"


class Slot:
    __slots__ = ("state", "session_id", "name", "bound_at", "done_at", "release_at")

    def __init__(self):
        self.state = FREE
        self.session_id = None
        self.name = ""
        self.bound_at = 0.0
        self.done_at = 0.0
        self.release_at = None

    def to_dict(self):
        return {
            "state": self.state,
            "session_id": self.session_id,
            "name": self.name,
            "bound_at": self.bound_at,
            "done_at": self.done_at,
        }

    @classmethod
    def from_dict(cls, d):
        s = cls()
        s.state = d["state"] if d["state"] in (
            BOUND, GENERATING, DONE, ABORTED) else FREE
        s.session_id = d["session_id"]
        s.name = d["name"]
        s.bound_at = d["bound_at"]
        s.done_at = d["done_at"]
        return s


class Orchestrator:
    def __init__(self, sink, slot_count=3):
        self.sink = sink
        self.slots = [Slot() for _ in range(slot_count)]
        self.unbound = []

    # --- helpers ---------------------------------------------------------
    def _slot_of(self, session_id):
        for i, s in enumerate(self.slots):
            if s.session_id == session_id:
                return i
        return None

    def _drop_unbound(self, session_id):
        self.unbound = [u for u in self.unbound if u["session_id"] != session_id]

    def _bind(self, i, session_id, name, ts):
        s = self.slots[i]
        s.state = GENERATING
        s.session_id = session_id
        s.name = name
        s.bound_at = ts
        s.release_at = None
        self.sink.led_breath_cyan(i)
        self.sink.notify("Tasto " + str(i + 1) + " -> " + name)
        self._drop_unbound(session_id)

    def _free(self, i):
        s = self.slots[i]
        s.state = FREE
        s.session_id = None
        s.name = ""
        s.release_at = None
        self.sink.led_unbound_ack(i)

    # --- session events --------------------------------------------------
    def on_task_started(self, session_id, name, ts):
        i = self._slot_of(session_id)
        if i is not None:
            s = self.slots[i]
            s.state = GENERATING
            s.name = name or s.name
            s.release_at = None
            self.sink.led_breath_cyan(i)
            return
        free = [i for i, s in enumerate(self.slots) if s.state == FREE]
        if free:
            self._bind(free[0], session_id, name, ts)
            return
        if not any(u["session_id"] == session_id for u in self.unbound):
            self.unbound.append(
                {"session_id": session_id, "name": name, "since": ts})
            self.unbound = self.unbound[-MAX_UNBOUND:]

    def on_task_complete(self, session_id, ts):
        i = self._slot_of(session_id)
        if i is None:
            return
        s = self.slots[i]
        s.state = DONE
        s.done_at = ts
        s.release_at = None
        self.sink.led_solid(i, GREEN)

    def on_turn_aborted(self, session_id, ts):
        i = self._slot_of(session_id)
        if i is None:
            return
        s = self.slots[i]
        s.state = ABORTED
        s.release_at = None
        self.sink.led_solid(i, RED)

    # --- key events ------------------------------------------------------
    def on_short_press(self, i, ts):
        s = self.slots[i]
        if s.state != FREE:
            self.sink.focus(s.name, s.session_id)
        if s.state in (DONE, ABORTED):
            s.state = BOUND
            s.release_at = None
            self.sink.led_solid(i, WHITE)

    def on_long_press(self, i, ts):
        if self.slots[i].state != FREE:
            self._free(i)

    # --- clock -----------------------------------------------------------
    def tick(self, ts):
        """Bindings never expire; only long press can free a slot."""
        return 0

    # --- status / persistence -------------------------------------------
    def status(self):
        return {
            "slots": [
                {
                    "slot": i,
                    "state": s.state,
                    "session_id": s.session_id,
                    "name": s.name,
                    "bound_at": s.bound_at,
                    "done_at": s.done_at,
                }
                for i, s in enumerate(self.slots)
            ],
            "unbound": list(self.unbound),
        }

    def save(self, path=STATE_FILE):
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps([s.to_dict() for s in self.slots], indent=2))
        tmp.replace(path)

    def load(self, path=STATE_FILE):
        if not path.exists():
            return
        data = json.loads(path.read_text())
        for i, d in enumerate(data[: len(self.slots)]):
            self.slots[i] = Slot.from_dict(d)
