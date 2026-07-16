# CH552G pinout used in the project

Top view of the SOP16 package, notch at the top:

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

Physical pin 3 is `P1.5`. Physical pin 12 is `P3.6/UDP`; pin 16 is `V33`. Always refer to the package notch and verify the actual orientation in the photo before soldering.
