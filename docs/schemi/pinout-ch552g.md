# Pinout CH552G usato nel progetto

Vista dall’alto del package SOP16, tacca in alto:

```text
                 ┌───∪───┐
 P3.2        1 ──┤       ├── 16  V33
 P1.4        2 ──┤       ├── 15  VCC
 P1.5        3 ──┤ CH552 ├── 14  GND
 P1.6 / KEY3 4 ──┤       ├── 13  P3.7 / UDM
 P1.7 / KEY2 5 ──┤       ├── 12  P3.6 / UDP
 RST         6 ──┤       ├── 11  P3.4 / NEO
 P3.1 / ENCA 7 ──┤       ├── 10  P3.3 / ENCSW
 P3.0 / ENCB 8 ──┤       ├──  9  P1.1 / KEY1
                 └───────┘
```

Il pin fisico 3 è `P1.5`. Il pin fisico 12 è `P3.6/UDP`; il pin 16 è `V33`. Fare sempre riferimento alla tacca del package e verificare l’orientamento reale della foto prima di saldare.

