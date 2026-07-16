const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const controls = ["Button 1", "Button 2", "Button 3", "Encoder click", "Encoder clockwise", "Encoder counterclockwise"];
const QUICK_COLORS = ["#ff0000","#ff8c00","#ffd400","#00ff50","#0050ff","#ffffff"];
let colors = [[0,80,255],[0,255,80],[255,20,0]];
let brightness = [160,160,160];
let pulse = [true, true, true];
let uploaded = false;
let rgbTimer;

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
}

async function sendRgb() {
  try {
    await post("/api/rgb", {colors, brightness, pulse});
  } catch (error) { log(`LED: ${error.message}`); }
}

function queueRgb() { clearTimeout(rgbTimer); rgbTimer = setTimeout(sendRgb, 80); }

const MOD_CTRL = 1, MOD_SHIFT = 2, MOD_ALT = 4, MOD_GUI = 8;
const DEFAULT_KEYS = [
  {mod:0,type:0,code:0x68},{mod:0,type:0,code:0x69},{mod:0,type:0,code:0x6a},
  {mod:0,type:1,code:0xe2},{mod:0,type:1,code:0xe9},{mod:0,type:1,code:0xea},
];

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
  return LABEL_BY_ACTION.get(`${type}:${code}`) || (type === 1 ? `Media 0x${code.toString(16)}` : `0x${code.toString(16)}`);
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
  if (code || type === 1) chips.push(keyLabel(type, code));
  return chips;
}

function shortcutText(binding, opts) {
  return shortcutChips(binding, opts).join(" ") || "Set shortcut…";
}

function getRowBinding(row) {
  return {
    type: Number(row.dataset.type) || 0,
    mod: Number(row.dataset.mod) || 0,
    code: Number(row.dataset.code) || 0,
  };
}

function paintHotkeyField(row, {pendingMod = 0, recording = false} = {}) {
  const binding = getRowBinding(row);
  const field = row.querySelector(".hotkey-field");
  const chips = recording
    ? shortcutChips({type: 0, mod: 0, code: 0}, {pendingMod})
    : shortcutChips(binding, {pendingMod});
  field.classList.toggle("is-empty", chips.length === 0);
  if (chips.length) {
    field.innerHTML = chips.map(c => `<span class="hotkey-chip">${c}</span>`).join("");
  } else {
    field.innerHTML = `<span class="hotkey-placeholder">${recording ? "Press keys…" : "Set shortcut…"}</span>`;
  }
  const spoken = recording
    ? (chips.join(" ") || "Recording")
    : shortcutText(binding, {pendingMod});
  field.setAttribute("aria-label", `${row.querySelector(".key-name").textContent}: ${spoken}`);
}

function setRowBinding(row, {type, mod, code}) {
  const next = {
    type: type | 0,
    mod: type === 1 ? 0 : (mod | 0),
    code: code | 0,
  };
  row.dataset.type = String(next.type);
  row.dataset.mod = String(next.mod);
  row.dataset.code = String(next.code);
  paintHotkeyField(row);
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
    const media = KEY_CATALOG[catIndex][0] === "Media";
    pop.querySelector(".hotkey-mod-row").hidden = media;
    pop.querySelectorAll("[data-pick-mod]").forEach(btn => {
      const bit = Number(btn.dataset.pickMod);
      const on = !media && !!(pickMod & bit);
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

  function open(targetRow) {
    stopRecord({keep: false});
    row = targetRow;
    anchor = row.querySelector(".hotkey-field");
    const binding = getRowBinding(row);
    pickMod = binding.type === 1 ? 0 : binding.mod;
    const found = KEY_CATALOG.findIndex(([, entries]) =>
      entries.some(([, type, code]) => type === binding.type && code === binding.code));
    catIndex = found >= 0 ? found : 0;
    renderKeys();
    pop.hidden = false;
    positionNear();
    anchor?.setAttribute("aria-expanded", "true");
  }

  function close() {
    if (pop.hidden && !row) return;
    cancelAnimationFrame(raf);
    pop.hidden = true;
    anchor?.setAttribute("aria-expanded", "false");
    row = null;
    anchor = null;
  }

  cats.addEventListener("click", event => {
    const btn = event.target.closest("[data-cat]");
    if (!btn) return;
    catIndex = Number(btn.dataset.cat);
    if (KEY_CATALOG[catIndex][0] === "Media") pickMod = 0;
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
      log(`Set ${row.querySelector(".key-name").textContent}: ${shortcutText(getRowBinding(row))}`);
    }
  });

  keys.addEventListener("click", event => {
    const btn = event.target.closest(".hotkey-key");
    if (!btn || !row) return;
    const type = Number(btn.dataset.type);
    const code = Number(btn.dataset.code);
    setRowBinding(row, {type, mod: type === 1 ? 0 : pickMod, code});
    log(`Set ${row.querySelector(".key-name").textContent}: ${shortcutText(getRowBinding(row))}`);
    close();
  });

  pop.querySelector("[data-close-hotkey]").addEventListener("click", close);

  document.addEventListener("pointerdown", event => {
    if (pop.hidden) return;
    if (pop.contains(event.target)) return;
    if (event.target.closest(".hotkey-field")) return;
    close();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !pop.hidden) {
      event.preventDefault();
      close();
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
      if (label !== "Set shortcut…") log(`Recorded ${label}.`);
    }
    paintHotkeyField(recordTarget);
  }
  recordTarget = null;
  recordPendingMod = 0;
}

function startRecord(row) {
  hotkeyPicker.close();
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

function createKeyRows(keys) {
  hotkeyPicker.close();
  stopRecord({keep: false});
  const root = $("#keyRows");
  root.textContent = "";
  controls.forEach((name, i) => {
    const key = keys?.[i] || DEFAULT_KEYS[i];
    const row = document.createElement("div");
    row.className = "key-row";
    row.innerHTML = `
      <span class="key-name">${name}</span>
      <button type="button" class="hotkey-field" aria-haspopup="dialog" aria-expanded="false"></button>
      <button type="button" class="ghost record" aria-label="Record shortcut for ${name}">Record</button>
      <button type="button" class="ghost clear-hotkey" aria-label="Reset shortcut for ${name}">Reset</button>`;
    setRowBinding(row, key);
    row.querySelector(".hotkey-field").addEventListener("click", () => {
      if (recordTarget === row) return;
      hotkeyPicker.open(row);
    });
    row.querySelector(".record").addEventListener("click", () => startRecord(row));
    row.querySelector(".clear-hotkey").addEventListener("click", () => {
      stopRecord({keep: false});
      hotkeyPicker.close();
      setRowBinding(row, DEFAULT_KEYS[i]);
      log(`Reset ${name}.`);
    });
    root.append(row);
  });
}

function readKeys() {
  return $$(".key-row").map(row => getRowBinding(row));
}

async function refresh() {
  const status = $("#status");
  try {
    const info = await api("/api/status");
    status.className = `status ${info.connected ? "connected" : "offline"}`;
    status.lastElementChild.textContent = info.connected ? "Connected" : "Not connected";
    if (info.connected) {
      const config = await api("/api/config");
      colors = config.colors;
      brightness = config.brightness;
      pulse = Array.isArray(config.pulse) ? config.pulse.map(Boolean) : [true, true, true];
      createKeyRows(config.keys);
      paintPreview();
      log(`Device connected · protocol ${config.protocol}`);
    }
  } catch (error) {
    status.className = "status offline";
    status.lastElementChild.textContent = "Not connected";
    log(error.message);
  }
  try {
    const fw = await api("/api/firmware");
    $("#firmwareInfo").textContent = `${fw.size} bytes · SHA-256 ${fw.sha256.slice(0,16)}…`;
  } catch (error) { $("#firmwareInfo").textContent = error.message; }
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
    if (send) queueRgb();
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
  queueRgb();
}));

$$('[data-brightness]').forEach(input => input.addEventListener("input", () => {
  brightness[Number(input.dataset.brightness)] = Number(input.value);
  paintPreview();
  queueRgb();
}));

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
    queueRgb();
    return;
  }
  const btn = event.target.closest("[data-quick]");
  if (!btn) return;
  const led = Number(btn.closest(".light-row").dataset.led);
  colors[led] = hexToRgb(btn.dataset.quick);
  paintPreview();
  colorPicker.syncFromState();
  queueRgb();
});

$("#lightsOff").addEventListener("click", () => {
  colors = [[0,0,0],[0,0,0],[0,0,0]];
  brightness = [0,0,0];
  paintPreview();
  colorPicker.syncFromState();
  queueRgb();
});
$("#saveConfig").addEventListener("click", async () => { try { await post("/api/keymap", {keys:readKeys()}); await sendRgb(); await post("/api/save"); log("Configuration saved to EEPROM."); } catch(e) { log(`Save: ${e.message}`); } });
$("#buildFirmware").addEventListener("click", async event => { const b=event.currentTarget;b.disabled=true;log("Building firmware…");try{const r=await post("/api/build");$("#firmwareInfo").textContent=`${r.firmware.size} bytes · SHA-256 ${r.firmware.sha256.slice(0,16)}…`;log(r.log.trim());}catch(e){log(`Build failed: ${e.message}`);}finally{b.disabled=false;} });
$("#firmwareFile").addEventListener("change", async event => { const file=event.target.files[0];if(!file)return;try{const r=await api("/api/firmware/upload",{method:"POST",headers:{"Content-Type":"application/octet-stream","X-Macropad-Client":"1"},body:await file.arrayBuffer()});uploaded=true;$("#uploadInfo").textContent=`${file.name} · ${r.size} bytes · ${r.sha256.slice(0,12)}…`;log("External firmware validated.");}catch(e){uploaded=false;log(`Upload: ${e.message}`);} });
$("#flashFirmware").addEventListener("click", () => $("#flashDialog").showModal());
$("#confirmFlash").addEventListener("click", async event => { event.preventDefault();$("#flashDialog").close();log("Flash started: do not unplug USB…");try{const r=await post("/api/flash",{confirm:true,uploaded,enter_bootloader:true});log(r.log.trim());log("Flash and verify completed.");setTimeout(refresh,1500);}catch(e){log(`Flash failed: ${e.message}`);} });
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
setInterval(async () => { try { const s=await api("/api/status");const el=$("#status");el.className=`status ${s.connected?"connected":"offline"}`;el.lastElementChild.textContent=s.connected?"Connected":"Not connected";} catch {} },3000);
