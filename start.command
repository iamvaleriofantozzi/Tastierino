#!/bin/zsh
set -e
cd "${0:A:h}"

# Finder launches with a thin PATH — restore common locations for wchisp/sdcc.
export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.local/bin:${HOME}/bin:${PATH}"

if [[ -z "${WCHISP:-}" ]]; then
  for candidate in \
    "${PWD}/tools/wchisp" \
    "${HOME}/.local/bin/wchisp" \
    "${HOME}/bin/wchisp" \
    /opt/homebrew/bin/wchisp \
    /usr/local/bin/wchisp
  do
    if [[ -x "$candidate" ]]; then
      export WCHISP="$candidate"
      break
    fi
  done
fi

if [[ ! -x .venv/bin/python ]]; then
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
fi
.venv/bin/python -m app.configurator.server &
server_pid=$!
trap 'kill $server_pid 2>/dev/null || true' EXIT INT TERM
sleep 1
open http://127.0.0.1:8765
wait $server_pid
