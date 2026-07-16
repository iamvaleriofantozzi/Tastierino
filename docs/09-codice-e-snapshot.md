# Code and snapshot

## Source tree

```text
app/                 Python server, HID and web interface
firmware/            CH552 source, drivers, Makefile and binaries
tests/               unit tests
README.md            quick start
requirements.txt     Python dependencies
start.command        macOS launcher
docs/                complete documentation
```

`.zip` archives are not version-controlled (`*.zip` in `.gitignore`). A local snapshot can be generated from the repo root, excluding environments and caches:

```sh
zip -r docs/source-snapshot-$(date +%F).zip \
  app firmware tests README.md requirements.txt start.command \
  -x '*/.DS_Store' '*/__pycache__/*' 'firmware/*.asm' 'firmware/*.lst' \
     'firmware/*.rel' 'firmware/*.rst' 'firmware/*.sym' 'firmware/*.map' \
     'firmware/*.lk' 'firmware/*.ihx' 'firmware/*.mem' 'firmware/*.adb'
```

## Reproduction

```sh
brew install sdcc
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
make -C firmware clean all
python3 -m unittest discover -s tests
```

## Static graph

`graph/graph.html` lets you explore symbols and dependencies. The graph corpus is deliberately limited to Python, JavaScript and C/header sources, so the documentation itself doesn't affect the code analysis.
