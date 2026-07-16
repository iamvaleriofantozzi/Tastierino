# System diagrams

## Architecture

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#111827","primaryTextColor":"#f8fafc","primaryBorderColor":"#9ca9bc","lineColor":"#9ca9bc","secondaryColor":"#0a0f1c","tertiaryColor":"#163a2a","fontFamily":"-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"}}}%%
flowchart LR
    UI["Webapp"] --> HTTP["Local server"]
    HTTP --> API["MacroPad API"]
    API --> IO["macOS IOHID"]
    IO --> RAW["Raw HID 32 B"]
    RAW --> FW["CH552 firmware"]
    FW --> OUT["LEDs and keymap"]
    FW --> MEM[("Data Flash")]
    classDef focal fill:#163a2a,stroke:#31dc77,color:#f8fafc,stroke-width:2px
    classDef backend fill:#111827,stroke:#9ca9bc,color:#f8fafc
    classDef store fill:#172033,stroke:#748198,color:#f8fafc
    class UI focal
    class HTTP,API,IO,RAW,FW,OUT backend
    class MEM store
    linkStyle default stroke:#57a6ff,color:#57a6ff
```

## First hardware flash

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#111827","primaryTextColor":"#f8fafc","primaryBorderColor":"#9ca9bc","lineColor":"#9ca9bc","secondaryColor":"#0a0f1c","tertiaryColor":"#163a2a","fontFamily":"-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"}}}%%
flowchart TD
    OFF["USB disconnected"] --> RES["10k P3.6-V33"]
    RES --> RESET["Reconnect / reset"]
    RESET --> INFO{"Does wchisp see the CH552?"}
    INFO -- "No" --> RESET
    INFO -- "Yes" --> FLASH["Write binary"]
    FLASH --> VERIFY{"Verify OK?"}
    VERIFY -- "No" --> RESET
    VERIFY -- "Yes" --> REMOVE["Disconnect and remove"]
    classDef focal fill:#163a2a,stroke:#31dc77,color:#f8fafc,stroke-width:2px
    classDef backend fill:#111827,stroke:#9ca9bc,color:#f8fafc
    class OFF,RES,RESET,INFO,FLASH,VERIFY backend
    class REMOVE focal
    linkStyle default stroke:#57a6ff,color:#57a6ff
```

## Lighting command and save

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
    F->>E: update LED
    F-->>H: response 0x81
    H-->>P: Feature report
    P-->>W: 200 OK
    opt Save
        W->>P: POST save
        P->>F: SAVE_CONFIG
        F->>E: write Data Flash
    end
```

## Application and bootloader states

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#111827","primaryTextColor":"#f8fafc","primaryBorderColor":"#9ca9bc","lineColor":"#9ca9bc","secondaryColor":"#0a0f1c","tertiaryColor":"#163a2a","fontFamily":"-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"}}}%%
stateDiagram-v2
    [*] --> App
    App --> BootRequest: command 0x06
    App --> BootRequest: KEY1 on reset
    BootRequest --> WCHISP: BOOT_now
    WCHISP --> Writing: flash
    Writing --> Verified: verify OK
    Verified --> App: USB reset
    Writing --> WCHISP: error / retry
```

## Functional connections

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#111827","primaryTextColor":"#f8fafc","primaryBorderColor":"#9ca9bc","lineColor":"#9ca9bc","secondaryColor":"#0a0f1c","tertiaryColor":"#163a2a","fontFamily":"-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"}}}%%
flowchart LR
    USB["USB-C"] --> DP["P3.6 / P3.7"]
    DP --> MCU["CH552G"]
    K1["Three buttons"] --> MCU
    ENC["Encoder + click"] --> MCU
    MCU --> NEO["P3.4 NeoPixel"]
    NEO --> L1["LED 1"] --> L2["LED 2"] --> L3["LED 3"]
    classDef focal fill:#163a2a,stroke:#31dc77,color:#f8fafc,stroke-width:2px
    classDef backend fill:#111827,stroke:#9ca9bc,color:#f8fafc
    class MCU focal
    class USB,DP,K1,ENC,NEO,L1,L2,L3 backend
    linkStyle default stroke:#57a6ff,color:#57a6ff
```

The 10 kΩ connection is only used to force the bootloader: pin 12 `P3.6/UDP` to pin 16 `V33`. It is not a series component in the USB path.
