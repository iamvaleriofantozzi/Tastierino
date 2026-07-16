# CH552 RGB MacroPad — dossier completo

Questa cartella conserva analisi, decisioni, procedure, schemi e stato finale del progetto svolto il 16 luglio 2026 sul tastierino USB a tre tasti e encoder basato su **CH552G**.

## Indice

1. [Cronologia completa](00-cronologia-completa.md)
2. [Hardware, package e pinout](01-hardware-e-pinout.md)
3. [Bootloader e resistenza da 10 kΩ](02-bootloader-e-resistenza.md)
4. [Primo flash da macOS](03-primo-flash-macos.md)
5. [Architettura del firmware](04-architettura-firmware.md)
6. [Protocollo Raw HID](05-protocollo-raw-hid.md)
7. [Webapp e backend Python](06-webapp-python.md)
8. [Test, problemi e recovery](07-test-e-troubleshooting.md)
9. [Stato finale verificato](08-stato-finale.md)
10. [Snapshot e inventario del codice](09-codice-e-snapshot.md)
11. [Schemi tecnici](schemi/README.md)
12. [Grafo automatico del codice](graph/README.md)
13. [Manuale originale del venditore](10-manuale-originale.md)

## Avvertenza

Le operazioni sul bootloader possono rendere temporaneamente inutilizzabile il dispositivo se il flash viene interrotto. Verificare sempre orientamento del package, alimentazione scollegata durante le saldature e assenza di cortocircuiti. Il collegamento con resistenza descritto qui è una procedura di recupero/primo accesso, non un collegamento USB ordinario.

## Riferimenti principali

- [Datasheet CH552/CH551, versione 1G](https://cdn-learn.adafruit.com/assets/assets/000/129/847/original/CH552DS1.PDF?1715004485=)
- [Hackaday — RGB macropad custom firmware](https://hackaday.io/project/189914-rgb-macropad-custom-firmware)
- [Prodotto originale AliExpress](https://it.aliexpress.com/item/1005005120738913.html)
- [Software originale condiviso dal venditore](https://drive.google.com/drive/folders/1xqFDp-l5TVA_6Ojsn0rt7GqvF5EvWDCi?usp=share_link) — analizzato, non installato durante il lavoro iniziale.

## Risultato sintetico

- Nessuna VM Windows necessaria.
- Firmware compilato con SDCC e scritto da macOS con `wchisp`.
- Tastiera HID + consumer control + interfaccia Raw HID vendor-defined.
- Colore e luminosità controllabili da software per ciascuno dei tre LED.
- Sei ingressi rimappabili: tre tasti, click encoder, rotazione oraria e antioraria.
- Configurazione persistente in EEPROM con magic, versione e checksum.
- Aggiornamenti successivi avviabili dalla webapp tramite bootloader software.
