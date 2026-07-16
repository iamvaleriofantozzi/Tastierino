# Architettura del firmware

Il firmware principale è `firmware/3keys_1knob.c`; i driver CH55x, USB, tastiera consumer, NeoPixel e timing sono in `firmware/include/`.

## Ciclo principale

All’avvio il firmware inizializza NeoPixel, controlla la richiesta manuale di bootloader, configura clock e USB, avvia il watchdog e carica la configurazione dalla Data Flash. Nel loop:

1. legge i tre pulsanti e il click dell’encoder;
2. decodifica una rotazione dell’encoder;
3. gestisce un eventuale pacchetto Raw HID;
4. aggiorna i tre LED;
5. alimenta il watchdog.

## Pin logici

| Funzione | Simbolo | Pin CH552 |
|---|---|---|
| Pulsante 1 | `PIN_KEY1` | P1.1, pin 9 |
| Pulsante 2 | `PIN_KEY2` | P1.7, pin 5 |
| Pulsante 3 | `PIN_KEY3` | P1.6, pin 4 |
| Click encoder | `PIN_ENC_SW` | P3.3, pin 10 |
| Encoder A | `PIN_ENC_A` | P3.1, pin 7 |
| Encoder B | `PIN_ENC_B` | P3.0, pin 8 |
| Dati NeoPixel | `PIN_NEO` | P3.4, pin 11 |

## USB composito

Il dispositivo usa VID:PID `1189:8890` e due interfacce:

- interfaccia 0: tastiera e controlli consumer HID;
- interfaccia 1: Raw HID vendor-defined, usage page `0xFF60`, usage `0x61`.

Endpoint 1 porta i report tastiera/media. Endpoint 2 è bidirezionale e trasporta pacchetti Raw HID da 32 byte. Su macOS il firmware accetta anche `SET_REPORT` sul control endpoint e conserva l’ultima risposta per la lettura come Feature report.

## Mappatura predefinita

| Controllo | Tipo | HID code |
|---|---:|---:|
| Pulsante 1 | Keyboard | `0x68` F13 |
| Pulsante 2 | Keyboard | `0x69` F14 |
| Pulsante 3 | Keyboard | `0x6A` F15 |
| Encoder click | Consumer | `0xE2` Mute |
| Encoder orario | Consumer | `0xE9` Volume su |
| Encoder antiorario | Consumer | `0xEA` Volume giù |

## Data Flash / EEPROM logica v2

| Offset | Contenuto |
|---:|---|
| 0–1 | firma `0x4D 0x50` (`MP`) |
| 2 | versione `2` |
| 3 | checksum XOR |
| 4–21 | sei record `[mod, type, code]` |
| 22–30 | tre colori `[R,G,B]` |
| 31–33 | luminosità LED 1, 2 e 3 |

Il checksum è lo XOR della versione e dei byte 4–33. Se firma, versione o checksum non sono validi, vengono caricati i default. Una configurazione v1 da 32 byte viene migrata duplicando la luminosità globale sui tre LED.

## Luminosità

Ogni componente colore viene scalata separatamente:

```text
uscita = colore × (luminosità + 1) / 256
```

La luminosità è quindi indipendente per ciascun LED senza cambiare il colore RGB memorizzato.

