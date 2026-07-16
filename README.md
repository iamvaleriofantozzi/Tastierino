# CH552 Control Center

Webapp locale per il tastierino CH552 RGB a tre tasti e encoder. Controlla colore e luminosità di ogni LED separatamente senza riflashare, modifica i sei ingressi, salva la configurazione nella EEPROM e compila/scrive il firmware.

La documentazione tecnica completa, inclusi primo flash con resistenza, pinout, protocollo, schemi, troubleshooting e snapshot, è in [`docs/README.md`](docs/README.md).

## Avvio su macOS

Fai doppio clic su `start.command`, oppure dal Terminale:

```sh
./start.command
```

L’interfaccia è disponibile solo in locale su `http://127.0.0.1:8765`.

## Primo flash

Il firmware precedente non espone ancora il comando software per entrare nel bootloader. Per il primo aggiornamento:

1. scollega il tastierino;
2. tieni premuto il pulsante 1;
3. ricollega USB e rilascia il pulsante;
4. nella webapp scegli **Avvia flash** e conferma.

Dopo il primo aggiornamento, la webapp può chiedere direttamente al firmware di entrare nel bootloader. Non scollegare USB durante scrittura e verifica.

## Mappatura predefinita

- Pulsanti 1–3: F13, F14, F15
- Encoder click: Mute
- Encoder orario: Volume su
- Encoder antiorario: Volume giù

I codici nella UI sono codici HID USB decimali. `Applica` modifica la RAM; `Salva in memoria` scrive colori, tre luminosità indipendenti e keymap nella EEPROM con firma, versione e checksum.

## Sviluppo

```sh
brew install sdcc
make -C firmware all
python3 -m unittest discover -s tests
```

Il firmware usa VID:PID `1189:8890` e una seconda interfaccia Raw HID vendor-defined (`usage page 0xFF60`) con pacchetti bidirezionali da 32 byte.
