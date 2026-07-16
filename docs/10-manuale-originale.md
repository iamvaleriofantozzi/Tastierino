# Manuale originale del venditore

Il PDF originale è conservato in [riferimenti/manuale-venditore.pdf](riferimenti/manuale-venditore.pdf). È una singola pagina verticale molto lunga, realizzata come composizione grafica; l’estrazione automatica del testo perde spazi, ma il rendering visivo è leggibile.

SHA-256 del PDF conservato: `addc673d8d93239511f18185cb63f3cd47e4f333209023c4c926fd53f450856e`.

## Contenuto

Il manuale conferma:

- tre tasti indipendenti, dichiarati come non premibili simultaneamente nel software originale;
- encoder con rotazione sinistra, rotazione destra e pressione;
- un solo layer;
- configurazione delle combinazioni di tasti e dei comandi multimedia;
- download della configurazione al dispositivo tramite software Windows;
- tre modalità LED: `0`, `1` e `2`;
- possibilità di spegnere o accendere la retroilluminazione con una voce “LED mode”.

Le schermate mostrano un’applicazione denominata `Mini Keyboard`/software analogo con controlli `KEY1`, `K1 Left`, `K1 Centre`, `K1 Right`, modificatori, keycode, multimedia e pulsante `Download`.

## Limiti rispetto al firmware nuovo

Il manuale descrive effetti LED globali predefiniti, non un protocollo per impostare da Python colore e luminosità di ogni singolo LED. Il firmware e la webapp realizzati in questo progetto sostituiscono quel comportamento con controllo Raw HID documentato.

Il PDF include un link di download del venditore e istruzioni per disattivare l’antivirus al primo avvio. Il software originale non è stato installato, come richiesto; è stato considerato materiale non fidato e analizzato soltanto tramite documentazione/file.
