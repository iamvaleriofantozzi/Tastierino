# tests/test_watcher.py
import json
import time

from app.codex_pad.watcher import SessionWatcher

SID = "019f75cc-240f-7fb0-bb60-a504b7ce5c7e"


def make_home(tmp_path):
    home = tmp_path / ".codex"
    (home / "sessions" / "2026" / "07" / "18").mkdir(parents=True)
    return home


def rollout_path(home, name="rollout-2026-07-18T17-15-40-" + SID + ".jsonl"):
    return home / "sessions" / "2026" / "07" / "18" / name


def write_lines(path, lines):
    with open(path, "a", encoding="utf-8") as f:
        for d in lines:
            f.write(json.dumps(d) + "\n")


def ev(kind):
    return {"type": "event_msg", "payload": {"type": kind}}


def test_session_id_regex(tmp_path):
    home = make_home(tmp_path)
    w = SessionWatcher(lambda *a: None, codex_home=home)
    assert w.session_id_for(rollout_path(home)) == SID
    assert w.session_id_for(home / "sessions" / "other.txt") is None


def test_tail_emits_only_tracked_events(tmp_path):
    home = make_home(tmp_path)
    got = []
    w = SessionWatcher(lambda *a: got.append(a), codex_home=home)
    p = rollout_path(home)
    write_lines(p, [
        {"type": "session_meta", "payload": {}},
        ev("task_started"),
        ev("token_count"),
        ev("agent_reasoning"),
        ev("task_complete"),
    ])
    w.tail(p)
    kinds = [g[1] for g in got]
    assert kinds == ["task_started", "task_complete"]
    assert got[0][0] == SID


def test_tail_incremental_and_truncation(tmp_path):
    home = make_home(tmp_path)
    got = []
    w = SessionWatcher(lambda *a: got.append(a), codex_home=home)
    p = rollout_path(home)
    write_lines(p, [ev("task_started")])
    w.tail(p)
    write_lines(p, [ev("task_complete")])
    w.tail(p)
    assert [g[1] for g in got] == ["task_started", "task_complete"]
    p.write_text(json.dumps(ev("turn_aborted")) + "\n")   # truncate
    w.tail(p)
    assert [g[1] for g in got][-1] == "turn_aborted"


def test_initial_scan_window_and_names(tmp_path):
    home = make_home(tmp_path)
    got = []
    w = SessionWatcher(lambda *a: got.append(a), codex_home=home)
    p = rollout_path(home)
    write_lines(p, [ev("task_started")])
    old = rollout_path(home, name="rollout-2026-07-18T10-00-00-"
                             "11111111-2222-3333-4444-555555555555.jsonl")
    write_lines(old, [ev("task_started")])
    old_ts = time.time() - 3 * 3600
    import os
    os.utime(old, (old_ts, old_ts))
    (home / "session_index.jsonl").write_text(
        json.dumps({"id": SID, "thread_name": "Test chat",
                    "updated_at": "2026-07-18T17:00:00Z"}) + "\n")
    w.initial_scan()
    assert len(got) == 1                      # old file outside 2h window
    assert got[0][2] == "Test chat"           # name from index
