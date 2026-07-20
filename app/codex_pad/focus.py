# codex_pad/focus.py
"""Focus the exact Codex chat + macOS notifications. Best-effort, no raise.

Deep link (official): codex://threads/<thread-id> opens the local chat
in the ChatGPT desktop app (codex:// scheme registered by ChatGPT.app).
Fallback: open the host app only.
"""
import logging
import subprocess

log = logging.getLogger(__name__)

FOCUS_APPS = ["ChatGPT", "Codex"]


def focus_chat(name, session_id):
    """Open the exact chat via codex:// deep link. Falls back to bringing
    the host app to foreground. Returns True if any activation worked."""
    if session_id:
        r = subprocess.run(
            ["open", "codex://threads/" + session_id], capture_output=True)
        if r.returncode == 0:
            log.info("focused chat %s / %s via deep link", name, session_id)
            return True
        log.warning("deep link failed for %s, falling back to app focus",
                    session_id)
    for app in FOCUS_APPS:
        r = subprocess.run(["open", "-a", app], capture_output=True)
        if r.returncode == 0:
            log.info("focused %s (chat %s / %s)", app, name, session_id)
            return True
    log.error("no Codex host app found (tried %s)", FOCUS_APPS)
    return False


def notify(message):
    """macOS notification. Silently ignores failure."""
    script = 'display notification "{}" with title "Tastierino"'.format(
        message.replace('"', "'"))
    subprocess.run(["osascript", "-e", script], capture_output=True)
