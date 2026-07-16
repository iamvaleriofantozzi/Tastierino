#!/bin/zsh
set -e
cd "${0:A:h}"
if [[ ! -x .venv/bin/python ]]; then
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
fi
.venv/bin/python -m app.server &
server_pid=$!
trap 'kill $server_pid 2>/dev/null || true' EXIT INT TERM
sleep 1
open http://127.0.0.1:8765
wait $server_pid
