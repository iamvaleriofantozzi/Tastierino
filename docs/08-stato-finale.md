# Stato finale verificato

Data dello snapshot: **16 luglio 2026**.

## Hardware e USB

- MCU: CH552G, SOP16;
- VID:PID applicativo: `1189:8890`;
- Raw HID: usage page `0xFF60`, pacchetti 32 byte;
- tre LED RGB indirizzabili con luminosità indipendente;
- tre pulsanti e encoder con click.

## Configurazione persistita durante la sessione

- LED 1: rosso `[255,0,0]`, luminosità `51/255` (20%);
- LED 2: rosso `[255,0,0]`, luminosità `140/255` (55%);
- LED 3: rosso `[255,0,0]`, luminosità `255/255` (100%);
- pulsanti: F13, F14, F15;
- encoder: mute, volume su, volume giù.

I valori delle luci sono stati riletti dopo il salvataggio/reset durante la sessione.

## Firmware

- file: `firmware/3keys_1knob.bin`;
- dimensione snapshot: 6.204 byte;
- limite: 14.336 byte;
- SHA-256: `2ceffde3bff9a2a5f6176ac49a287ac443a3d4d92bf7a9ab2a203ba3b365cf1b`.

## Test

La suite contiene quattro test unitari per protocollo dispositivo e gestione firmware. Build e test vengono rieseguiti nella verifica finale di questo archivio.

## Limiti noti

- `wchisp` deve essere nel `PATH`, oppure indicato con la variabile d’ambiente `WCHISP`.
- L’header locale CH55x include molte strutture USB generiche non usate direttamente: il grafo statico le mostra come comunità o nodi isolati.
- Il controllo software richiede il firmware personalizzato; il firmware originale non esponeva il protocollo qui documentato.

