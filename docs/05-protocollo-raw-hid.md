# Protocollo Raw HID

## Trasporto

- dimensione logica: 32 byte;
- nessun Report ID applicativo;
- host macOS: `write()` riceve 33 byte, con uno zero iniziale come Report ID;
- risposta: Feature report da 33 byte, dal quale l’host rimuove lo zero iniziale.

Ogni risposta usa `comando | 0x80` nel byte 0 e lo stato nel byte 1.

| Stato | Significato |
|---:|---|
| 0 | OK |
| 1 | comando sconosciuto |
| 2 | lunghezza errata |

## Comandi

| Cmd | Nome | Payload / risposta |
|---:|---|---|
| `0x01` | `SET_RGB` | byte 1–9: tre triplette RGB |
| `0x02` | `GET_CONFIG` | versione in 2; luminosità legacy in 3; keymap 4–21; RGB 22–30 |
| `0x03` | `SET_KEYMAP` | byte 1–18: sei record `[mod,type,code]` |
| `0x04` | `SAVE_CONFIG` | scrive RAM corrente in Data Flash |
| `0x05` | `SET_BRIGHTNESS` | byte 1–3: luminosità per LED; un solo byte imposta tutti |
| `0x06` | `ENTER_BOOTLOADER` | risponde, attende 50 ms, salta al bootloader |
| `0x07` | `PING` | risposta con versione protocollo in 2 |
| `0x08` | `GET_LIGHTING` | luminosità 2–4; RGB 5–13 |

Per la keymap `type=0` significa Keyboard e `type=1` Consumer. Modificatore e codice sono byte HID.

## Sequenza host su macOS

Il metodo funzionante è:

1. aprire esclusivamente l’interfaccia con usage page `0xFF60`;
2. inviare `0x00 + pacchetto_da_32_byte` con `write()`;
3. interrogare `get_feature_report(0, 33)` fino al timeout;
4. rimuovere l’eventuale zero iniziale;
5. verificare comando di risposta e stato.

Questo compromesso è necessario perché nelle prove la sola lettura interrupt restituiva zero o nessuna risposta, mentre `send_feature_report()` non era affidabile su questa implementazione macOS/IOHID.

