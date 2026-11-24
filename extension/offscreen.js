// Offscreen document: owns generation + playback so audio survives service-worker restarts.
//
// Pipeline: text -> sentence chunks -> (generate chunk i+1.. while chunk i plays) -> <audio>
// Speed is applied with playbackRate (pitch preserved), so it can be changed live.
//
// The local model may generate slower than real time. After the first chunk is ready we
// estimate the generation/playback rates and hold playback just long enough (capped) that
// the remaining chunks can arrive before they're needed ("smooth playback").

const PREFETCH_AHEAD = 8;
const MAX_PREBUFFER_SEC = 12; // keep total silence well under Chrome's 30 s offscreen-audio idle limit
const WAV_BYTES_PER_SEC = 24000 * 2; // Kokoro returns 24 kHz mono 16-bit PCM

let session = 0;           // incremented on every speak/stop to cancel stale pipelines
let abort = null;          // AbortController for in-flight fetches
let audio = null;          // current <audio>
let state = "idle";        // idle | loading | buffering | playing | paused | error
let chunks = [];
let index = 0;
let speed = 1.0;
let volume = 1.0;
let lastError = "";
let bufferEta = 0;         // seconds left of pre-buffering
let skipBuffer = false;
let holdPause = false; // pause clicked before this clip has an <audio> element yet

function status() {
  return { state, index, total: chunks.length, speed, volume, error: lastError, bufferEta };
}

function emit() {
  chrome.runtime.sendMessage({ type: "status", status: status() }).catch(() => {});
}

function setState(s, err = "") {
  state = s;
  lastError = err;
  emit();
}

function cleanupAudio() {
  if (audio) {
    audio.onended = audio.onerror = null;
    audio.pause();
    if (audio.src) URL.revokeObjectURL(audio.src);
    audio.src = "";
    audio = null;
  }
}

function stop(finalState = "idle") {
  session++;
  holdPause = false;
  if (abort) abort.abort();
  abort = null;
  cleanupAudio();
  chunks = [];
  index = 0;
  bufferEta = 0;
  skipBuffer = false;
  setState(finalState);
}

function playBlob(blob, mySession, bakedSpeed) {
  return new Promise((resolve, reject) => {
    if (mySession !== session) return resolve("cancelled");
    cleanupAudio();
    const a = new Audio(URL.createObjectURL(blob));
    audio = a;
    // bakedSpeed > 0: the file was already generated at that pace (Kokoro), so the
    // element plays at 1 unless the slider has moved since.
    a._baked = bakedSpeed || 0;
    a.preservesPitch = true;
    a.playbackRate = a._baked ? speed / a._baked : speed;
    a.volume = volume;
    a.onended = () => resolve("ended");
    a.onerror = () => reject(new Error("Audio playback failed"));
    a.play().then(() => {
      if (holdPause) { a.pause(); setState("paused"); }
    }).catch(reject);
  });
}

async function blobSeconds(blob) {
  try {
    const view = new DataView(await blob.slice(0, 44).arrayBuffer());
    if (view.byteLength >= 44 && view.getUint32(0) === 0x52494646) {
      const rate = view.getUint32(24, true);
      const channels = view.getUint16(22, true);
      const bits = view.getUint16(34, true);
      if (rate && channels && bits) return Math.max(0.1, (blob.size - 44) / (rate * channels * (bits / 8)));
    }
  } catch { /* fall through */ }
  return Math.max(0.1, (blob.size - 44) / WAV_BYTES_PER_SEC);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function speak(text, settings) {
  stop("idle");
  const mySession = session;
  speed = clampSpeed(settings.speed ?? speed);
  volume = Number(settings.volume ?? volume);
  chunks = MurmurTTS.splitIntoChunks(text);
  if (!chunks.length) return;
  abort = new AbortController();
  const signal = abort.signal;
  setState("loading");

  // Kokoro bakes the requested speed into the wav. Playback starts at 1× relative to
  // that file, and a later slider move rescales the clip that is already playing.
  const voice = MurmurTTS.activeVoice(settings);
  const jobs = new Array(chunks.length);
  const baked = new Array(chunks.length);
  const genSeconds = new Array(chunks.length);

  const generate = async (i) => {
    baked[i] = speed;
    const t0 = performance.now();
    const blob = await MurmurTTS.synthesize(settings, chunks[i], { voice, speed, signal });
    genSeconds[i] = (performance.now() - t0) / 1000;
    return blob;
  };

  // Strictly sequential generation (the server handles one request at a time anyway),
  // running ahead of playback by PREFETCH_AHEAD chunks.
  const waiters = [];
  const producer = (async () => {
    for (let i = 0; i < chunks.length; i++) {
      while (i - index > PREFETCH_AHEAD) {
        await new Promise((r) => waiters.push(r));
        if (mySession !== session) return;
      }
      if (mySession !== session) return;
      jobs[i] = generate(i);
      jobs[i].catch(() => {}); // surfaced by the consumer
      try { await jobs[i]; } catch { return; }
    }
  })();

  // How long to hold playback so later chunks arrive in time (estimated from chunk 0).
  const smoothWait = (dur0) => {
    if (settings.smooth === false || chunks.length < 2) return 0;
    const rate = 1;
    const chars0 = chunks[0].length;
    const genPerChar = genSeconds[0] / chars0;
    const durPerChar = dur0 / chars0;
    let cumGen = 0, cumPlay = dur0 / rate, wait = 0;
    for (let k = 1; k < chunks.length; k++) {
      cumGen += chunks[k].length * genPerChar;
      wait = Math.max(wait, cumGen - cumPlay);
      cumPlay += (chunks[k].length * durPerChar) / rate;
    }
    return Math.min(MAX_PREBUFFER_SEC, Math.max(0, wait));
  };

  try {
    for (let i = 0; i < chunks.length; i++) {
      if (mySession !== session) return;
      index = i;
      waiters.splice(0).forEach((r) => r());
      while (!jobs[i]) {
        await sleep(20);
        if (mySession !== session) return;
      }
      if (!holdPause && state !== "paused") setState("loading");
      const blob = await jobs[i];
      if (mySession !== session) return;

      if (i === 0) {
        const wait = smoothWait(await blobSeconds(blob));
        if (wait > 1) {
          const until = performance.now() + wait * 1000;
          skipBuffer = false;
          while (!skipBuffer && !holdPause && performance.now() < until) {
            bufferEta = Math.ceil((until - performance.now()) / 1000);
            setState("buffering");
            await sleep(500);
            if (mySession !== session) return;
          }
          bufferEta = 0;
        }
      }

      while (holdPause && mySession === session) {
        setState("paused");
        await sleep(80);
      }
      if (mySession !== session) return;

      if (!holdPause) setState("playing");
      const r = await playBlob(blob, mySession, baked[i]);
      if (r === "cancelled") return;
    }
    if (mySession === session) stop("idle");
  } catch (e) {
    if (e.name === "AbortError" || mySession !== session) return;
    console.error(e);
    stop("idle");
    setState("error", e.message || String(e));
  } finally {
    waiters.splice(0).forEach((r) => r());
    void producer;
  }
}

function clampSpeed(v) {
  v = Number(v);
  if (!isFinite(v)) return 1;
  return Math.min(3, Math.max(0.5, v));
}

function pause() {
  if (state === "idle" || state === "error") return;
  holdPause = true;
  if (audio && state === "playing") audio.pause();
  setState("paused");
}
function resume() {
  const buffering = state === "buffering";
  holdPause = false;
  if (buffering) { skipBuffer = true; return; } // "start now"
  if (audio && audio.paused) {
    audio.play();
    setState("playing");
    return;
  }
  if (state === "paused") setState("loading");
}
function togglePause() {
  if (state === "paused" || holdPause) resume();
  else if (state === "buffering") resume();
  else pause();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== "offscreen") return;
  switch (msg.type) {
    case "speak":
      speak(msg.text, msg.settings);
      sendResponse({ ok: true });
      break;
    case "pause": pause(); sendResponse(status()); break;
    case "resume": resume(); sendResponse(status()); break;
    case "toggle-pause": togglePause(); sendResponse(status()); break;
    case "stop": stop("idle"); sendResponse(status()); break;
    case "set-speed":
      speed = clampSpeed(msg.speed);
      if (audio) audio.playbackRate = audio._baked ? speed / audio._baked : speed;
      emit();
      sendResponse(status());
      break;
    case "set-volume":
      volume = Math.min(1, Math.max(0, Number(msg.volume)));
      if (audio) audio.volume = volume;
      emit();
      sendResponse(status());
      break;
    case "get-status": sendResponse(status()); break;
  }
  return true;
});
