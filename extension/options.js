const SAMPLE_TEXT =
  "The morning light spilled across the quiet harbor, and for a moment everything felt unhurried. " +
  "Boats rocked gently while a few early walkers traded greetings along the pier.";

const $ = (id) => document.getElementById(id);
let settings = MurmurTTS.settingsFrom(null);
let previewUrl = null;

const fmt = (v) => Number(v).toFixed(2).replace(/0$/, "");
const save = (patch) => { settings = { ...settings, ...patch }; return chrome.storage.sync.set(patch); };
function say(text, kind = "") { const m = $("voiceMsg"); m.textContent = text; m.className = "msg " + kind; }

async function checkHealth() {
  const h = $("health");
  h.className = "msg"; h.textContent = "Checking…";
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 3000);
    const ok = await MurmurTTS.health(settings, ctrl.signal);
    h.innerHTML = `<span class="dot ${ok ? "ok" : "bad"}"></span>` + (ok ? "Connected" : "Server responded with an error");
  } catch {
    h.innerHTML = '<span class="dot bad"></span>Not reachable';
  }
}

async function refreshVoices() {
  const sel = $("voice");
  sel.innerHTML = "";
  const add = (parent, id, label) => {
    const o = document.createElement("option");
    o.value = id; o.textContent = label;
    parent.appendChild(o);
  };
  let catalog = { voices: [], defaultVoice: "af_heart" };
  try { catalog = await MurmurTTS.listVoices(settings); }
  catch { say("Start the server to see its voices.", "err"); }
  let groupName = null, parent = sel;
  catalog.voices.forEach((v) => {
    if (v.group !== groupName) {
      groupName = v.group;
      if (groupName) { parent = document.createElement("optgroup"); parent.label = groupName; sel.appendChild(parent); }
      else parent = sel;
    }
    add(parent, v.id, v.label);
  });
  const want = MurmurTTS.activeVoice(settings);
  const ids = [...sel.options].map((o) => o.value);
  sel.value = ids.includes(want) ? want : (ids.includes(catalog.defaultVoice) ? catalog.defaultVoice : ids[0] || "");
}

async function previewVoice(id) {
  const b = $("preview"); b.disabled = true;
  say("Generating a preview…");
  try {
    play(await MurmurTTS.synthesize(settings, SAMPLE_TEXT, { voice: id, speed: settings.speed }));
    say("Playing preview.", "ok");
  } catch (err) { say(err.message, "err"); }
  b.disabled = false;
}

function play(blob) {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(blob);
  const a = new Audio(previewUrl);
  a.play();
}

async function init() {
  settings = MurmurTTS.settingsFrom(await chrome.storage.sync.get(null));
  $("serverUrl").value = settings.serverUrl;
  $("startHint").innerHTML = "Start it with <code>" + MurmurTTS.startHint() + "</code>";
  $("showButton").checked = settings.showButton;
  $("autoRead").checked = settings.autoRead;
  $("smooth").checked = settings.smooth;
  $("speakOnParagraphs").checked = settings.speakOnParagraphs;
  $("speakOnPage").checked = settings.speakOnPage;
  $("smooth").addEventListener("change", (e) => save({ smooth: e.target.checked }));

  const speed = $("speed"), speedVal = $("speedVal");
  speed.value = settings.speed;
  speedVal.textContent = fmt(settings.speed) + "×";
  speed.addEventListener("input", () => { speedVal.textContent = fmt(speed.value) + "×"; save({ speed: Number(speed.value) }); });

  $("serverUrl").addEventListener("change", async (e) => {
    const v = e.target.value.trim().replace(/\/+$/, "");
    await save({ serverUrl: v });
    await checkHealth(); await refreshVoices();
  });
  $("test").onclick = async () => { await checkHealth(); await refreshVoices(); };
  $("preview").onclick = () => previewVoice($("voice").value);
  $("voice").addEventListener("change", (e) => save({ voice: e.target.value }));
  $("speakOnParagraphs").addEventListener("change", (e) => save({ speakOnParagraphs: e.target.checked }));
  $("speakOnPage").addEventListener("change", (e) => save({ speakOnPage: e.target.checked }));
  $("showButton").addEventListener("change", (e) => save({ showButton: e.target.checked }));
  $("autoRead").addEventListener("change", (e) => save({ autoRead: e.target.checked }));

  await checkHealth();
  await refreshVoices();
}
init();
