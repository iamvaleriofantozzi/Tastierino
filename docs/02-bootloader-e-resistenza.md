# Bootloader e resistenza da 10 kΩ

## Conclusione verificata

Per il primo accesso al bootloader WCH è stato usato un pull-up **temporaneo da 10 kΩ** tra:

- `P3.6 / UDP`, piedino fisico 12 del CH552G;
- `V33`, piedino fisico 16.

La resistenza non va inserita in serie sulla linea USB. Il datasheet sconsiglia espressamente resistenze in serie su `UDM` e `UDP` perché il CH552 integra già quelle necessarie.

## Perché non P1.5

Esistono due procedure, riferite a bootloader/configurazioni differenti:

- metodo storico: `P1.5` a GND durante il reset;
- metodo più recente adottato da ch55xduino: `P3.6` a `3V3/V33` durante il reset.

Il progetto Hackaday citato durante l’analisi descrive proprio questo cambiamento. Su questo esemplare la strada che ha consentito di proseguire è stata `P3.6 → 10 kΩ → V33`. `P1.5` è il pin fisico 3; non è il “secondo pin inferiore da sinistra”.

## Procedura del primo flash

1. Scollegare USB e lavorare a scheda non alimentata.
2. Collegare una resistenza da 10 kΩ tra pin 12 (`P3.6/UDP`) e pin 16 (`V33`).
3. Controllare con lente o multimetro che non esistano ponti verso pin adiacenti.
4. Ricollegare USB o eseguire il reset della board.
5. Verificare subito con `wchisp info`: il bootloader resta disponibile per una finestra breve, circa dieci secondi.
6. Se il dispositivo è riconosciuto come CH552 bootloader, eseguire il flash e attendere `Verify OK`.
7. Scollegare USB e rimuovere il collegamento temporaneo, salvo che serva per un’ulteriore sessione di recupero.

L’accensione e lo spegnimento dei LED è un indizio, non una prova dell’ingresso nel bootloader. La prova è l’identificazione positiva di `wchisp`.

## Dopo il primo firmware personalizzato

Il firmware nuovo offre due vie più semplici:

- comando Raw HID `ENTER_BOOTLOADER` (`0x06`), usato dalla webapp;
- avvio con `PIN_KEY1` premuto; i LED diventano bianchi prima del salto al bootloader.

Poiché l’ordine fisico dei pulsanti era inizialmente incerto, durante il recupero sono stati tenuti premuti tutti e tre i pulsanti alla riconnessione. Questo garantisce che anche `PIN_KEY1` sia premuto. Nel codice è comunque solo `PIN_KEY1` a comandare il salto.

## Precauzioni

- Non saldare o spostare la resistenza a scheda alimentata.
- Non cortocircuitare `V33` verso GND.
- Non applicare 5 V direttamente a `P3.6`.
- Non interrompere USB durante scrittura o verifica.
- Prima di ogni flash confermare MCU e file binario.

