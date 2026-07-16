# Primo flash da macOS

Non serve una VM Windows. La compilazione avviene con SDCC e la programmazione con `wchisp` direttamente da macOS.

## Prerequisiti

```sh
brew install sdcc
```

Installare inoltre `wchisp` e verificare che sia nel `PATH`:

```sh
wchisp --help
```

La webapp cerca `wchisp` nel `PATH`. In alternativa si può impostare la variabile d’ambiente `WCHISP` con il percorso assoluto del binario.

## Compilazione

Dalla radice del progetto:

```sh
make -C firmware clean all
```

Il linker è configurato con limite `0x3800`, cioè 14.336 byte. Il binario documentato in questo snapshot misura 6.204 byte e ha SHA-256:

```text
2ceffde3bff9a2a5f6176ac49a287ac443a3d4d92bf7a9ab2a203ba3b365cf1b
```

La dimensione dell’intervallo riportata dal programmatore può essere più grande del file utile perché l’immagine viene allineata o riempita durante la scrittura.

## Rilevamento e scrittura

Entrare nel bootloader con la procedura descritta in [02-bootloader-e-resistenza.md](02-bootloader-e-resistenza.md), poi eseguire rapidamente:

```sh
wchisp info
wchisp flash firmware/3keys_1knob.bin
```

Il dispositivo rilevato nelle prove era un `CH552` con bootloader `2.50`. Considerare il flash riuscito solo quando il tool termina senza errore e riporta la verifica positiva.

## Controllo successivo

Dopo il riavvio, macOS deve vedere:

- VID:PID `1189:8890`;
- interfaccia tastiera/consumer HID;
- interfaccia Raw HID vendor-defined, usage page `0xFF60`.

La webapp deve mostrare “connesso” e riuscire a leggere configurazione e illuminazione.

