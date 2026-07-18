const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const controls = ["Button 1", "Button 2", "Button 3", "Encoder click", "Encoder clockwise", "Encoder counterclockwise"];
const LT_CAPABLE = 4;
const MACRO_STEPS = 2; // Tap layer: sequential actions (firmware limit)
const QUICK_COLORS = ["#ff0000","#ff8c00","#ffd400","#00ff50","#0050ff","#ffffff"];
let colors = [[0,80,255],[0,255,80],[255,20,0]];
let brightness = [160,160,160];
let pulse = [true, true, true];
let cpulse = [false, false, false]; // continuous pulse (pulse curve loops until toggled off)
let cpulsePeriod = [500, 500, 500];
let cpulseDivisor = [20, 20, 20];
let lastColorsBeforeOff = null;
let autoOffEnabled = false;
let autoOffSteps = 9; // index into AUTO_OFF_SECONDS → 60s
const AUTO_OFF_SECONDS = [0, 1, 3, 5, ...Array.from({length: 30}, (_, i) => (i + 1) * 10)];
const AUTO_OFF_MAX_INDEX = AUTO_OFF_SECONDS.length - 1;
let uploaded = false;
let rgbTimer;
let ltMask = 0;
let holdEntries = []; // {fn, target} — hold Fn key, remap target key
let layerKeys = [
  [
    {mod:0,type:0,code:0x68},{mod:0,type:0,code:0x69},{mod:0,type:0,code:0x6a},
    {mod:0,type:1,code:0xe2},{mod:0,type:1,code:0xe9},{mod:0,type:1,code:0xea},
  ],
  [
    {mod:0,type:0,code:0x6b},{mod:0,type:0,code:0x6c},{mod:0,type:0,code:0x6d},
    {mod:0,type:1,code:0xcd},{mod:0,type:1,code:0xb5},{mod:0,type:1,code:0xb6},
  ],
  [
    {mod:0,type:0,code:0x6b},{mod:0,type:0,code:0x6c},{mod:0,type:0,code:0x6d},
    {mod:0,type:1,code:0xcd},{mod:0,type:1,code:0xb5},{mod:0,type:1,code:0xb6},
  ],
  [
    {mod:0,type:0,code:0x6b},{mod:0,type:0,code:0x6c},{mod:0,type:0,code:0x6d},
    {mod:0,type:1,code:0xcd},{mod:0,type:1,code:0xb5},{mod:0,type:1,code:0xb6},
  ],
  [
    {mod:0,type:0,code:0x6b},{mod:0,type:0,code:0x6c},{mod:0,type:0,code:0x6d},
    {mod:0,type:1,code:0xcd},{mod:0,type:1,code:0xb5},{mod:0,type:1,code:0xb6},
  ],
];
const DEFAULT_KEYS = layerKeys[0].map(k => normalizeKey(k));
const DEFAULT_KEYS_FN = layerKeys[1].map(k => ({...k}));
let settingsTimer = null;
let editStepIndex = 0; // which sequence step the picker/record edits

function normalizeKey(key) {
  if (!key) return {mod: 0, type: 0, code: 0, steps: []};
  if (Array.isArray(key.steps)) {
    const steps = key.steps
      .slice(0, MACRO_STEPS)
      .map(s => ({mod: s.mod | 0, type: s.type | 0, code: s.code | 0}))
      .filter(s => s.code || s.mod || s.type);
    const base = steps[0] ? {...steps[0]} : {mod: 0, type: 0, code: 0};
    return {...base, steps};
  }
  const base = {mod: key.mod | 0, type: key.type | 0, code: key.code | 0};
  const steps = (base.code || base.mod || base.type) ? [{...base}] : [];
  return {...base, steps};
}

layerKeys[0] = layerKeys[0].map(normalizeKey);

function log(message) {
  const area = $("#log");
  area.textContent += `\n${new Date().toLocaleTimeString()}  ${message}`;
  area.scrollTop = area.scrollHeight;
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP error ${response.status}`);
  return data;
}

function post(path, body = {}) {
  return api(path, {method:"POST", headers:{"Content-Type":"application/json", "X-Macropad-Client":"1"}, body:JSON.stringify(body)});
}

function rgbToHex(rgb) { return `#${rgb.map(v => v.toString(16).padStart(2,"0")).join("")}`; }
function hexToRgb(hex) {
  const clean = hex.startsWith("#") ? hex : `#${hex}`;
  return [1,3,5].map(i => parseInt(clean.slice(i,i+2),16));
}
function pct(value) { return `${Math.round(value / 255 * 100)}%`; }

function rgbToHsv([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s: max ? d / max : 0, v: max };
}

function hsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360 / 60;
  const c = v * s;
  const x = c * (1 - Math.abs(h % 2 - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 1) [r, g, b] = [c, x, 0];
  else if (h < 2) [r, g, b] = [x, c, 0];
  else if (h < 3) [r, g, b] = [0, c, x];
  else if (h < 4) [r, g, b] = [0, x, c];
  else if (h < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [r, g, b].map(n => Math.round((n + m) * 255));
}

function hueCss(h) {
  return rgbToHex(hsvToRgb(h, 1, 1));
}

function buildQuickColors() {
  $$(".quick-colors").forEach((group, led) => {
    group.textContent = "";
    QUICK_COLORS.forEach(hex => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "quick-swatch";
      btn.style.setProperty("--swatch", hex);
      btn.dataset.quick = hex;
      btn.title = hex;
      btn.setAttribute("aria-label", `Set Key ${led + 1} to ${hex}`);
      group.append(btn);
    });
  });
}

function paintPreview() {
  $$('[data-color]').forEach((input, i) => {
    const hex = rgbToHex(colors[i]);
    input.value = hex;
    const swatch = input.closest(".light-swatch") || input.parentElement;
    swatch.style.setProperty("--key-color", hex);
    swatch.style.setProperty("--key-glow", String(Math.max(0.12, brightness[i] / 255)));
    const chip = $(`[data-hex-chip="${i}"]`);
    if (chip) chip.textContent = hex.toUpperCase();
    const row = input.closest(".light-row");
    row?.querySelectorAll(".quick-swatch").forEach(btn => {
      btn.classList.toggle("is-active", btn.dataset.quick.toLowerCase() === hex.toLowerCase());
    });
  });
  $$('[data-brightness]').forEach((input, i) => {
    input.value = brightness[i];
    $(`[data-brightness-value="${i}"]`).value = pct(brightness[i]);
  });
  $$("[data-pulse]").forEach((btn, i) => {
    const on = !!pulse[i];
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  $$("[data-cpulse]").forEach((btn, i) => {
    const on = !!cpulse[i];
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  $$("[data-cpulse-period]").forEach((input, i) => {
    input.value = cpulsePeriod[i];
  });
  $$("[data-cpulse-divisor]").forEach((input, i) => {
    input.value = cpulseDivisor[i];
  });
  syncLightsToggle();
  paintAutoOff();
}

function allLightsOff() {
  return brightness.every(b => (b | 0) === 0);
}

function syncLightsToggle() {
  const btn = $("#lightsOff");
  if (!btn) return;
  const off = allLightsOff();
  btn.textContent = off ? "Turn all on" : "Turn all off";
}

function formatAutoOff(index) {
  const sec = AUTO_OFF_SECONDS[Math.max(0, Math.min(AUTO_OFF_MAX_INDEX, index | 0))] ?? 0;
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m ${String(s).padStart(2, "0")}s` : `${m}m`;
}

function paintAutoOff() {
  const row = $(".auto-off-row");
  const toggle = $("#autoOffToggle");
  const slider = $("#autoOffSteps");
  const value = $("#autoOffValue");
  if (!toggle || !slider || !value) return;
  const on = !!autoOffEnabled;
  toggle.classList.toggle("is-on", on);
  toggle.setAttribute("aria-pressed", on ? "true" : "false");
  row?.classList.toggle("is-enabled", on);
  slider.disabled = !on;
  slider.value = String(autoOffSteps);
  value.value = formatAutoOff(autoOffSteps);
}

async function sendRgb(opts = {}) {
  try {
    const body = {};
    // Targeted per-LED write: device owns untouched LEDs (no stale host state → no ghost dips)
    if (typeof opts.led === "number" && opts.led >= 0 && opts.led < 3) {
      body.led = opts.led;
      if (opts.brightness) body.brightness = brightness[opts.led] | 0;
      else body.color = colors[opts.led].map(n => n | 0);
    } else if (!opts.skipLeds) {
      body.colors = colors.map(c => c.map(n => n | 0));
      body.brightness = brightness.map(n => n | 0);
    }
    if (opts.applyPulse) {
      body.pulse = pulse;
      body.apply_pulse = true;
    }
    if (opts.applyAutoOff) {
      body.auto_off_enabled = !!autoOffEnabled;
      body.auto_off_steps = autoOffSteps | 0;
      body.apply_auto_off = true;
    }
    if (opts.applyCpulse) {
      const led = opts.cpulseLed;
      body.cpulse_led = led;
      body.cpulse_enabled = !!cpulse[led];
      body.cpulse_period = cpulsePeriod[led] | 0;
      body.cpulse_divisor = cpulseDivisor[led] | 0;
      body.apply_cpulse = true;
    }
    if (!Object.keys(body).length) return;
    await post("/api/rgb", body);
  } catch (error) { log(`LED: ${error.message}`); }
}

function queueRgb(opts) {
  clearTimeout(rgbTimer);
  rgbTimer = setTimeout(() => sendRgb(opts), 80);
  queueSettingsSave();
}

const MOD_CTRL = 1, MOD_SHIFT = 2, MOD_ALT = 4, MOD_GUI = 8;
const KEY_CATALOG = [
  ["Letters", [
    ["A",0,0x04],["B",0,0x05],["C",0,0x06],["D",0,0x07],["E",0,0x08],["F",0,0x09],
    ["G",0,0x0a],["H",0,0x0b],["I",0,0x0c],["J",0,0x0d],["K",0,0x0e],["L",0,0x0f],
    ["M",0,0x10],["N",0,0x11],["O",0,0x12],["P",0,0x13],["Q",0,0x14],["R",0,0x15],
    ["S",0,0x16],["T",0,0x17],["U",0,0x18],["V",0,0x19],["W",0,0x1a],["X",0,0x1b],
    ["Y",0,0x1c],["Z",0,0x1d],
  ]],
  ["Digits", [
    ["1",0,0x1e],["2",0,0x1f],["3",0,0x20],["4",0,0x21],["5",0,0x22],
    ["6",0,0x23],["7",0,0x24],["8",0,0x25],["9",0,0x26],["0",0,0x27],
  ]],
  ["Function", [
    ["F1",0,0x3a],["F2",0,0x3b],["F3",0,0x3c],["F4",0,0x3d],["F5",0,0x3e],["F6",0,0x3f],
    ["F7",0,0x40],["F8",0,0x41],["F9",0,0x42],["F10",0,0x43],["F11",0,0x44],["F12",0,0x45],
    ["F13",0,0x68],["F14",0,0x69],["F15",0,0x6a],["F16",0,0x6b],["F17",0,0x6c],["F18",0,0x6d],
    ["F19",0,0x6e],["F20",0,0x6f],["F21",0,0x70],["F22",0,0x71],["F23",0,0x72],["F24",0,0x73],
  ]],
  ["Navigation", [
    ["←",0,0x50],["→",0,0x4f],["↑",0,0x52],["↓",0,0x51],
    ["Home",0,0x4a],["End",0,0x4d],["Page Up",0,0x4b],["Page Down",0,0x4e],
    ["Tab",0,0x2b],["Enter",0,0x28],["Esc",0,0x29],["Backspace",0,0x2a],
    ["Delete",0,0x4c],["Space",0,0x2c],["Caps Lock",0,0x39],
  ]],
  ["Symbols", [
    ["-",0,0x2d],["=",0,0x2e],["[",0,0x2f],["]",0,0x30],["\\",0,0x31],
    [";",0,0x33],["'",0,0x34],["`",0,0x35],[",",0,0x36],[".",0,0x37],["/",0,0x38],
  ]],
  ["Media", [
    ["Mute",1,0xe2],["Volume Up",1,0xe9],["Volume Down",1,0xea],
    ["Play / Pause",1,0xcd],["Next Track",1,0xb5],["Prev Track",1,0xb6],
    ["Stop",1,0xb7],["Eject",1,0xb8],
  ]],
  ["Mouse", [
    ["Left Click",2,0x01],["Right Click",2,0x02],["Middle Click",2,0x04],
    ["Scroll Up",2,0x10],["Scroll Down",2,0x11],
  ]],
];

const LABEL_BY_ACTION = new Map(
  KEY_CATALOG.flatMap(([, entries]) => entries.map(([name, type, code]) => [`${type}:${code}`, name]))
);

const CODE_TO_EVENT = {
  KeyA:0x04,KeyB:0x05,KeyC:0x06,KeyD:0x07,KeyE:0x08,KeyF:0x09,KeyG:0x0a,KeyH:0x0b,
  KeyI:0x0c,KeyJ:0x0d,KeyK:0x0e,KeyL:0x0f,KeyM:0x10,KeyN:0x11,KeyO:0x12,KeyP:0x13,
  KeyQ:0x14,KeyR:0x15,KeyS:0x16,KeyT:0x17,KeyU:0x18,KeyV:0x19,KeyW:0x1a,KeyX:0x1b,
  KeyY:0x1c,KeyZ:0x1d,
  Digit1:0x1e,Digit2:0x1f,Digit3:0x20,Digit4:0x21,Digit5:0x22,
  Digit6:0x23,Digit7:0x24,Digit8:0x25,Digit9:0x26,Digit0:0x27,
  Enter:0x28,Escape:0x29,Backspace:0x2a,Tab:0x2b,Space:0x2c,
  Minus:0x2d,Equal:0x2e,BracketLeft:0x2f,BracketRight:0x30,Backslash:0x31,
  Semicolon:0x33,Quote:0x34,Backquote:0x35,Comma:0x36,Period:0x37,Slash:0x38,
  CapsLock:0x39,
  F1:0x3a,F2:0x3b,F3:0x3c,F4:0x3d,F5:0x3e,F6:0x3f,F7:0x40,F8:0x41,F9:0x42,
  F10:0x43,F11:0x44,F12:0x45,F13:0x68,F14:0x69,F15:0x6a,F16:0x6b,F17:0x6c,
  F18:0x6d,F19:0x6e,F20:0x6f,F21:0x70,F22:0x71,F23:0x72,F24:0x73,
  ArrowRight:0x4f,ArrowLeft:0x50,ArrowDown:0x51,ArrowUp:0x52,
  Home:0x4a,PageUp:0x4b,Delete:0x4c,End:0x4d,PageDown:0x4e,
  AudioVolumeMute:0xe2,VolumeMute:0xe2,AudioVolumeUp:0xe9,VolumeUp:0xe9,
  AudioVolumeDown:0xea,VolumeDown:0xea,
  MediaPlayPause:0xcd,MediaTrackNext:0xb5,MediaTrackPrevious:0xb6,MediaStop:0xb7,
};

const MEDIA_CODES = new Set([0xe2,0xe9,0xea,0xcd,0xb5,0xb6,0xb7,0xb8]);
const MOD_EVENT = {Control: MOD_CTRL, Shift: MOD_SHIFT, Alt: MOD_ALT, Meta: MOD_GUI};

function keyLabel(type, code) {
  return LABEL_BY_ACTION.get(`${type}:${code}`)
    || (type === 1 ? `Media 0x${code.toString(16)}` : type === 2 ? `Mouse 0x${code.toString(16)}` : `0x${code.toString(16)}`);
}

function shortcutChips({type, mod, code}, {pendingMod = 0} = {}) {
  const chips = [];
  if (type === 0) {
    const mask = mod | pendingMod;
    if (mask & MOD_CTRL) chips.push("⌃");
    if (mask & MOD_ALT) chips.push("⌥");
    if (mask & MOD_SHIFT) chips.push("⇧");
    if (mask & MOD_GUI) chips.push("⌘");
  } else if (pendingMod) {
    if (pendingMod & MOD_CTRL) chips.push("⌃");
    if (pendingMod & MOD_ALT) chips.push("⌥");
    if (pendingMod & MOD_SHIFT) chips.push("⇧");
    if (pendingMod & MOD_GUI) chips.push("⌘");
  }
  if (code || type === 1 || type === 2) chips.push(keyLabel(type, code));
  return chips;
}

function shortcutText(binding, opts) {
  return shortcutChips(binding, opts).join(" ") || "No action";
}

function bindingIsEmpty({type, mod, code}) {
  return !(type | mod | code);
}

const EMPTY_BINDING = {type: 0, mod: 0, code: 0};

function getRowSteps(row) {
  const steps = [];
  const s0 = {
    type: Number(row.dataset.type) || 0,
    mod: Number(row.dataset.mod) || 0,
    code: Number(row.dataset.code) || 0,
  };
  if (!bindingIsEmpty(s0)) steps.push(s0);
  if (row.classList.contains("tap-row") && row.dataset.hasStep1 === "1") {
    const s1 = {
      type: Number(row.dataset.type1) || 0,
      mod: Number(row.dataset.mod1) || 0,
      code: Number(row.dataset.code1) || 0,
    };
    if (!bindingIsEmpty(s1)) steps.push(s1);
  }
  return steps;
}

function getRowBinding(row) {
  const steps = getRowSteps(row);
  if (row.classList.contains("tap-row") && steps[editStepIndex]) {
    return {...steps[editStepIndex]};
  }
  if (steps.length) return {...steps[0]};
  return {
    type: Number(row.dataset.type) || 0,
    mod: Number(row.dataset.mod) || 0,
    code: Number(row.dataset.code) || 0,
  };
}

function rowLabel(row) {
  const name = row.querySelector(".key-name")?.textContent;
  if (name) return name;
  const fn = row.querySelector(".fn-select")?.selectedOptions?.[0]?.textContent;
  const target = row.querySelector(".target-select")?.selectedOptions?.[0]?.textContent;
  if (fn && target) return `Fn ${fn} → ${target}`;
  if (fn) return fn;
  return "Key";
}

function paintHotkeyField(row, {pendingMod = 0, recording = false} = {}) {
  const field = row.querySelector(".hotkey-field");
  if (!field) return;
  const steps = getRowSteps(row);
  const multi = row.classList.contains("tap-row");
  const empty = !recording && steps.length === 0 && !pendingMod;
  field.classList.toggle("is-empty", empty);
  field.classList.toggle("has-binding", steps.length > 0 && !recording);

  if (recording) {
    const chips = shortcutChips({type: 0, mod: 0, code: 0}, {pendingMod});
    field.innerHTML = chips.length
      ? `<span class="hotkey-chips">${chips.map(c => `<span class="hotkey-chip">${c}</span>`).join("")}</span>`
      : `<span class="hotkey-placeholder">Press keys…</span>`;
    field.setAttribute("aria-label", `${rowLabel(row)}: Recording`);
    return;
  }

  if (!steps.length) {
    field.innerHTML = `<span class="hotkey-placeholder">No action</span>`;
    field.setAttribute("aria-label", `${rowLabel(row)}: No action`);
    return;
  }

  const label = rowLabel(row);
  const parts = steps.map((step, i) => {
    const chips = shortcutChips(step).map(c => `<span class="hotkey-chip">${c}</span>`).join("");
    return `<span class="hotkey-step" data-step="${i}">
      <span class="hotkey-chips">${chips}<button type="button" class="hotkey-clear" data-clear-step="${i}" aria-label="Clear step ${i + 1} for ${label}" title="Remove">×</button></span>
    </span>`;
  });
  const addBtn = multi && steps.length < MACRO_STEPS
    ? `<button type="button" class="hotkey-add-step" aria-label="Add next action">+</button>`
    : "";
  field.innerHTML = parts.join(`<span class="hotkey-then" aria-hidden="true">→</span>`) + addBtn;
  const spoken = steps.map(s => shortcutText(s)).join(" then ");
  field.setAttribute("aria-label", `${label}: ${spoken}`);
}

function setRowSteps(row, steps) {
  const clean = (steps || [])
    .slice(0, row.classList.contains("tap-row") ? MACRO_STEPS : 1)
    .map(s => ({mod: s.mod | 0, type: s.type | 0, code: s.code | 0}))
    .filter(s => s.code || s.mod || s.type);
  const s0 = clean[0] || EMPTY_BINDING;
  row.dataset.type = String(s0.type);
  row.dataset.mod = String(s0.mod);
  row.dataset.code = String(s0.code);
  if (clean[1]) {
    row.dataset.hasStep1 = "1";
    row.dataset.type1 = String(clean[1].type);
    row.dataset.mod1 = String(clean[1].mod);
    row.dataset.code1 = String(clean[1].code);
  } else {
    delete row.dataset.hasStep1;
    delete row.dataset.type1;
    delete row.dataset.mod1;
    delete row.dataset.code1;
  }
  paintHotkeyField(row);
}

function setRowBinding(row, {type, mod, code}) {
  const next = {
    type: type | 0,
    mod: type === 0 ? (mod | 0) : 0,
    code: code | 0,
  };
  if (row.classList.contains("hold-row") || !row.classList.contains("tap-row")) {
    row.dataset.type = String(next.type);
    row.dataset.mod = String(next.mod);
    row.dataset.code = String(next.code);
    delete row.dataset.hasStep1;
    paintHotkeyField(row);
    return;
  }
  const steps = getRowSteps(row);
  const idx = Math.min(editStepIndex, Math.max(steps.length, 0));
  if (bindingIsEmpty(next)) {
    steps.splice(idx, 1);
  } else if (idx < steps.length) {
    steps[idx] = next;
  } else {
    steps.push(next);
  }
  setRowSteps(row, steps);
}

const hotkeyPicker = (() => {
  const pop = $("#hotkeyPopover");
  const cats = pop.querySelector(".hotkey-cats");
  const keys = pop.querySelector(".hotkey-keys");
  const title = $("#hotkeyPopoverTitle");
  let row = null;
  let anchor = null;
  let catIndex = 0;
  let pickMod = 0;
  let raf = 0;

  KEY_CATALOG.forEach(([label], i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hotkey-cat";
    btn.setAttribute("role", "tab");
    btn.textContent = label;
    btn.dataset.cat = String(i);
    cats.append(btn);
  });

  function syncModChips() {
    const noMod = KEY_CATALOG[catIndex][0] === "Media" || KEY_CATALOG[catIndex][0] === "Mouse";
    pop.querySelector(".hotkey-mod-row").hidden = noMod;
    pop.querySelectorAll("[data-pick-mod]").forEach(btn => {
      const bit = Number(btn.dataset.pickMod);
      const on = !noMod && !!(pickMod & bit);
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function renderKeys() {
    const [label, entries] = KEY_CATALOG[catIndex];
    cats.querySelectorAll(".hotkey-cat").forEach((btn, i) => {
      btn.classList.toggle("is-active", i === catIndex);
      btn.setAttribute("aria-selected", i === catIndex ? "true" : "false");
    });
    keys.textContent = "";
    const current = row ? getRowBinding(row) : null;
    entries.forEach(([name, type, code]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hotkey-key";
      btn.setAttribute("role", "option");
      btn.textContent = name;
      btn.dataset.type = String(type);
      btn.dataset.code = String(code);
      if (current && current.type === type && current.code === code) btn.classList.add("is-selected");
      keys.append(btn);
    });
    title.textContent = label;
    syncModChips();
  }

  function positionNear() {
    if (!anchor || pop.hidden) return;
    const rect = anchor.getBoundingClientRect();
    const pad = 10;
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const viewH = window.innerHeight;
    const viewW = window.innerWidth;
    const visible = rect.bottom > 0 && rect.top < viewH && rect.right > 0 && rect.left < viewW;
    if (!visible) {
      close();
      return;
    }
    let left = rect.left;
    let top = rect.bottom + 8;
    if (left + w > viewW - pad) left = viewW - w - pad;
    if (left < pad) left = pad;
    if (top + h > viewH - pad) top = rect.top - h - 8;
    if (top < pad) top = pad;
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
  }

  function schedulePosition() {
    if (pop.hidden || !anchor) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(positionNear);
  }

  function open(targetRow, stepIndex = 0) {
    stopRecord({keep: false});
    if (anchor && anchor !== targetRow.querySelector(".hotkey-field")) {
      anchor.setAttribute("aria-expanded", "false");
    }
    row = targetRow;
    editStepIndex = stepIndex | 0;
    anchor = row.querySelector(".hotkey-field");
    const binding = getRowBinding(row);
    pickMod = binding.type === 0 ? binding.mod : 0;
    const found = KEY_CATALOG.findIndex(([, entries]) =>
      entries.some(([, type, code]) => type === binding.type && code === binding.code));
    catIndex = found >= 0 ? found : 0;
    renderKeys();
    pop.hidden = false;
    positionNear();
    anchor?.setAttribute("aria-expanded", "true");
  }

  function close({commit = false} = {}) {
    if (pop.hidden && !row) return;
    const pending = commit && row ? row : null;
    cancelAnimationFrame(raf);
    pop.hidden = true;
    anchor?.setAttribute("aria-expanded", "false");
    row = null;
    anchor = null;
    if (pending) commitSettingsServer();
  }

  cats.addEventListener("click", event => {
    const btn = event.target.closest("[data-cat]");
    if (!btn) return;
    catIndex = Number(btn.dataset.cat);
    if (KEY_CATALOG[catIndex][0] === "Media" || KEY_CATALOG[catIndex][0] === "Mouse") pickMod = 0;
    renderKeys();
    schedulePosition();
  });

  pop.querySelector(".hotkey-mod-row").addEventListener("click", event => {
    const btn = event.target.closest("[data-pick-mod]");
    if (!btn || !row) return;
    const bit = Number(btn.dataset.pickMod);
    pickMod ^= bit;
    syncModChips();
    const binding = getRowBinding(row);
    if (binding.type === 0 && binding.code) {
      setRowBinding(row, {...binding, mod: pickMod});
      log(`Set ${rowLabel(row)}: ${shortcutText(getRowBinding(row))}`);
      commitSettingsServer();
    }
  });

  keys.addEventListener("click", event => {
    const btn = event.target.closest(".hotkey-key");
    if (!btn || !row) return;
    const type = Number(btn.dataset.type);
    const code = Number(btn.dataset.code);
    setRowBinding(row, {type, mod: type === 0 ? pickMod : 0, code});
    log(`Set ${rowLabel(row)}: ${shortcutText(getRowBinding(row))}`);
    commitSettingsServer();
    close();
  });

  pop.querySelector("[data-close-hotkey]").addEventListener("click", () => close({commit: true}));

  document.addEventListener("pointerdown", event => {
    if (pop.hidden) return;
    if (pop.contains(event.target)) return;
    const field = event.target.closest(".hotkey-field");
    // Same field: keep open for the following click. Other field/outside: close + persist mods.
    if (field && field === anchor) return;
    close({commit: true});
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !pop.hidden) {
      event.preventDefault();
      close({commit: true});
    }
  });

  window.addEventListener("resize", schedulePosition);
  document.addEventListener("scroll", schedulePosition, true);

  return {open, close, isOpen: () => !pop.hidden};
})();

let recordTarget = null;
let recordPendingMod = 0;
let recordIdleTimer = null;

function stopRecord({keep = true} = {}) {
  clearTimeout(recordIdleTimer);
  recordIdleTimer = null;
  if (recordTarget) {
    recordTarget.classList.remove("is-recording");
    const btn = recordTarget.querySelector(".record");
    btn.textContent = "Record";
    btn.classList.remove("is-recording");
    if (keep) {
      const label = shortcutText(getRowBinding(recordTarget));
      if (label !== "No action") log(`Recorded ${label}.`);
      commitSettingsServer();
    }
    paintHotkeyField(recordTarget);
  }
  recordTarget = null;
  recordPendingMod = 0;
}

function startRecord(row) {
  hotkeyPicker.close({commit: true});
  if (recordTarget === row) {
    stopRecord({keep: true});
    return;
  }
  stopRecord({keep: false});
  recordTarget = row;
  recordPendingMod = 0;
  row.classList.add("is-recording");
  const btn = row.querySelector(".record");
  btn.textContent = "Stop";
  btn.classList.add("is-recording");
  paintHotkeyField(row, {recording: true});
  log("Recording… press shortcut (mods one-by-one ok). Esc cancels.");
}

function eventToBinding(event, stickyMod) {
  const modBit = MOD_EVENT[event.key];
  if (modBit != null) return {kind: "mod", mod: modBit};
  const code = CODE_TO_EVENT[event.code];
  if (code == null) return null;
  const media = MEDIA_CODES.has(code) || event.code.startsWith("Audio") || event.code.startsWith("Media") || event.code.startsWith("Volume");
  if (media) return {kind: "key", type: 1, mod: 0, code};
  let mod = stickyMod;
  if (event.ctrlKey) mod |= MOD_CTRL;
  if (event.shiftKey) mod |= MOD_SHIFT;
  if (event.altKey) mod |= MOD_ALT;
  if (event.metaKey) mod |= MOD_GUI;
  return {kind: "key", type: 0, mod, code};
}

document.addEventListener("keydown", event => {
  if (!recordTarget) return;
  if (event.key === "Escape") {
    event.preventDefault();
    stopRecord({keep: false});
    log("Record cancelled.");
    return;
  }
  const mapped = eventToBinding(event, recordPendingMod);
  if (!mapped) return;
  event.preventDefault();
  event.stopPropagation();
  if (mapped.kind === "mod") {
    recordPendingMod |= mapped.mod;
    paintHotkeyField(recordTarget, {pendingMod: recordPendingMod, recording: true});
    clearTimeout(recordIdleTimer);
    return;
  }
  setRowBinding(recordTarget, mapped);
  recordPendingMod = 0;
  clearTimeout(recordIdleTimer);
  recordIdleTimer = setTimeout(() => stopRecord({keep: true}), 400);
}, true);

function cloneKeys(keys, fallback) {
  return (keys || fallback).map((key, i) => {
    const fb = fallback[i] || {mod: 0, type: 0, code: 0};
    if (key?.steps || fb.steps) return normalizeKey(key || fb);
    return {
      mod: key?.mod ?? fb.mod,
      type: key?.type ?? fb.type,
      code: key?.code ?? fb.code,
    };
  });
}

function cloneKeysL0(keys, fallback) {
  return (keys || fallback).map((key, i) => normalizeKey(key || fallback[i]));
}

function keysEmpty(keys) {
  return !(keys || []).some(k => {
    if (Array.isArray(k?.steps)) return k.steps.some(s => (s?.code ?? 0) !== 0);
    return (k?.code ?? 0) !== 0;
  });
}

function serializeL0Key(k) {
  const n = normalizeKey(k);
  return {
    mod: n.mod | 0,
    type: n.type | 0,
    code: n.code | 0,
    steps: n.steps.map(s => ({mod: s.mod | 0, type: s.type | 0, code: s.code | 0})),
  };
}

function settingsSnapshot() {
  storeTapKeys();
  storeHoldKeys();
  const keysFn = [1, 2, 3, 4].map(i =>
    layerKeys[i].map(k => ({mod: k.mod | 0, type: k.type | 0, code: k.code | 0}))
  );
  return {
    v: 3,
    keys_l0: layerKeys[0].map(serializeL0Key),
    keys_fn: keysFn,
    keys_l1: keysFn[0],
    lt_mask: ltMask & 0x0f,
    hold_entries: holdEntries.map(e => ({fn: e.fn | 0, target: e.target | 0})),
    colors: colors.map(c => c.map(n => n | 0)),
    brightness: brightness.map(n => n | 0),
    pulse: pulse.map(Boolean),
    auto_off_enabled: !!autoOffEnabled,
    auto_off_steps: autoOffSteps | 0,
    cpulse: cpulse.map(Boolean),
    cpulse_period: cpulsePeriod.map(n => n | 0),
    cpulse_divisor: cpulseDivisor.map(n => n | 0),
  };
}

function applyFnLayers(keysFn, legacyL1) {
  const source = Array.isArray(keysFn) && keysFn.length === 4
    ? keysFn
    : [legacyL1, legacyL1, legacyL1, legacyL1];
  for (let fn = 0; fn < LT_CAPABLE; fn++) {
    layerKeys[1 + fn] = cloneKeys(source[fn] || source[0] || DEFAULT_KEYS_FN, DEFAULT_KEYS_FN);
  }
}

function applySettingsSnapshot(data) {
  if (!data) return false;
  layerKeys[0] = cloneKeysL0(data.keys_l0 || data.keys, DEFAULT_KEYS);
  applyFnLayers(data.keys_fn, data.keys_l1);
  ltMask = typeof data.lt_mask === "number" ? data.lt_mask & 0x0f : 0;
  const holds = data.hold_entries || data.holdEntries;
  if (Array.isArray(holds) && holds.length) {
    holdEntries = dedupeHoldEntries(holds);
  } else {
    holdEntries = holdEntriesFromMask(ltMask);
  }
  if (Array.isArray(data.colors) && data.colors.length === 3) {
    colors = data.colors.map(c => c.map(n => Math.max(0, Math.min(255, n | 0))));
  }
  if (Array.isArray(data.brightness) && data.brightness.length === 3) {
    brightness = data.brightness.map(n => Math.max(0, Math.min(255, n | 0)));
  }
  if (Array.isArray(data.pulse) && data.pulse.length === 3) {
    pulse = data.pulse.map(Boolean);
  }
  if (typeof data.auto_off_enabled === "boolean") {
    autoOffEnabled = data.auto_off_enabled;
  }
  if (typeof data.auto_off_steps === "number") {
    autoOffSteps = Math.max(0, Math.min(AUTO_OFF_MAX_INDEX, data.auto_off_steps | 0));
  }
  if (Array.isArray(data.cpulse) && data.cpulse.length === 3) {
    cpulse = data.cpulse.map(Boolean);
  }
  if (Array.isArray(data.cpulse_period) && data.cpulse_period.length === 3) {
    cpulsePeriod = data.cpulse_period.map(n => Math.max(500, Math.min(3000, n | 0)));
  }
  if (Array.isArray(data.cpulse_divisor) && data.cpulse_divisor.length === 3) {
    cpulseDivisor = data.cpulse_divisor.map(n => Math.max(2, Math.min(255, n | 0)));
  }
  return !keysEmpty(layerKeys[0]);
}

async function persistSettingsServer() {
  const snapshot = settingsSnapshot();
  await post("/api/settings", snapshot);
  return snapshot;
}

function queueSettingsSave() {
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => {
    persistSettingsServer().catch(e => log(`Settings save: ${e.message}`));
  }, 350);
}

function commitSettingsServer() {
  storeTapKeys();
  storeHoldKeys();
  queueSettingsSave();
}

function wireHotkeyRow(row, onReset) {
  const field = row.querySelector(".hotkey-field");
  const openPicker = (step = 0) => {
    if (recordTarget === row) return;
    hotkeyPicker.open(row, step);
  };
  field.addEventListener("click", event => {
    const clear = event.target.closest("[data-clear-step]");
    if (clear) {
      event.preventDefault();
      event.stopPropagation();
      if (recordTarget === row) stopRecord({keep: false});
      hotkeyPicker.close();
      const idx = Number(clear.dataset.clearStep);
      const steps = getRowSteps(row);
      steps.splice(idx, 1);
      setRowSteps(row, steps);
      commitSettingsServer();
      log(`Cleared ${rowLabel(row)} step ${idx + 1}.`);
      return;
    }
    const add = event.target.closest(".hotkey-add-step");
    if (add) {
      event.preventDefault();
      event.stopPropagation();
      openPicker(getRowSteps(row).length);
      return;
    }
    const stepEl = event.target.closest("[data-step]");
    openPicker(stepEl ? Number(stepEl.dataset.step) : 0);
  });
  field.addEventListener("keydown", event => {
    if (event.target.closest(".hotkey-clear") || event.target.closest(".hotkey-add-step")) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openPicker(0);
  });
  row.querySelector(".record").addEventListener("click", () => {
    editStepIndex = 0;
    startRecord(row);
  });
  row.querySelector(".clear-hotkey")?.addEventListener("click", onReset);
}

function storeTapKeys() {
  const rows = $$("#keyRows .key-row");
  if (!rows.length) return;
  layerKeys[0] = rows.map(row => {
    const steps = getRowSteps(row);
    const base = steps[0] || EMPTY_BINDING;
    return normalizeKey({...base, steps});
  });
}

function storeHoldKeys() {
  let mask = 0;
  const entries = [];
  const seen = new Set();
  $$("#holdRows .hold-row").forEach(row => {
    const fn = Number(row.querySelector(".fn-select").value);
    const target = Number(row.querySelector(".target-select").value);
    if (Number.isNaN(fn) || fn < 0 || fn >= LT_CAPABLE) return;
    if (Number.isNaN(target) || target < 0 || target >= controls.length) return;
    const key = `${fn}:${target}`;
    if (seen.has(key)) return; // same Fn+target only once
    seen.add(key);
    layerKeys[1 + fn][target] = getRowBinding(row);
    mask |= (1 << fn);
    entries.push({fn, target});
  });
  holdEntries = entries;
  ltMask = mask;
}

function fnSelectHtml(selected) {
  return controls.slice(0, LT_CAPABLE).map((name, i) =>
    `<option value="${i}"${i === selected ? " selected" : ""}>${name}</option>`).join("");
}

/** Targets already used for this Fn (L1 map is per-Fn — same target OK on other Fn). */
function usedTargetsForFn(fn, exceptIndex = -1) {
  const used = new Set();
  holdEntries.forEach((e, i) => {
    if (i === exceptIndex) return;
    if (e.fn === fn) used.add(e.target);
  });
  return used;
}

function targetSelectHtml(selected, disabledTargets = new Set()) {
  return controls.map((name, i) => {
    const disabled = disabledTargets.has(i) && i !== selected ? " disabled" : "";
    return `<option value="${i}"${i === selected ? " selected" : ""}${disabled}>${name}</option>`;
  }).join("");
}

function dedupeHoldEntries(entries) {
  const seen = new Set();
  const out = [];
  for (const e of entries || []) {
    const fn = Number(e.fn);
    const target = Number(e.target);
    if (Number.isNaN(fn) || fn < 0 || fn >= LT_CAPABLE) continue;
    if (Number.isNaN(target) || target < 0 || target >= controls.length) continue;
    const key = `${fn}:${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({fn, target});
  }
  return out;
}

function nextFreeHoldPair() {
  for (let fn = 0; fn < LT_CAPABLE; fn++) {
    const used = usedTargetsForFn(fn);
    for (let target = 0; target < controls.length; target++) {
      if (target === fn) continue;
      if (!used.has(target)) return {fn, target};
    }
  }
  return null;
}

function createTapRows() {
  const root = $("#keyRows");
  root.textContent = "";
  controls.forEach((name, i) => {
    const row = document.createElement("div");
    row.className = "key-row tap-row";
    row.innerHTML = `
      <div class="key-lead">
        <span class="key-role" aria-hidden="true">Tap</span>
        <span class="key-name">${name}</span>
      </div>
      <div class="hotkey-wrap">
        <div class="hotkey-field" role="button" tabindex="0" aria-haspopup="dialog" aria-expanded="false"></div>
      </div>
      <button type="button" class="ghost record" aria-label="Record tap for ${name}">Record</button>
      <button type="button" class="ghost clear-hotkey" aria-label="Reset tap for ${name}">Reset</button>`;
    setRowSteps(row, (layerKeys[0][i] || DEFAULT_KEYS[i]).steps?.length
      ? (layerKeys[0][i] || DEFAULT_KEYS[i]).steps
      : [layerKeys[0][i] || DEFAULT_KEYS[i]]);
    wireHotkeyRow(row, () => {
      stopRecord({keep: false});
      hotkeyPicker.close();
      setRowSteps(row, (DEFAULT_KEYS[i].steps?.length ? DEFAULT_KEYS[i].steps : [DEFAULT_KEYS[i]]));
      commitSettingsServer();
      log(`Reset tap ${name}.`);
    });
    root.append(row);
  });
}

function createHoldRows() {
  const root = $("#holdRows");
  if (!root) return;
  // Rebuild destroys row nodes — drop picker/record targets first or edits hit detached DOM.
  if (hotkeyPicker.isOpen()) hotkeyPicker.close({commit: true});
  if (recordTarget?.closest?.("#holdRows")) stopRecord({keep: false});
  holdEntries = dedupeHoldEntries(holdEntries);
  root.textContent = "";
  if (!holdEntries.length) {
    root.textContent = "";
    return;
  }
  holdEntries.forEach((entry, rowIndex) => {
    const fn = entry.fn;
    const target = entry.target;
    const row = document.createElement("div");
    row.className = "key-row hold-row";
    row.innerHTML = `
      <div class="key-lead">
        <div class="hold-slot">
          <span class="key-role" aria-hidden="true">Fn</span>
          <select class="fn-select" aria-label="Fn key">${fnSelectHtml(fn)}</select>
        </div>
        <span class="hold-op" aria-hidden="true">+</span>
        <div class="hold-slot">
          <span class="key-role" aria-hidden="true">Tap</span>
          <select class="target-select" aria-label="Key while Fn held">${targetSelectHtml(target, usedTargetsForFn(fn, rowIndex))}</select>
        </div>
      </div>
      <div class="hotkey-wrap">
        <div class="hotkey-field" role="button" tabindex="0" aria-haspopup="dialog" aria-expanded="false"></div>
      </div>
      <button type="button" class="ghost record" aria-label="Record hold action">Record</button>
      <button type="button" class="ghost remove-hold" aria-label="Remove hold mapping">Remove</button>`;
    setRowBinding(row, layerKeys[1 + fn][target] || DEFAULT_KEYS_FN[target]);
    wireHotkeyRow(row, null);
    row.querySelector(".fn-select").addEventListener("change", () => {
      const nextFn = Number(row.querySelector(".fn-select").value);
      const curTarget = Number(row.querySelector(".target-select").value);
      if (usedTargetsForFn(nextFn, rowIndex).has(curTarget)) {
        const free = controls.findIndex((_, t) => t !== nextFn && !usedTargetsForFn(nextFn, rowIndex).has(t));
        if (free < 0) {
          log(`No free target for Fn ${controls[nextFn]}.`);
          row.querySelector(".fn-select").value = String(holdEntries[rowIndex].fn);
          return;
        }
        row.querySelector(".target-select").value = String(free);
        holdEntries[rowIndex] = {fn: nextFn, target: free};
        setRowBinding(row, layerKeys[1 + nextFn][free] || DEFAULT_KEYS_FN[free]);
      } else {
        holdEntries[rowIndex] = {fn: nextFn, target: curTarget};
        setRowBinding(row, layerKeys[1 + nextFn][curTarget] || DEFAULT_KEYS_FN[curTarget]);
      }
      storeHoldKeys();
      createHoldRows();
      commitSettingsServer();
    });
    row.querySelector(".target-select").addEventListener("change", () => {
      const nextFn = Number(row.querySelector(".fn-select").value);
      const prev = holdEntries[rowIndex];
      const t = Number(row.querySelector(".target-select").value);
      if (usedTargetsForFn(nextFn, rowIndex).has(t)) {
        log(`Target ${controls[t]} already used for this Fn.`);
        row.querySelector(".target-select").value = String(prev.target);
        return;
      }
      holdEntries[rowIndex] = {fn: nextFn, target: t};
      setRowBinding(row, layerKeys[1 + nextFn][t] || DEFAULT_KEYS_FN[t]);
      storeHoldKeys();
      createHoldRows();
      commitSettingsServer();
    });
    row.querySelector(".remove-hold").addEventListener("click", () => {
      stopRecord({keep: false});
      hotkeyPicker.close();
      storeHoldKeys();
      holdEntries = holdEntries.filter((_, i) => i !== rowIndex);
      createHoldRows();
      commitSettingsServer();
      log(`Removed hold: Fn ${controls[fn]} → ${controls[target]}.`);
    });
    root.append(row);
  });
}

function renderKeymap() {
  hotkeyPicker.close({commit: true});
  stopRecord({keep: false});
  createTapRows();
  createHoldRows();
}

function createKeyRows() {
  renderKeymap();
}

function addHoldRow() {
  storeHoldKeys();
  const pair = nextFreeHoldPair();
  if (!pair) {
    log("No free Fn/target pair left.");
    return;
  }
  holdEntries.push(pair);
  createHoldRows();
  commitSettingsServer();
  log(`Added hold: Fn ${controls[pair.fn]} → ${controls[pair.target]}.`);
}

function holdEntriesFromMask(mask) {
  const entries = [];
  for (let i = 0; i < LT_CAPABLE; i++) {
    if (!(mask & (1 << i))) continue;
    const target = i === 0 ? 1 : 0;
    entries.push({fn: i, target});
  }
  return dedupeHoldEntries(entries);
}

function bindingEqual(a, b) {
  const as = normalizeKey(a).steps;
  const bs = normalizeKey(b).steps;
  if (as.length !== bs.length) {
    // legacy single vs steps
    const aa = as[0] || {mod: a?.mod | 0, type: a?.type | 0, code: a?.code | 0};
    const bb = bs[0] || {mod: b?.mod | 0, type: b?.type | 0, code: b?.code | 0};
    if (as.length <= 1 && bs.length <= 1) {
      return (aa.mod | 0) === (bb.mod | 0) && (aa.type | 0) === (bb.type | 0) && (aa.code | 0) === (bb.code | 0);
    }
    return false;
  }
  return as.every((s, i) =>
    (s.mod | 0) === (bs[i].mod | 0) && (s.type | 0) === (bs[i].type | 0) && (s.code | 0) === (bs[i].code | 0));
}

function layerEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((key, i) => bindingEqual(key, b[i]));
}

/** Rebuild hold rows from device: per-Fn maps that differ from L0. */
function holdEntriesFromDevice(mask, keysL0, keysFn) {
  const entries = [];
  for (let fn = 0; fn < LT_CAPABLE; fn++) {
    if (!(mask & (1 << fn))) continue;
    const fnMap = keysFn[fn] || keysFn[0] || DEFAULT_KEYS_FN;
    let added = false;
    for (let t = 0; t < controls.length; t++) {
      if (!bindingEqual(fnMap[t], keysL0[t])) {
        entries.push({fn, target: t});
        added = true;
      }
    }
    if (!added) entries.push({fn, target: fn === 0 ? 1 : 0});
  }
  return dedupeHoldEntries(entries);
}

/** Lighting state: device is source of truth (it owns colors/brightness + fades). */
function applyDeviceLighting(config, preserveInactiveCpulse = false) {
  if (Array.isArray(config.colors) && config.colors.length === 3) {
    colors = config.colors.map(c => c.map(n => Math.max(0, Math.min(255, n | 0))));
  }
  if (Array.isArray(config.brightness) && config.brightness.length === 3) {
    brightness = config.brightness.map(n => Math.max(0, Math.min(255, n | 0)));
  }
  if (Array.isArray(config.pulse) && config.pulse.length === 3) {
    pulse = config.pulse.map(Boolean);
  }
  if (typeof config.auto_off_enabled === "boolean") {
    autoOffEnabled = config.auto_off_enabled;
  }
  if (typeof config.auto_off_steps === "number") {
    autoOffSteps = Math.max(0, Math.min(AUTO_OFF_MAX_INDEX, config.auto_off_steps | 0));
  }
  if (Array.isArray(config.cpulse) && config.cpulse.length === 3) {
    cpulse = config.cpulse.map(Boolean);
  }
  if (Array.isArray(config.cpulse_period) && config.cpulse_period.length === 3) {
    config.cpulse_period.forEach((n, i) => {
      if (!preserveInactiveCpulse || cpulse[i])
        cpulsePeriod[i] = Math.max(500, Math.min(3000, n | 0));
    });
  }
  if (Array.isArray(config.cpulse_divisor) && config.cpulse_divisor.length === 3) {
    config.cpulse_divisor.forEach((n, i) => {
      if (!preserveInactiveCpulse || cpulse[i])
        cpulseDivisor[i] = Math.max(2, Math.min(255, n | 0));
    });
  }
}

function applyDeviceKeymap(config) {
  layerKeys[0] = cloneKeysL0(config.keys_l0 || config.keys, DEFAULT_KEYS);
  applyFnLayers(config.keys_fn, config.keys_l1);
  ltMask = typeof config.lt_mask === "number" ? config.lt_mask & 0x0f : 0;
  const keysFn = [1, 2, 3, 4].map(i => layerKeys[i]);
  holdEntries = holdEntriesFromDevice(ltMask, layerKeys[0], keysFn);
  applyDeviceLighting(config);
}

document.addEventListener("click", event => {
  if (event.target.closest("#addHold")) addHoldRow();
});

async function refresh() {
  const status = $("#status");
  try {
    const info = await api("/api/status");
    status.className = `status ${info.connected ? "connected" : "offline"}`;
    if (info.connected && info.firmware != null) {
      status.lastElementChild.textContent = `Connected · FW ${info.firmware}`;
    } else {
      status.lastElementChild.textContent = info.connected ? "Connected" : "Not connected";
    }

    const settings = await api("/api/settings");
    if (settings.exists && applySettingsSnapshot(settings)) {
      renderKeymap();
      paintPreview();
      log(`Settings from server · L0 [${layerKeys[0].map(k => k.code).join(", ")}] · LT ${ltMask}`);
      if (info.connected) {
        try {
          const config = await api("/api/config");
          // Lighting: device owns it — sync UI from device even when settings draft exists
          applyDeviceLighting(config, true);
          paintPreview();
          paintAutoOff();
          const deviceL0 = cloneKeysL0(config.keys_l0 || config.keys, DEFAULT_KEYS);
          const deviceFn = Array.isArray(config.keys_fn) && config.keys_fn.length === 4
            ? config.keys_fn.map(layer => cloneKeys(layer, DEFAULT_KEYS_FN))
            : null;
          const deviceMask = typeof config.lt_mask === "number" ? config.lt_mask & 0x0f : 0;
          let diverged = !layerEqual(layerKeys[0], deviceL0) || (ltMask & 0x0f) !== deviceMask;
          if (deviceFn) {
            for (let fn = 0; fn < LT_CAPABLE; fn++) {
              if (!layerEqual(layerKeys[1 + fn], deviceFn[fn])) diverged = true;
            }
          }
          if (diverged) {
            log(`Device connected · protocol ${config.protocol} · draft differs — Save to write EEPROM`);
          } else {
            log(`Device connected · protocol ${config.protocol}`);
          }
        } catch (e) {
          log(`Device: ${e.message}`);
        }
      }
    } else if (info.connected) {
      const config = await api("/api/config");
      applyDeviceKeymap(config);
      renderKeymap();
      paintPreview();
      await persistSettingsServer();
      log(`Device connected · protocol ${config.protocol} · seeded server settings`);
    } else {
      renderKeymap();
      paintPreview();
      log("Not connected · no server settings yet");
    }
  } catch (error) {
    status.className = "status offline";
    status.lastElementChild.textContent = "Not connected";
    log(error.message);
  }
  try {
    const fw = await api("/api/firmware");
    setFirmwareInfo(fw);
  } catch (error) { $("#firmwareInfo").textContent = error.message; }
}

function setFirmwareInfo(fw) {
  const ver = fw.version ? `v${fw.version}` : "v?";
  $("#firmwareInfo").textContent =
    `${ver} · ${fw.size} bytes · SHA-256 ${fw.sha256.slice(0, 16)}…`;
}

async function queryDeviceFirmware() {
  const el = $("#deviceFwInfo");
  try {
    const ver = await api("/api/version");
    el.textContent = `Device FW: v${ver.firmware}`;
    el.classList.remove("muted");
    log(`Device reports firmware v${ver.firmware}`);
  } catch (e) {
    el.textContent = `Device FW: ${e.message}`;
    el.classList.add("muted");
    log(`Ask device version: ${e.message}`);
  }
}

async function loadKeymapFromDevice() {
  try {
    const config = await api("/api/config");
    applyDeviceKeymap(config);
    renderKeymap();
    paintPreview();
    await persistSettingsServer();
    log(`Loaded from device → server · L0 [${layerKeys[0].map(k => k.code).join(", ")}] · LT ${ltMask}`);
  } catch (e) {
    log(`Load from device: ${e.message}`);
  }
}

const colorPicker = (() => {
  const pop = $("#colorPopover");
  const title = $("#colorPopoverTitle");
  const sv = pop.querySelector("[data-sv]");
  const cursor = pop.querySelector(".sv-cursor");
  const hue = pop.querySelector("[data-hue]");
  const hexInput = pop.querySelector("[data-hex]");
  const preview = pop.querySelector(".color-preview-swatch");
  const quick = pop.querySelector(".popover-quick");
  let led = null;
  let hsv = { h: 220, s: 1, v: 1 };
  let dragging = false;

  QUICK_COLORS.forEach(hex => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quick-swatch";
    btn.style.setProperty("--swatch", hex);
    btn.dataset.popoverQuick = hex;
    btn.title = hex;
    btn.setAttribute("aria-label", `Set color ${hex}`);
    quick.append(btn);
  });

  function applyColor(rgb, { send = true, paint = true } = {}) {
    if (led == null) return;
    colors[led] = rgb.map(n => Math.max(0, Math.min(255, n | 0)));
    if (paint) paintPreview();
    else syncChrome();
    if (send) queueRgb({ led });
  }

  function syncChrome() {
    const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
    const hex = rgbToHex(rgb);
    pop.style.setProperty("--picker-color", hex);
    pop.style.setProperty("--picker-hue", hueCss(hsv.h));
    cursor.style.left = `${hsv.s * 100}%`;
    cursor.style.top = `${(1 - hsv.v) * 100}%`;
    hue.value = String(Math.round(hsv.h));
    if (document.activeElement !== hexInput) hexInput.value = hex.slice(1).toUpperCase();
    preview.style.background = hex;
    sv.setAttribute("aria-valuetext", hex.toUpperCase());
    quick.querySelectorAll("[data-popover-quick]").forEach(btn => {
      btn.classList.toggle("is-active", btn.dataset.popoverQuick.toLowerCase() === hex.toLowerCase());
    });
  }

  function setFromRgb(rgb, opts) {
    hsv = rgbToHsv(rgb);
    if (hsv.s === 0 && hsv.v === 0) hsv.h = Number(hue.value) || hsv.h;
    syncChrome();
    applyColor(rgb, opts);
  }

  function commitHsv(opts) {
    applyColor(hsvToRgb(hsv.h, hsv.s, hsv.v), opts);
    syncChrome();
  }

  function positionNear(anchor) {
    const rect = anchor.getBoundingClientRect();
    const pad = 10;
    pop.hidden = false;
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    let left = rect.left;
    let top = rect.bottom + 8;
    if (left + w > window.innerWidth - pad) left = window.innerWidth - w - pad;
    if (left < pad) left = pad;
    if (top + h > window.innerHeight - pad) top = rect.top - h - 8;
    if (top < pad) top = pad;
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
  }

  function setOpenState(open) {
    $$(".light-swatch").forEach(el => el.classList.remove("is-open"));
    $$("[data-picker]").forEach(btn => btn.setAttribute("aria-expanded", "false"));
    if (open && led != null) {
      const trigger = $(`[data-picker="${led}"]`);
      trigger?.setAttribute("aria-expanded", "true");
      trigger?.closest(".light-swatch")?.classList.add("is-open");
    }
  }

  function open(index, anchor) {
    if (led === index && !pop.hidden) {
      close();
      return;
    }
    led = index;
    title.textContent = `Key ${index + 1} color`;
    hsv = rgbToHsv(colors[index]);
    syncChrome();
    positionNear(anchor);
    setOpenState(true);
    hexInput.focus({ preventScroll: true });
    hexInput.select();
  }

  function close() {
    if (pop.hidden) return;
    pop.hidden = true;
    setOpenState(false);
    const trigger = led != null ? $(`[data-picker="${led}"]`) : null;
    led = null;
    trigger?.focus({ preventScroll: true });
  }

  function pickSv(clientX, clientY) {
    const rect = sv.getBoundingClientRect();
    hsv.s = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    hsv.v = Math.min(1, Math.max(0, 1 - (clientY - rect.top) / rect.height));
    commitHsv();
  }

  function syncFromState() {
    if (pop.hidden || led == null) return;
    hsv = rgbToHsv(colors[led]);
    syncChrome();
  }

  sv.addEventListener("pointerdown", event => {
    event.preventDefault();
    dragging = true;
    sv.setPointerCapture(event.pointerId);
    pickSv(event.clientX, event.clientY);
  });
  sv.addEventListener("pointermove", event => {
    if (!dragging) return;
    pickSv(event.clientX, event.clientY);
  });
  sv.addEventListener("pointerup", () => { dragging = false; });
  sv.addEventListener("pointercancel", () => { dragging = false; });

  hue.addEventListener("input", () => {
    hsv.h = Number(hue.value);
    commitHsv();
  });

  hexInput.addEventListener("input", () => {
    const raw = hexInput.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
    hexInput.value = raw.toUpperCase();
    if (raw.length !== 6) return;
    setFromRgb(hexToRgb(`#${raw}`));
  });

  hexInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      close();
    }
  });

  pop.querySelector("[data-close-picker]").addEventListener("click", close);

  pop.querySelector("[data-native-picker]").addEventListener("click", () => {
    if (led == null) return;
    const input = $(`[data-color="${led}"]`);
    input?.showPicker?.() || input?.click();
  });

  quick.addEventListener("click", event => {
    const btn = event.target.closest("[data-popover-quick]");
    if (!btn) return;
    setFromRgb(hexToRgb(btn.dataset.popoverQuick));
  });

  document.addEventListener("pointerdown", event => {
    if (pop.hidden) return;
    if (pop.contains(event.target)) return;
    if (event.target.closest("[data-picker]")) return;
    if (event.target.closest("[data-hex-chip]")) return;
    close();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !pop.hidden) {
      event.preventDefault();
      close();
    }
  });

  window.addEventListener("resize", () => {
    if (pop.hidden || led == null) return;
    const anchor = $(`[data-picker="${led}"]`);
    if (anchor) positionNear(anchor);
  });

  return { open, close, syncFromState };
})();

$$('[data-color]').forEach(input => input.addEventListener("input", () => {
  colors[Number(input.dataset.color)] = hexToRgb(input.value);
  paintPreview();
  colorPicker.syncFromState();
  queueRgb({ led: Number(input.dataset.color) });
}));

$$('[data-brightness]').forEach(input => input.addEventListener("input", () => {
  brightness[Number(input.dataset.brightness)] = Number(input.value);
  paintPreview();
  queueRgb({ led: Number(input.dataset.brightness), brightness: true });
}));

$$('[data-cpulse-period]').forEach(input => input.addEventListener("input", () => {
  const led = Number(input.dataset.cpulsePeriod);
  cpulsePeriod[led] = Math.max(500, Math.min(3000, Number(input.value) | 0));
  input.value = cpulsePeriod[led];
  if (cpulse[led])
    queueRgb({ applyCpulse: true, cpulseLed: led, skipLeds: true });
  queueSettingsSave();
}));

$$('[data-cpulse-divisor]').forEach(input => input.addEventListener("input", () => {
  const led = Number(input.dataset.cpulseDivisor);
  cpulseDivisor[led] = Math.max(2, Math.min(255, Number(input.value) | 0));
  input.value = cpulseDivisor[led];
  if (cpulse[led])
    queueRgb({ applyCpulse: true, cpulseLed: led, skipLeds: true });
  queueSettingsSave();
}));

$("#autoOffToggle")?.addEventListener("click", () => {
  autoOffEnabled = !autoOffEnabled;
  paintAutoOff();
  queueRgb({ applyAutoOff: true, skipLeds: true });
  queueSettingsSave();
});

$("#autoOffSteps")?.addEventListener("input", () => {
  autoOffSteps = Math.max(0, Math.min(AUTO_OFF_MAX_INDEX, Number($("#autoOffSteps").value) | 0));
  paintAutoOff();
  queueRgb({ applyAutoOff: true, skipLeds: true });
  queueSettingsSave();
});

$(".light-rows")?.addEventListener("click", event => {
  const picker = event.target.closest("[data-picker]");
  if (picker) {
    colorPicker.open(Number(picker.dataset.picker), picker);
    return;
  }
  const chip = event.target.closest("[data-hex-chip]");
  if (chip) {
    const index = Number(chip.dataset.hexChip);
    const trigger = $(`[data-picker="${index}"]`);
    if (trigger) colorPicker.open(index, trigger);
    return;
  }
  const pulseBtn = event.target.closest("[data-pulse]");
  if (pulseBtn) {
    const led = Number(pulseBtn.dataset.pulse);
    pulse[led] = !pulse[led];
    paintPreview();
    queueRgb({ applyPulse: true, skipLeds: true });
    return;
  }
  const cpulseBtn = event.target.closest("[data-cpulse]");
  if (cpulseBtn) {
    const led = Number(cpulseBtn.dataset.cpulse);
    cpulse[led] = !cpulse[led];
    paintPreview();
    queueRgb({ applyCpulse: true, cpulseLed: led, skipLeds: true });
    queueSettingsSave();
    return;
  }
  const btn = event.target.closest("[data-quick]");
  if (!btn) return;
  const led = Number(btn.closest(".light-row").dataset.led);
  colors[led] = hexToRgb(btn.dataset.quick);
  paintPreview();
  colorPicker.syncFromState();
  queueRgb({ led });
});

$("#lightsOff").addEventListener("click", () => {
  if (allLightsOff()) {
    colors = (lastColorsBeforeOff || [[0,80,255],[0,255,80],[255,20,0]]).map(c => c.slice());
    brightness = [255, 255, 255];
  } else {
    lastColorsBeforeOff = colors.map(c => c.slice());
    colors = [[0,0,0],[0,0,0],[0,0,0]];
    brightness = [0,0,0];
  }
  paintPreview();
  colorPicker.syncFromState();
  queueRgb();
});
$("#saveConfig").addEventListener("click", async () => {
  try {
    storeTapKeys();
    storeHoldKeys();
    const savedHolds = holdEntries.map(e => ({fn: e.fn, target: e.target}));
    const snapshot = settingsSnapshot();
    const tapCodes = snapshot.keys_l0.map(k => k.code);
    if (tapCodes.every(c => c === 0)) {
      log("Save aborted: tap keymap empty (all codes 0). Set keys, then Save.");
      return;
    }
    log(`Saving… L0 [${snapshot.keys_l0.map(k => k.code).join(", ")}] LT ${snapshot.lt_mask}`);
    await post("/api/settings", snapshot);
    await post("/api/keymap", {keys: snapshot.keys_l0, layer: 0, lt_mask: snapshot.lt_mask});
    for (let fn = 0; fn < LT_CAPABLE; fn++) {
      await post("/api/keymap", {keys: snapshot.keys_fn[fn], layer: 1 + fn});
    }
    await sendRgb();
    await post("/api/save", snapshot);
    const verify = await api("/api/config");
    const v0 = cloneKeysL0(verify.keys_l0 || verify.keys, DEFAULT_KEYS);
    const vMask = typeof verify.lt_mask === "number" ? verify.lt_mask & 0x0f : snapshot.lt_mask;
    applyFnLayers(verify.keys_fn, verify.keys_l1);
    let mismatch = !layerEqual(v0, snapshot.keys_l0) || vMask !== snapshot.lt_mask;
    if (Array.isArray(verify.keys_fn)) {
      for (let fn = 0; fn < LT_CAPABLE; fn++) {
        if (!layerEqual(layerKeys[1 + fn], snapshot.keys_fn[fn])) mismatch = true;
      }
    }
    if (mismatch) {
      log(`Save verify mismatch — device L0 [${v0.map(k => k.code).join(", ")}] LT ${vMask}`);
      // Keep what we wrote; don't let a bad/old-firmware read wipe mods or bleed Fn layers in UI.
      layerKeys[0] = cloneKeysL0(snapshot.keys_l0, DEFAULT_KEYS);
      applyFnLayers(snapshot.keys_fn, snapshot.keys_l1);
      ltMask = snapshot.lt_mask & 0x0f;
    } else {
      layerKeys[0] = v0;
      ltMask = vMask;
    }
    holdEntries = dedupeHoldEntries(savedHolds);
    if (!holdEntries.length && ltMask) {
      holdEntries = holdEntriesFromDevice(ltMask, layerKeys[0], [1, 2, 3, 4].map(i => layerKeys[i]));
    }
    renderKeymap();
    await persistSettingsServer();
    log(`Saved OK · server + device · L0 [${layerKeys[0].map(k => k.code).join(", ")}] · LT ${ltMask}`);
  } catch (e) { log(`Save: ${e.message}`); }
});
function openFirmwareCard() {
  const card = document.querySelector(".firmware-card");
  if (card) card.open = true;
}

$("#loadDeviceKeymap")?.addEventListener("click", () => loadKeymapFromDevice());
$("#buildFirmware").addEventListener("click", async event => { openFirmwareCard(); const b=event.currentTarget;b.disabled=true;log("Building firmware…");try{const r=await post("/api/build");setFirmwareInfo(r.firmware);log(r.log.trim());log(`Project firmware v${r.firmware.version}`);}catch(e){log(`Build failed: ${e.message}`);}finally{b.disabled=false;} });
$("#queryFwVersion").addEventListener("click", async event => { openFirmwareCard(); const b=event.currentTarget;b.disabled=true;try{await queryDeviceFirmware();}finally{b.disabled=false;} });
$("#firmwareFile").addEventListener("change", async event => { const file=event.target.files[0];if(!file)return;try{const r=await api("/api/firmware/upload",{method:"POST",headers:{"Content-Type":"application/octet-stream","X-Macropad-Client":"1"},body:await file.arrayBuffer()});uploaded=true;$("#uploadInfo").textContent=`${file.name} · ${r.size} bytes · ${r.sha256.slice(0,12)}…`;log("External firmware validated.");}catch(e){uploaded=false;log(`Upload: ${e.message}`);} });
$("#flashFirmware").addEventListener("click", () => { openFirmwareCard(); $("#flashDialog").showModal(); });
$("#confirmFlash").addEventListener("click", async event => { event.preventDefault();$("#flashDialog").close();openFirmwareCard();log("Flash started: do not unplug USB…");try{const r=await post("/api/flash",{confirm:true,uploaded,enter_bootloader:true});log(r.log.trim());log("Flash and verify completed.");if(r.wave)log("White/blue wave pulse played on device LEDs.");else log("Device back, but wave pulse skipped (no HID yet).");setTimeout(refresh,800);}catch(e){log(`Flash failed: ${e.message}`);} });
$("#clearLog").addEventListener("click", () => $("#log").textContent="Log cleared.");

(function initTheme() {
  const root = document.documentElement;
  const btn = $("#themeToggle");
  const meta = document.querySelector('meta[name="theme-color"]');
  const apply = (theme) => {
    root.dataset.theme = theme;
    localStorage.setItem("tastierino-theme", theme);
    btn.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    btn.title = theme === "dark" ? "Light mode" : "Dark mode";
    if (meta) meta.content = theme === "dark" ? "#000000" : "#f2f2f7";
  };
  apply(root.dataset.theme === "light" ? "light" : "dark");
  btn.addEventListener("click", () => apply(root.dataset.theme === "dark" ? "light" : "dark"));
})();

createKeyRows();
buildQuickColors();
paintPreview();
refresh();
setInterval(async () => { try { const s=await api("/api/status");const el=$("#status");el.className=`status ${s.connected?"connected":"offline"}`;el.lastElementChild.textContent=s.connected?(s.firmware!=null?`Connected · FW ${s.firmware}`:"Connected"):"Not connected";} catch {} },3000);
