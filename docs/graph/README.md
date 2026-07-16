# Grafo statico del codice

Aprire `graph.html` in un browser per esplorare il grafo interattivo. `graph.json` contiene i dati grezzi e `GRAPH_REPORT.md` il report automatico.

## Ambito

Il corpus contiene soltanto sorgenti Python, JavaScript, C e header: 285 nodi, 416 archi e 18 comunità. I nodi più connessi sono `MacroPad`, `main()` e `raw_handle()` insieme alle strutture descrittore USB.

Le connessioni più utili emerse sono:

- i test `DeviceTests` usano l’API `MacroPad`;
- `NEO_update()` attraversa il confine tra firmware applicativo e driver NeoPixel;
- `raw_handle()` collega protocollo applicativo e trasporto HID;
- `MacroPad` collega server web e dispositivo fisico.

## Qualità e limiti

L’estrazione riporta 91% di archi estratti e 9% inferiti, senza cicli di import. La diagnostica grezza ha però segnalato **40 archi con endpoint pendenti** e 103 nodi con al massimo una connessione. Sono soprattutto strutture USB generiche, primitive di timing generate e simboli esterni presenti negli header CH55x. Per questo il grafo va usato per orientarsi, mentre pinout e protocollo devono essere verificati sul codice e sul datasheet.

