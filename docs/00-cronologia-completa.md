# Cronologia completa del lavoro

## 1. Identificazione del dispositivo

Il dispositivo è un macropad USB economico venduto come tastiera meccanica RGB programmabile con tre tasti e encoder. Il materiale del venditore comprendeva un PDF e una cartella Google Drive con software proprietario. Su richiesta, il software non è stato installato: è stato trattato solo come materiale da analizzare.

L’ispezione USB e la fotografia della scheda hanno portato all’identificazione del microcontrollore **CH552G**, MCU 8051 con USB full-speed, 16 KiB di ROM, 128 byte di DataFlash/EEPROM e bootloader ISP integrato.

## 2. Primo tentativo di controllo LED

Il firmware originale non esponeva un protocollo documentato sufficiente per cambiare stabilmente il colore. Diversi tentativi HID non produssero la variazione richiesta. I LED erano fisicamente RGB: alla pressione dei tre tasti apparivano impulsi blu, verde e rosso, quindi catena NeoPixel, alimentazione e collegamento dati erano funzionanti.

## 3. Ricerca del bootloader

La ricerca sul progetto Hackaday evidenziò due metodi storici:

- bootloader/IDE più vecchi: `P1.5` portato a GND;
- metodo usato dalle versioni più recenti di ch55xduino: `P3.6` portato a `3V3/V33`.

Questa differenza spiegava perché indicazioni trovate online sembravano contraddirsi. Il dispositivo reale riportò successivamente nel registro di configurazione del bootloader `DOWNLOAD_CFG ... P4.6 / P1.5 / P3.6 (Default set)`, con bootloader versione **2.50**.

## 4. Correzione del pin nella fotografia

Durante l’analisi fotografica fu inizialmente usata la descrizione “terzo piedino inferiore da sinistra”, poi corretta. Per il package **CH552G SOP16**, con orientamento determinato da tacca/punto:

- `P1.5` = pin fisico **3**;
- `P3.6/UDP` = pin fisico **12**;
- `GND` = pin fisico **14**;
- `V33` = pin fisico **16**.

La posizione “secondo/terzo da sinistra” non deve essere usata senza specificare l’orientamento del chip.

## 5. Resistenza e primo accesso ISP

Si valutò inizialmente 1 kΩ, ma la procedura effettivamente adottata usò **10 kΩ** tra `P3.6/UDP` e `V33`. La resistenza veniva mantenuta durante reset, rilevamento e flash. I LED che si accendevano e poi si spegnevano erano un indizio di reset; il riconoscimento certo arrivava esclusivamente da `wchisp info` con VID:PID bootloader WCH.

Non fu ottenuto un dump affidabile del firmware originale prima della sovrascrittura. L’assenza di protezione codice letta più tardi non equivale a disporre automaticamente di una procedura di backup verificata.

## 6. Primo firmware personalizzato

Il primo binario personalizzato si enumerò come `1189:8890`, ma leggeva direttamente byte EEPROM senza magic/versione/checksum. Dati residui casuali venivano quindi interpretati come keymap:

- encoder antiorario produceva `Y`;
- encoder orario e click non producevano eventi utili;
- i tre pulsanti non avevano una mappatura comprensibile;
- gli impulsi LED dimostravano però che i GPIO e la catena RGB erano corretti.

Questa osservazione portò a ridisegnare il formato EEPROM.

## 7. Toolchain nativa macOS

È stato installato SDCC 4.6 tramite Homebrew. Il progetto viene compilato con `sdcc`, `packihx` e `sdobjcopy`. Il flash è eseguito dal binario nativo `wchisp`; non è necessaria una VM Windows.

## 8. Evoluzione USB/HID

L’implementazione Raw HID richiese più correzioni successive:

1. endpoint EP2 portato da 16 a 32 byte;
2. aggiunta direzione IN oltre a OUT;
3. correzione del descrittore di configurazione a due endpoint;
4. scelta del report descriptor tramite `wIndexL` (numero interfaccia), non `wValueL`;
5. flag HID Input/Output corretti come Data/Variable/Absolute;
6. supporto `SET_REPORT` di controllo usato da macOS;
7. aggiunta Feature Report per una risposta affidabile tramite IOHID.

Il trasporto macOS finale usa una scrittura HID da 33 byte (Report ID zero + 32 byte) e una lettura Feature Report da 33 byte.

## 9. Webapp locale

È stata realizzata una webapp servita solo su `127.0.0.1:8765`, con:

- stato del dispositivo;
- selettori colore per i tre LED;
- luminosità indipendente per ogni LED;
- keymap dei sei ingressi;
- salvataggio EEPROM;
- compilazione firmware;
- caricamento `.bin` con verifica dimensione/SHA-256;
- ingresso bootloader software;
- flash e verifica con log.

## 10. Stato finale

Il firmware finale è stato scritto con `Verify OK`. Sono stati verificati:

- interfaccia Raw HID visibile su macOS;
- lettura e scrittura dei colori;
- luminosità indipendenti `[51, 140, 255]`;
- persistenza dopo salvataggio EEPROM e riavvio;
- ingresso bootloader software e ritorno all’applicazione;
- build firmware e quattro test automatici passanti.

