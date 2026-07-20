# codex_pad/watcher.py
"""Watch ~/.codex for Codex session rollout events (passive monitoring).

Events emitted via on_event(session_id, kind, name, ts):
  kind in {"task_started", "task_complete", "turn_aborted"}
"""
import datetime
import json
import logging
import re
import threading
import time
from pathlib import Path

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

log = logging.getLogger(__name__)

CODEX_HOME = Path.home() / ".codex"
SESSIONS_DIR = CODEX_HOME / "sessions"
INDEX_FILE = CODEX_HOME / "session_index.jsonl"
ROLLOUT_RE = re.compile(
    r"rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-"
    r"[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$")
EVENTS = {"task_started", "task_complete", "turn_aborted"}
SCAN_WINDOW_S = 2 * 3600


class SessionWatcher(FileSystemEventHandler):
    def __init__(self, on_event, codex_home=CODEX_HOME):
        self.on_event = on_event
        self.codex_home = Path(codex_home)
        self.sessions_dir = self.codex_home / "sessions"
        self.index_file = self.codex_home / "session_index.jsonl"
        self.offsets = {}
        self.names = {}
        self._observer = None

    # --- naming ----------------------------------------------------------
    def load_index(self):
        names = {}
        try:
            with open(self.index_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        d = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if d.get("id") and d.get("thread_name"):
                        names[d["id"]] = d["thread_name"]
        except FileNotFoundError:
            pass
        self.names = names

    def name_for(self, session_id):
        return self.names.get(session_id) or "Chat " + session_id[:8]

    # --- parsing ---------------------------------------------------------
    @staticmethod
    def session_id_for(path):
        m = ROLLOUT_RE.search(str(path))
        return m.group(1) if m else None

    def _parse_lines(self, path, sid, ts):
        offset = self.offsets.get(path, 0)
        size = path.stat().st_size
        if size < offset:
            offset = 0
        with open(path, "r", encoding="utf-8") as f:
            f.seek(offset)
            chunk = f.read()
        self.offsets[path] = size
        for line in chunk.splitlines():
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            if d.get("type") != "event_msg":
                continue
            kind = d.get("payload", {}).get("type")
            if kind in EVENTS:
                self.on_event(sid, kind, self.name_for(sid), ts)

    def tail(self, path):
        path = Path(path)
        sid = self.session_id_for(path)
        if sid is None:
            return
        try:
            self._parse_lines(path, sid, path.stat().st_mtime)
        except FileNotFoundError:
            self.offsets.pop(path, None)

    # --- watchdog hooks ----------------------------------------------------
    def _recent_dirs(self):
        base = self.sessions_dir
        today = datetime.date.today()
        return [
            base / d.strftime("%Y") / d.strftime("%m") / d.strftime("%d")
            for d in (today, today - datetime.timedelta(days=1))
        ]

    def _rescan_recent(self):
        """Fallback for FSEvents events delivered with an empty path:
        tail every rollout file in today's/yesterday's session dirs.
        Offsets make repeated scans incremental."""
        cutoff = time.time() - SCAN_WINDOW_S
        for d in self._recent_dirs():
            if not d.is_dir():
                continue
            for p in d.glob("rollout-*.jsonl"):
                try:
                    if p.stat().st_mtime >= cutoff:
                        self.tail(p)
                except FileNotFoundError:
                    continue

    def _handle(self, path_str):
        if not path_str:
            self._rescan_recent()
            return
        p = Path(path_str)
        if p == self.index_file:
            self.load_index()
        else:
            self.tail(p)

    def on_created(self, event):
        if not event.is_directory:
            self._handle(event.src_path)

    def on_modified(self, event):
        if event.is_directory and event.src_path:
            return
        self._handle(event.src_path)

    def on_moved(self, event):
        if not event.is_directory:
            self._handle(event.dest_path)

    # --- startup -----------------------------------------------------------
    def _prime_last_event(self, path):
        """Prime file offset and emit only its latest tracked event.

        Replaying every historical event would bind completed old chats after
        restart. A final task_complete/turn_aborted updates an already-persisted
        binding but remains a no-op for an unbound historical session.
        """
        sid = self.session_id_for(path)
        if sid is None:
            return
        last_kind = None
        try:
            size = path.stat().st_size
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    try:
                        d = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if d.get("type") != "event_msg":
                        continue
                    kind = d.get("payload", {}).get("type")
                    if kind in EVENTS:
                        last_kind = kind
            self.offsets[path] = size
            if last_kind is not None:
                self.on_event(sid, last_kind, self.name_for(sid),
                              path.stat().st_mtime)
        except FileNotFoundError:
            self.offsets.pop(path, None)

    def initial_scan(self):
        self.load_index()
        cutoff = time.time() - SCAN_WINDOW_S
        files = []
        if self.sessions_dir.is_dir():
            for p in self.sessions_dir.rglob("rollout-*.jsonl"):
                try:
                    if p.stat().st_mtime >= cutoff:
                        files.append(p)
                except FileNotFoundError:
                    continue
        files.sort(key=lambda p: p.stat().st_mtime)
        for p in files:
            self._prime_last_event(p)
        log.info("initial scan: %d rollout files primed", len(files))

    def _poll_loop(self):
        """FSEvents on some machines drops rollout file events entirely
        (MustScanSubDirs) — poll recent session dirs every second."""
        while True:
            time.sleep(1.0)
            try:
                self._rescan_recent()
            except Exception:
                log.exception("poll rescan failed")

    def start(self):
        self._observer = Observer()
        self._observer.schedule(self, str(self.codex_home), recursive=True)
        self._observer.start()
        threading.Thread(target=self._poll_loop, daemon=True).start()
        return self._observer
