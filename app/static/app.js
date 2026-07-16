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
function hexToRgb(hex) { return [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)); }
function pct(value) { return `${Math.round(value / 255 * 100)}%`; }

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

$$('[data-color]').forEach(input => input.addEventListener("input", () => {
  colors[Number(input.dataset.color)] = hexToRgb(input.value); paintPreview(); queueRgb();
}));
$$('[data-brightness]').forEach(input => input.addEventListener("input", () => {
  brightness[Number(input.dataset.brightness)] = Number(input.value); paintPreview(); queueRgb();
}));
$(".light-rows")?.addEventListener("click", event => {
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
  queueRgb();
});
$("#lightsOff").addEventListener("click", () => {
  colors = [[0,0,0],[0,0,0],[0,0,0]];
  brightness = [0,0,0];
  paintPreview();
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
  const apply = (theme) => {
    root.dataset.theme = theme;
    localStorage.setItem("tastierino-theme", theme);
    btn.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    btn.title = theme === "dark" ? "Light mode" : "Dark mode";
  };
  apply(root.dataset.theme === "light" ? "light" : "dark");
  btn.addEventListener("click", () => apply(root.dataset.theme === "dark" ? "light" : "dark"));
})();

createKeyRows();
buildQuickColors();
paintPreview();
refresh();
setInterval(async () => { try { const s=await api("/api/status");const el=$("#status");el.className=`status ${s.connected?"connected":"offline"}`;el.lastElementChild.textContent=s.connected?"Connected":"Not connected";} catch {} },3000);
