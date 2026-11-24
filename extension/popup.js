const $ = (id) => document.getElementById(id);
let settings = MurmurTTS.settingsFrom(null);

const fmtSpeed = (v) => Number(v).toFixed(2).replace(/0$/, "") + "×";

function renderStatus(s) {
  if (!s) return;
  const el = $("status");
  el.classList.toggle("err", s.state === "error");
  const pos = s.total ? ` (${Math.min(s.index + 1, s.total)}/${s.total})` : "";
  el.textContent =
    s.state === "loading" ? "Generating speech" + pos + "…" :
    s.state === "buffering" ? "Buffering for smooth playback (~" + s.bufferEta + "s)…" :
    s.state === "playing" ? "Playing" + pos :
    s.state === "paused" ? "Paused" + pos :
    s.state === "error" ? s.error : "";
}

async function init() {
  settings = MurmurTTS.settingsFrom(await chrome.storage.sync.get(null));
  $("speed").value = settings.speed;
  $("speedVal").textContent = fmtSpeed(settings.speed);
  $("volume").value = settings.volume;
  $("volVal").textContent = Math.round(settings.volume * 100) + "%";
  $("srv").textContent = new URL(MurmurTTS.baseUrl(settings)).host;
  $("speakOnParagraphs").checked = settings.speakOnParagraphs;
  $("speakOnPage").checked = settings.speakOnPage;

  await loadVoices();

  const st = await chrome.runtime.sendMessage({ type: "get-status" }).catch(() => null);
  if (st && st.state !== "idle") renderStatus(st);
}

function fillVoiceSelect(catalog) {
  const sel = $("voice");
  sel.innerHTML = "";
  const add = (parent, id, label) => {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = label;
    parent.appendChild(o);
  };
  let groupName = null;
  let parent = sel;
  for (const v of catalog.voices) {
    if (v.group !== groupName) {
      groupName = v.group;
      if (groupName) {
        parent = document.createElement("optgroup");
        parent.label = groupName;
        sel.appendChild(parent);
      } else parent = sel;
    }
    add(parent, v.id, v.label);
  }
  const want = MurmurTTS.activeVoice(settings);
  const ids = [...sel.options].map((o) => o.value);
  if (ids.includes(want)) sel.value = want;
  else if (catalog.defaultVoice && ids.includes(catalog.defaultVoice)) sel.value = catalog.defaultVoice;
  else if (sel.options.length) sel.value = sel.options[0].value;
}

async function loadVoices() {
  const sel = $("voice");
  sel.innerHTML = "";
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 2500);
    const ok = await MurmurTTS.health(settings, ctrl.signal);
    $("dot").className = "dot " + (ok ? "ok" : "bad");
    fillVoiceSelect(await MurmurTTS.listVoices(settings));
    $("status").textContent = "";
    $("status").classList.remove("err");
  } catch {
    $("dot").className = "dot bad";
    if (!sel.options.length) {
      const o = document.createElement("option");
      o.value = MurmurTTS.activeVoice(settings);
      o.textContent = "Server offline";
      sel.appendChild(o);
    }
    $("status").classList.add("err");
    $("status").textContent = "Server not running. Start it with " + MurmurTTS.startHint();
  }
}

function setSpeed(v) {
  v = Math.min(3, Math.max(0.5, Number(v)));
  $("speed").value = v;
  $("speedVal").textContent = fmtSpeed(v);
  chrome.storage.sync.set({ speed: v });
  chrome.runtime.sendMessage({ type: "set-speed", speed: v }).catch(() => {});
}

$("speed").addEventListener("input", (e) => setSpeed(e.target.value));
document.querySelectorAll(".presets button").forEach((b) =>
  b.addEventListener("click", () => setSpeed(b.dataset.s))
);
$("volume").addEventListener("input", (e) => {
  const v = Number(e.target.value);
  $("volVal").textContent = Math.round(v * 100) + "%";
  chrome.storage.sync.set({ volume: v });
  chrome.runtime.sendMessage({ type: "set-volume", volume: v }).catch(() => {});
});
$("voice").addEventListener("change", (e) => {
  settings.voice = e.target.value;
  chrome.storage.sync.set({ voice: e.target.value });
});
function bindToggle(id, key) {
  $(id).addEventListener("change", (e) => {
    settings[key] = e.target.checked;
    chrome.storage.sync.set({ [key]: e.target.checked });
  });
}
bindToggle("speakOnParagraphs", "speakOnParagraphs");
bindToggle("speakOnPage", "speakOnPage");

$("read").addEventListener("click", async () => {
  const r = await chrome.runtime.sendMessage({ type: "read-active-selection" });
  if (r && !r.ok) { $("status").classList.add("err"); $("status").textContent = r.error || "Nothing to read."; }
});
$("pause").addEventListener("click", () => chrome.runtime.sendMessage({ type: "toggle-pause" }));
$("stop").addEventListener("click", () => { chrome.runtime.sendMessage({ type: "stop" }); $("status").textContent = ""; });
$("opts").addEventListener("click", () => chrome.runtime.openOptionsPage());

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "status") renderStatus(msg.status);
});

init();
