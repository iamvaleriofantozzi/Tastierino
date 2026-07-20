// codex_pad/static/app.js
const STATE_LABEL = {
  free: "libero",
  bound: "associato",
  generating: "genera…",
  done: "finito",
  aborted: "abortito",
};

async function refresh() {
  const r = await fetch("/api/status");
  const d = await r.json();
  document.getElementById("device").textContent =
    "device: " + (d.device.connected ? "connesso" : "SCOLLEGATO");
  document.getElementById("device").className =
    "device " + (d.device.connected ? "ok" : "bad");
  const slots = document.getElementById("slots");
  slots.innerHTML = "";
  for (const s of d.slots) {
    const card = document.createElement("div");
    card.className = "card " + s.state;
    const title = s.session_id ? s.name : "(vuoto)";
    card.innerHTML =
      '<div class="key">Tasto ' + (s.slot + 1) + "</div>" +
      '<div class="dot"></div>' +
      '<div class="state">' + STATE_LABEL[s.state] + "</div>" +
      '<div class="name" title="' + (s.session_id || "") + '">' +
      escapeHtml(title) + "</div>";
    const bf = document.createElement("button");
    bf.textContent = "Focus";
    bf.disabled = !s.session_id;
    bf.onclick = () => act(s.slot, "focus");
    const bu = document.createElement("button");
    bu.textContent = "Unbind";
    bu.disabled = !s.session_id;
    bu.onclick = () => act(s.slot, "unbind");
    card.appendChild(bf);
    card.appendChild(bu);
    slots.appendChild(card);
  }
  const ul = document.getElementById("unbound");
  ul.innerHTML = "";
  for (const u of d.unbound) {
    const li = document.createElement("li");
    li.textContent = u.name + " (" + u.session_id.slice(0, 8) + ")";
    ul.appendChild(li);
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function act(slot, action) {
  await fetch("/api/slots/" + slot + "/" + action, { method: "POST" });
  refresh();
}

refresh();
setInterval(refresh, 2000);
