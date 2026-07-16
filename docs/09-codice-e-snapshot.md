# Codice e snapshot

## Albero dei sorgenti

```text
app/                 server Python, HID e interfaccia web
firmware/            sorgente CH552, driver, Makefile e binari
tests/               test unitari
README.md            avvio rapido
requirements.txt     dipendenze Python
start.command        launcher macOS
docs/                documentazione completa
```

Gli archivi `.zip` non sono versionati (`*.zip` in `.gitignore`). Uno snapshot locale si può generare dalla radice del repo, escludendo ambienti e cache:

```sh
zip -r docs/source-snapshot-$(date +%F).zip \
  app firmware tests README.md requirements.txt start.command \
  -x '*/.DS_Store' '*/__pycache__/*' 'firmware/*.asm' 'firmware/*.lst' \
     'firmware/*.rel' 'firmware/*.rst' 'firmware/*.sym' 'firmware/*.map' \
     'firmware/*.lk' 'firmware/*.ihx' 'firmware/*.mem' 'firmware/*.adb'
```

## Riproduzione

```sh
brew install sdcc
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
make -C firmware clean all
python3 -m unittest discover -s tests
```

## Grafo statico

`graph/graph.html` permette di esplorare simboli e dipendenze. Il corpus del grafo è volutamente limitato ai sorgenti Python, JavaScript e C/header, così la documentazione non altera l’analisi del codice.
