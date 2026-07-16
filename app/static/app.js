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

function createKeyRows(keys) {
  const root = $("#keyRows");
  root.textContent = "";
  controls.forEach((name, i) => {
    const key = keys?.[i] || {mod:0,type:i < 3 ? 0 : 1,code:[0x68,0x69,0x6a,0xe2,0xe9,0xea][i]};
    const row = document.createElement("div");
    row.className = "key-row";
    row.innerHTML = `<span class="key-name">${name}</span>
      <select class="type" aria-label="Type for ${name}"><option value="0">Keyboard</option><option value="1">Media</option></select>
      <select class="mod" aria-label="Modifier for ${name}"><option value="0">None</option><option value="1">Ctrl</option><option value="2">Shift</option><option value="4">Alt</option><option value="8">⌘ Cmd</option><option value="10">⌘ + Shift</option></select>
      <input class="code" type="number" min="0" max="255" aria-label="HID code for ${name}" title="Decimal HID code">`;
    row.querySelector(".type").value = key.type;
    row.querySelector(".mod").value = key.mod;
    row.querySelector(".code").value = key.code;
    root.append(row);
  });
}

function readKeys() {
  return $$(".key-row").map(row => ({type:Number(row.querySelector(".type").value), mod:Number(row.querySelector(".mod").value), code:Number(row.querySelector(".code").value)}));
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
$("#applyKeys").addEventListener("click", async () => { try { await post("/api/keymap", {keys:readKeys()}); log("Keymap applied temporarily."); } catch(e) { log(`Keymap: ${e.message}`); } });
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
