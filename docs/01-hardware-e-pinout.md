# Hardware, package e pinout

## Microcontrollore

Il componente è un **CH552G** in package SOP16. Il datasheet indica 16 KiB di ROM complessiva; con bootloader residente, l’area applicativa usata dal progetto è limitata a `0x3800` byte, cioè 14 KiB. La DataFlash disponibile è 128 byte.

## Orientamento corretto

Individuare prima la tacca o il punto che marca il pin 1. La numerazione del SOP procede in senso antiorario vista dall’alto. Non usare descrizioni come “secondo piedino inferiore da sinistra” senza aver fissato l’orientamento.

## Pin CH552G rilevanti

| Pin fisico | Segnale | Uso nel progetto |
|---:|---|---|
| 3 | `P1.5` | vecchio metodo di ingresso bootloader citato online; non usato dal firmware finale |
| 4 | `P1.6` | pulsante 3 (`PIN_KEY3`) |
| 5 | `P1.7` | pulsante 2 (`PIN_KEY2`) |
| 7 | `P3.1` | encoder A (`PIN_ENC_A`) |
| 8 | `P3.0` | encoder B (`PIN_ENC_B`) |
| 9 | `P1.1` | pulsante 1 (`PIN_KEY1`) |
| 10 | `P3.3` | click encoder (`PIN_ENC_SW`) |
| 11 | `P3.4` | linea dati NeoPixel (`PIN_NEO`) |
| 12 | `P3.6/UDP` | USB D+ e metodo bootloader tramite pull-up a V33 |
| 13 | `P3.7/UDM` | USB D− |
| 14 | `GND/VSS` | massa |
| 15 | `VCC/VDD` | alimentazione |
| 16 | `V33` | uscita regolatore USB 3,3 V / riferimento bootloader |

I mapping dei tasti e dell’encoder derivano dal firmware funzionante e dai test fisici; il pinout del package deriva dal datasheet.

## Catena LED

I tre LED sono pilotati come NeoPixel/WS2812 compatibili da una singola linea `P3.4`. Il formato colore è configurato come **GRB**. L’ordine logico nel firmware è LED 1, LED 2, LED 3; ogni elemento ha RGB e luminosità 8 bit indipendente.

La luminosità non usa PWM separato: il firmware scala ciascun canale con:

```c
scaled = (channel * (brightness + 1)) >> 8;
```

## USB

- D+ = `P3.6/UDP`, pin 12.
- D− = `P3.7/UDM`, pin 13.
- Il datasheet avverte di non inserire resistenze **in serie** su P3.6/P3.7 quando usati per USB.
- La resistenza da 10 kΩ della procedura iniziale è un collegamento temporaneo di pull-up tra P3.6 e V33, non una resistenza in serie sul cavo dati.

## Identità verificata

| Campo | Valore |
|---|---|
| MCU | CH552, ID `0x5211` |
| UID | `57-07-60-BE-00-00-00-00` |
| Bootloader | `02.50` |
| Code Flash applicativa | 14 KiB |
| Data EEPROM | 128 byte |
| VID:PID applicazione | `1189:8890` |
| Produttore USB | `OpenMacroPad` |
| Prodotto USB | `CH552 RGB MacroPad` |
| Serial USB | `CH552xHID` |

