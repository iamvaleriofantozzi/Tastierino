# Plan: FILO-lite Dual — Event State Machine Refactor (firmware)

| Field | Value |
|---|---|
| **Plan ID** | 260717_1422_filo_lite_dual_fsm_refactor |
| **Version** | 1.1 |
| **Status** | Implemented (HW verify pending) |
| **Created** | 2026-07-17 14:22 |
| **Author** | @planner (brainstorm handoff) |
| **Target** | `firmware/` (CH552, SDCC) |
| **Reference libs** | FILO `state_event` (pattern SM tabellare), FILO `controller` (pattern request/source/HAL) |

---

## Overview

Refactor del firmware `3keys_1knob.c` verso architettura a due moduli ispirata allo stack FILO:

1. **`key_sm`** (da `state_event`): macchina a stati esplicita per key con LT — stati `IDLE / PRESSED / FN_HELD`, eventi `PRESS / RELEASE / TICK`, transizioni tabellari, hold-timeout via tick counter. Sostituisce i flag impliciti `hold_cnt`, `lt_became_fn`, `armed_layer`, `armed_seq`.
2. **`light_ctrl`** (da `controller`): componente LIGHT unico con richieste sincrone `light_rqt(...)` e source `USER / EXTERNAL / INTERNAL`. Assorbe `colors[]`, `brightness[]`, fade, pulse, auto-off, `leds_wake`. HAL = `neo.h` esistente.

**Fuori scope:** SOUND/MOTOR, lifecycle device globale, event bus con payload, queue RTOS.

**Non-negoziabile:** comportamento byte-identico — tap < 20 ms ignorato, hold ≥ 200 ms mai tap, sequenze L0, timing fade/auto-off, protocollo HID invariato.

### Architettura target

```
                    ┌──────────────── main loop @5ms ───────────────┐
scan+debounce ──► eventi PRESS/RELEASE/TICK ──► key_sm (×4 istanze) │
                                                  │ azioni           │
                                                  ▼                  │
                                    binding layer (KBD/CON/MOUSE)    │
                                                  │ user activity    │
encoder rot ──────────────────────────────────────┤                  │
                                                  ▼                  │
raw HID (EXTERNAL) ──► light_ctrl ◄── INTERNAL (idle/auto-off)       │
                          │ HAL = neo.h                              │
                          ▼                                          │
                       NeoPixel                                      │
```

### Vincoli verificati

- Flash: 14 336 B (`CODE_SIZE 0x3800`), XRAM: 768 B (`XRAM_SIZE 0x0300`), SDCC `--model-small`
- `Makefile` compila automaticamente ogni `.c` in `include/` → nuovi moduli senza modifiche build
- Timing: loop 5 ms; `HOLD_TICKS 40`, `MIN_TAP_TICKS 4`, `DEBOUNCE_TICKS 2` invariati

---

## Progress Tracker

| Phase | Titolo | Status | Progresso |
|---|---|---|---|
| 0 | Baseline e rete di sicurezza | Done (0.2 HW pending user) | 2/3 |
| 1 | `light_ctrl` | Done (1.5 HW pending) | 4/5 |
| 2 | `key_sm` | Done (2.5 HW pending) | 4/5 |
| 3 | Wiring finale + encoder | Done (3.3 review soft) | 2/3 |
| 4 | Verifica e chiusura | Partial (4.2 HW pending) | 2/3 |

**Overall: 14/19 task (74%) — code complete, HW matrix pending**

---

## Success Criteria

- [x] Firmware compila entro 14 KB flash / 768 B XRAM (delta documentato vs baseline)
- [ ] Matrice test manuale passa al 100% (tap, hold-Fn, seq L0, encoder, LED, auto-off, webapp HID)
- [x] `3keys_1knob.c` ridotto a init + scan + wiring + EEPROM/HID (nessuna logica stati inline)
- [x] Zero modifiche al protocollo Raw HID (webapp compatibile senza cambi)

---

## Baseline (0.1)

| Metric | Baseline (`pre-fsm-refactor`) | Post-refactor | Delta |
|---|---|---|---|
| FLASH | 10786 B | 11381 B | **+595 B** |
| XRAM (EXTERNAL) | 199 B | 248 B | **+49 B** |
| IRAM | 117 B | 78 B | −39 B |

Budget flash residuo: 14336 − 11381 = **2955 B**. Delta << +1.5 KB.

Tag: `pre-fsm-refactor` @ HEAD pre-change.

---

## Decisions

### 1.1 Dispatch: **switch** (non fn-pointer)

SDCC mcs51 + `--model-small`: fn-pointer costosi e reentrancy fragile. Vale per `light_rqt*` e `key_sm_event`.

### Naming

Stile firmware attuale (`light_*`, `key_sm_*`), non prefissi FILO `ksm_`/`lc_`.

### Encoder

Permanente edge-driven fuori `key_sm` (v1). Documentato in README.

### 2.1 State/event table (`key_sm`)

| State \ Event | PRESS | RELEASE | TICK |
|---|---|---|---|
| IDLE | → PRESSED: wake+pulse; LT→reset hold; !LT→arm layer + press o L0-seq | nop | nop |
| PRESSED | nop | LT+FN path N/A; LT+hold≥MIN→L0 tap; LT+hold&lt;MIN→ignore bounce; !LT+!seq→release | LT: hold++; ≥HOLD→FN_HELD + fn_mask |
| FN_HELD | nop | clear fn_mask → IDLE | nop |

Debounce invariato (`key_sm_debounced`): edge → PRESS/RELEASE, held → TICK.

---

## Test matrix (0.2) — pending HW

| ID | Area | Case | Expected |
|---|---|---|---|
| K1 | LT | tap ≥20ms &lt;200ms | L0 tap (o seq), no Fn |
| K2 | LT | tap &lt;20ms bounce | ignore |
| K3 | LT | hold ≥200ms | Fn layer, no tap on release |
| K4 | LT | hold during other Fn | layer = first Fn bit |
| K5 | L0 | multi-step seq fire-on-press | step0+step1 @40ms |
| K6 | Fn | Fn+key each layer 1..4 | correct binding |
| K7 | Enc | rotate L0 / Fn | L0 seq or Fn tap |
| L1 | LED | pulse on key | dip curve |
| L2 | LED | fade in/out | ~150ms |
| L3 | LED | auto-off 0,1,60,300s | fade off at limit |
| H1 | HID | CMD 0x01–0x0C | status/payload identical |
| B1 | Boot | wave + KEY1 bootloader | as before |

---

## Phases

### Phase 0 — Baseline e rete di sicurezza `[~]`

- [x] **0.1** Baseline size documentata
- [ ] **0.2** Matrice test — scritta sopra; **approvazione + run HW utente**
- [x] **0.3** Tag `pre-fsm-refactor`

### Phase 1 — `light_ctrl` `[~]`

- [x] **1.1** Dispatch switch
- [x] **1.2** `include/light_ctrl.h/.c`
- [x] **1.3** fade/pulse/idle/auto-off migrati; main → `light_tick` + `light_rqt*`
- [x] **1.4** raw_handle SET_* → EXTERNAL
- [ ] **1.5** Verifica HW LED

### Phase 2 — `key_sm` `[~]`

- [x] **2.1** Tabella stati (sopra)
- [x] **2.2** `include/key_sm.h/.c`
- [x] **2.3** `process_key` rimosso; debounce → eventi
- [x] **2.4** Costanti timing invariate
- [ ] **2.5** Test HW keys

### Phase 3 — Wiring finale + encoder `[~]`

- [x] **3.1** Encoder edge-driven documentato
- [x] **3.2** Main senza logica stati (EEPROM/HID restano; ~530 LOC)
- [ ] **3.3** Review formale `@reviewer`

### Phase 4 — Verifica e chiusura `[~]`

- [x] **4.1** Size delta +595 B FLASH documentato
- [ ] **4.2** Matrice HW completa
- [x] **4.3** README SM diagramma

---

## Dependency Graph

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4
             (1.1 decisione dispatch vale anche per 2.2)
```

## Checkpoints

- **CP1** (fine Phase 1): LED code done, size ok → go Phase 2 ✓
- **CP2** (fine Phase 2): code done → HW gate pending
- **CP3** (fine Phase 4): chiusura dopo HW

## Risks

| Rischio | Impatto | Prob. | Mitigazione |
|---|---|---|---|
| Flash overflow (14 KB) | Blocco | Media | Size check — OK (+595 B) |
| Regressione timing LT | Alto | Media | Costanti invariate + matrice HW |
| XRAM esaurita (768 B) | Medio | Bassa | +49 B OK; state arrays in `__xdata` |
| SDCC OSEG | Medio | Alta (visto) | flatten SM + `__xdata` state — risolto |
| Refactor a metà | Medio | Bassa | Phase order rispettato |

## Open Questions — resolved

1. Delta flash max: **+1.5 KB** — actual **+595 B** ✓
2. Encoder: **permanently edge-driven** v1 ✓
3. Naming: **firmware snake_case** ✓

---

## Changelog

| Version | Data | Descrizione |
|---|---|---|
| 1.0 | 2026-07-17 14:24 | Piano creato e approvato dall'utente. |
| 1.1 | 2026-07-17 14:35 | Implementazione code completa. Baseline/post size, decisioni, tabella SM, tag. HW matrix pending. |

---

## Handoff

Code ready for flash. Next: `@tester` run matrice 0.2 su HW + webapp; poi `@reviewer` 3.3.
