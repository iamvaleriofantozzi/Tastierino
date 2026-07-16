# Test e troubleshooting

## Problemi incontrati e correzioni

| Sintomo | Causa individuata | Correzione |
|---|---|---|
| Colore non cambiava col software originale | protocollo proprietario non noto | firmware Raw HID personalizzato |
| Encoder antiorario produceva `Y`; altri ingressi muti | Data Flash non inizializzata/firmware provvisorio | firma, versione e checksum; default sicuri |
| Raw HID non enumerata | selezione errata del report descriptor (`wValueL` invece dell’indice interfaccia) | dispatch corretto con `wIndexL` |
| Pacchetti troncati | descriptor/endpoint inizialmente a 16 byte | uniformati a 32 byte |
| Comandi arrivavano ma mancava risposta | endpoint configurato solo OUT | endpoint 2 reso bidirezionale |
| macOS leggeva zeri | differenze IOHID nella gestione Output/Feature | `write()` + risposta conservata + `get_feature_report()` |
| `send_feature_report()` falliva | percorso control non affidabile in hidapi/macOS | usare la sequenza sopra |
| UI mostrava valori strani durante aggiornamento | tab vecchie/cache e schema config cambiato | cache disabilitata per JSON, ricarica della pagina |
| `wchisp` non vedeva il dispositivo | finestra bootloader scaduta | reset e comando immediato |
| Dubbio sul pulsante boot | ordine fisico non certo | tenere tutti e tre premuti; il firmware legge `PIN_KEY1` |

## Verifiche locali

```sh
make -C firmware clean all
python3 -m unittest discover -s tests
```

Verifiche manuali consigliate:

1. leggere `/api/status` e `/api/config`;
2. impostare colori diversi e luminosità 20%, 55%, 100%;
3. resettare senza salvare e verificare il ritorno ai valori persistiti;
4. salvare, resettare e rileggere;
5. provare F13/F14/F15, mute, volume su e volume giù;
6. entrare nel bootloader solo quando è realmente necessario.

## Recupero

- **Webapp offline:** chiudere eventuali istanze precedenti, ricollegare USB, rilanciare `start.command`.
- **Raw HID assente ma tastiera presente:** è probabilmente in esecuzione un firmware vecchio o un descriptor non aggiornato.
- **Tutti i LED bianchi:** il firmware ha rilevato `PIN_KEY1` premuto e sta saltando al bootloader.
- **Flash non parte:** ripetere reset/riconnessione e lanciare `wchisp` entro pochi secondi.
- **Nessuna enumerazione USB:** scollegare, ispezionare saldature e rimuovere il collegamento temporaneo prima di ulteriori prove.

