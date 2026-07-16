# Webapp Python locale

La webapp espone il controllo del tastierino su `http://127.0.0.1:8765/`. Il server è vincolato esclusivamente al loopback e non è raggiungibile dalla rete LAN.

## Componenti

- `app/device.py`: enumerazione HID, scambio pacchetti e API del dispositivo;
- `app/protocol.py`: VID/PID, comandi e nomi dei controlli;
- `app/firmware.py`: build, convalida binario e flash;
- `app/server.py`: server HTTP e API JSON;
- `app/static/`: interfaccia HTML/CSS/JavaScript;
- `start.command`: virtualenv, dipendenze, avvio e apertura browser.

## API

| Metodo | Endpoint | Funzione |
|---|---|---|
| GET | `/api/status` | stato HID e identità |
| GET | `/api/config` | keymap, colori e luminosità |
| GET | `/api/firmware` | dimensione e SHA-256 del binario |
| POST | `/api/rgb` | colori e luminosità live |
| POST | `/api/keymap` | keymap live |
| POST | `/api/save` | persistenza in Data Flash |
| POST | `/api/build` | `make clean all` |
| POST | `/api/firmware/upload` | valida un binario esterno |
| POST | `/api/bootloader` | salto software al bootloader |
| POST | `/api/flash` | flash dopo conferma esplicita |

Tutte le richieste POST devono includere `X-Macropad-Client: 1`. È una protezione minima contro richieste casuali da altre pagine; non è un sistema di autenticazione.

## Uso

```sh
./start.command
```

Spostare uno slider o scegliere un colore modifica la RAM del firmware. “Salva in memoria” invia keymap e luci correnti, poi `SAVE_CONFIG`; solo allora la configurazione sopravvive al reset.

Il flash richiede una conferma esplicita. Il server controlla inoltre che il file non sia vuoto e non superi `0x3800` byte, ma non può provare semanticamente che un binario esterno sia destinato a questa scheda.

