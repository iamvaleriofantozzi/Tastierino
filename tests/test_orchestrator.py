# tests/test_orchestrator.py
import pytest

from app.codex_pad.orchestrator import (
    Orchestrator, FREE, BOUND, GENERATING, DONE, ABORTED,
    WHITE, GREEN, RED,
)


class FakeSink:
    def __init__(self):
        self.calls = []

    def led_off(self, i):
        self.calls.append(("led_off", i))

    def led_breath_cyan(self, i):
        self.calls.append(("breath", i))

    def led_unbound_ack(self, i):
        self.calls.append(("unbound_ack", i))

    def led_solid(self, i, rgb):
        self.calls.append(("solid", i, rgb))

    def focus(self, name, session_id):
        self.calls.append(("focus", session_id))

    def notify(self, msg):
        self.calls.append(("notify", msg))


@pytest.fixture
def orch():
    return Orchestrator(FakeSink())


def test_fifo_assigns_oldest_free_slot(orch):
    orch.on_task_started("a", "chat a", 100.0)
    orch.on_task_started("b", "chat b", 101.0)
    orch.on_task_started("c", "chat c", 102.0)
    assert [s.session_id for s in orch.slots] == ["a", "b", "c"]
    assert all(s.state == GENERATING for s in orch.slots)


def test_task_complete_turns_done_and_green(orch):
    orch.on_task_started("a", "chat a", 100.0)
    orch.on_task_complete("a", 110.0)
    assert orch.slots[0].state == DONE
    assert orch.slots[0].done_at == 110.0
    assert ("solid", 0, GREEN) in orch.sink.calls


def test_no_evict_generating_overflow_goes_unbound(orch):
    for sid in ("a", "b", "c"):
        orch.on_task_started(sid, sid, 100.0)
    orch.on_task_started("d", "chat d", 103.0)
    assert all(s.state == GENERATING for s in orch.slots)
    assert [u["session_id"] for u in orch.unbound] == ["d"]


def test_done_slots_remain_bound_when_full(orch):
    for sid in ("a", "b", "c"):
        orch.on_task_started(sid, sid, 100.0)
    orch.on_task_complete("b", 105.0)
    orch.on_task_complete("c", 108.0)
    orch.on_task_started("d", "chat d", 110.0)
    assert orch.slots[1].session_id == "b"
    assert orch.slots[1].state == DONE
    assert orch.slots[2].session_id == "c"
    assert [u["session_id"] for u in orch.unbound] == ["d"]


def test_short_press_generating_focuses_no_release(orch):
    orch.on_task_started("a", "chat a", 100.0)
    orch.on_short_press(0, 120.0)
    assert ("focus", "a") in orch.sink.calls
    assert orch.slots[0].state == GENERATING
    assert orch.slots[0].release_at is None


def test_short_press_done_focuses_and_stays_bound_white(orch):
    orch.on_task_started("a", "chat a", 100.0)
    orch.on_task_complete("a", 110.0)
    orch.on_short_press(0, 120.0)
    assert ("focus", "a") in orch.sink.calls
    assert orch.slots[0].state == BOUND
    assert ("solid", 0, WHITE) in orch.sink.calls
    assert orch.tick(1000.0) == 0
    assert orch.slots[0].session_id == "a"


def test_long_press_unbinds(orch):
    orch.on_task_started("a", "chat a", 100.0)
    orch.on_long_press(0, 105.0)
    assert orch.slots[0].state == FREE
    assert orch.slots[0].session_id is None
    assert ("unbound_ack", 0) in orch.sink.calls


def test_abort_red_stays_bound_until_acknowledged(orch):
    orch.on_task_started("a", "chat a", 100.0)
    orch.on_turn_aborted("a", 110.0)
    assert orch.slots[0].state == ABORTED
    assert ("solid", 0, RED) in orch.sink.calls
    assert orch.tick(1000.0) == 0
    assert orch.slots[0].state == ABORTED
    orch.on_short_press(0, 1001.0)
    assert orch.slots[0].state == BOUND
    assert ("solid", 0, WHITE) in orch.sink.calls


def test_restarted_task_same_session_keeps_slot(orch):
    orch.on_task_started("a", "chat a", 100.0)
    orch.on_task_complete("a", 110.0)
    orch.on_task_started("a", "chat a", 120.0)
    assert orch.slots[0].session_id == "a"
    assert orch.slots[0].state == GENERATING


def test_save_load_roundtrip(orch, tmp_path):
    orch.on_task_started("a", "chat a", 100.0)
    orch.on_task_complete("a", 110.0)
    p = tmp_path / "bindings.json"
    orch.save(p)
    other = Orchestrator(FakeSink())
    other.load(p)
    assert other.slots[0].session_id == "a"
    assert other.slots[0].state == DONE
    assert other.slots[0].name == "chat a"
