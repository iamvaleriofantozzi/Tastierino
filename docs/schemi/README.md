# Schemi del sistema

## Architettura

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#111827","primaryTextColor":"#f8fafc","primaryBorderColor":"#9ca9bc","lineColor":"#9ca9bc","secondaryColor":"#0a0f1c","tertiaryColor":"#163a2a","fontFamily":"-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"}}}%%
flowchart LR
    UI["Webapp"] --> HTTP["Server locale"]
    HTTP --> API["MacroPad API"]
    API --> IO["macOS IOHID"]
    IO --> RAW["Raw HID 32 B"]
    RAW --> FW["CH552 firmware"]
    FW --> OUT["LED e keymap"]
    FW --> MEM[("Data Flash")]
    classDef focal fill:#163a2a,stroke:#31dc77,color:#f8fafc,stroke-width:2px
    classDef backend fill:#111827,stroke:#9ca9bc,color:#f8fafc
    classDef store fill:#172033,stroke:#748198,color:#f8fafc
    class UI focal
    class HTTP,API,IO,RAW,FW,OUT backend
    class MEM store
    linkStyle default stroke:#57a6ff,color:#57a6ff
```

## Primo flash hardware

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#111827","primaryTextColor":"#f8fafc","primaryBorderColor":"#9ca9bc","lineColor":"#9ca9bc","secondaryColor":"#0a0f1c","tertiaryColor":"#163a2a","fontFamily":"-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"}}}%%
flowchart TD
    OFF["USB scollegata"] --> RES["10k P3.6-V33"]
    RES --> RESET["Ricollega / reset"]
    RESET --> INFO{"wchisp vede CH552?"}
    INFO -- "No" --> RESET
    INFO -- "Sì" --> FLASH["Scrivi binario"]
    FLASH --> VERIFY{"Verify OK?"}
    VERIFY -- "No" --> RESET
    VERIFY -- "Sì" --> REMOVE["Scollega e rimuovi"]
    classDef focal fill:#163a2a,stroke:#31dc77,color:#f8fafc,stroke-width:2px
    classDef backend fill:#111827,stroke:#9ca9bc,color:#f8fafc
    class OFF,RES,RESET,INFO,FLASH,VERIFY backend
    class REMOVE focal
    linkStyle default stroke:#57a6ff,color:#57a6ff
```

## Comando luce e salvataggio

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#111827","primaryTextColor":"#f8fafc","primaryBorderColor":"#9ca9bc","lineColor":"#9ca9bc","secondaryColor":"#0a0f1c","tertiaryColor":"#163a2a","fontFamily":"-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"}}}%%
sequenceDiagram
    participant W as Webapp
    participant P as Python
    participant H as IOHID
    participant F as Firmware
    participant E as LED / EEPROM
    W->>P: POST rgb
    P->>H: write report
    H->>F: SET_RGB + brightness
    F->>E: aggiorna LED
    F-->>H: risposta 0x81
    H-->>P: Feature report
    P-->>W: 200 OK
    opt Salva
        W->>P: POST save
        P->>F: SAVE_CONFIG
        F->>E: scrive Data Flash
    end
```

## Stati applicazione e bootloader

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#111827","primaryTextColor":"#f8fafc","primaryBorderColor":"#9ca9bc","lineColor":"#9ca9bc","secondaryColor":"#0a0f1c","tertiaryColor":"#163a2a","fontFamily":"-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"}}}%%
stateDiagram-v2
    [*] --> App
    App --> BootRequest: comando 0x06
    App --> BootRequest: KEY1 al reset
    BootRequest --> WCHISP: BOOT_now
    WCHISP --> Writing: flash
    Writing --> Verified: verify OK
    Verified --> App: reset USB
    Writing --> WCHISP: errore / retry
```

## Collegamenti funzionali

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#111827","primaryTextColor":"#f8fafc","primaryBorderColor":"#9ca9bc","lineColor":"#9ca9bc","secondaryColor":"#0a0f1c","tertiaryColor":"#163a2a","fontFamily":"-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"}}}%%
flowchart LR
    USB["USB-C"] --> DP["P3.6 / P3.7"]
    DP --> MCU["CH552G"]
    K1["Tre pulsanti"] --> MCU
    ENC["Encoder + click"] --> MCU
    MCU --> NEO["P3.4 NeoPixel"]
    NEO --> L1["LED 1"] --> L2["LED 2"] --> L3["LED 3"]
    classDef focal fill:#163a2a,stroke:#31dc77,color:#f8fafc,stroke-width:2px
    classDef backend fill:#111827,stroke:#9ca9bc,color:#f8fafc
    class MCU focal
    class USB,DP,K1,ENC,NEO,L1,L2,L3 backend
    linkStyle default stroke:#57a6ff,color:#57a6ff
```

Il collegamento da 10 kΩ serve solo per forzare il bootloader: pin 12 `P3.6/UDP` verso pin 16 `V33`. Non è un componente in serie nel percorso USB.

