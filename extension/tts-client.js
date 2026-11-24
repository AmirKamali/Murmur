// Shared helpers for the local Kokoro server and for chunking text.
// Loaded by offscreen.html, popup.html and options.html.
// Service worker loads it with importScripts.

const MurmurTTS = (() => {
  const DEFAULT_URL = "http://127.0.0.1:8880";
  const DEFAULT_VOICE = "af_heart";
  const START = "./server/start-murmur.sh (macOS) or .\\server\\start-murmur.ps1 (Windows)";

  // af_heart -> American female "Heart". First letter is the language, second the gender.
  const LANG = {
    a: "English (US)", b: "English (UK)", e: "Spanish", f: "French", h: "Hindi",
    i: "Italian", j: "Japanese", p: "Portuguese", z: "Chinese",
  };

  // Fold current and older saved keys into one settings object.
  // Older builds stored a Fish Speech reference name in `voice` and the Kokoro
  // choice in `kokoroVoice`, with the Fish server on port 8765.
  function settingsFrom(stored) {
    const s = stored || {};
    const legacyUrl = String(s.kokoroUrl || "").replace(/\/+$/, "");
    let serverUrl = String(s.serverUrl || "").replace(/\/+$/, "");
    if (legacyUrl) serverUrl = legacyUrl;
    else if (!serverUrl || /:8765\b/.test(serverUrl)) serverUrl = DEFAULT_URL;
    const storedVoice = String(s.voice || "");
    const voice = /^[a-z][fm]_/.test(storedVoice) ? storedVoice : (s.kokoroVoice || DEFAULT_VOICE);
    return {
      serverUrl,
      voice,
      speed: Number(s.speed ?? 1) || 1,
      volume: s.volume ?? 1,
      smooth: s.smooth !== false,
      autoRead: !!s.autoRead,
      showButton: s.showButton !== false,
      speakOnParagraphs: s.speakOnParagraphs !== false,
      speakOnPage: s.speakOnPage !== false,
    };
  }

  function baseUrl(settings) {
    return String(settings.serverUrl || DEFAULT_URL).replace(/\/+$/, "");
  }
  function startHint() {
    return START;
  }
  function activeVoice(settings) {
    return settings.voice || DEFAULT_VOICE;
  }

  function voiceInfo(id) {
    const legacy = /_v0/.test(id);
    const name = id.replace(/^[a-z][fm]_/, "").replace(/_v0/, "").replace(/_/g, " ");
    const nice = name.replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      id,
      label: nice + (legacy ? " (older)" : ""),
      group: (LANG[id[0]] || "Other") + (legacy ? " · older" : ""),
    };
  }

  async function health(settings, signal) {
    const r = await fetch(baseUrl(settings) + "/health", { signal });
    return r.ok;
  }

  // { voices: [{id, label, group}], defaultVoice }
  async function listVoices(settings) {
    const r = await fetch(baseUrl(settings) + "/v1/audio/voices", { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("Could not list voices (" + r.status + ")");
    const j = await r.json();
    const raw = j.voices || [];
    const voices = raw
      .map((v) => voiceInfo(typeof v === "string" ? v : v.id))
      .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
    return { voices, defaultVoice: j.default_voice || DEFAULT_VOICE };
  }

  // Synthesize `text` -> WAV Blob. Speed is baked into the audio (0.25–4).
  async function synthesize(settings, text, opts = {}) {
    const body = {
      model: "kokoro",
      input: text,
      voice: opts.voice || activeVoice(settings),
      response_format: "wav",
      speed: Math.min(4, Math.max(0.25, Number(opts.speed ?? settings.speed ?? 1))),
    };
    let r;
    try {
      r = await fetch(baseUrl(settings) + "/v1/audio/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: opts.signal,
      });
    } catch (e) {
      if (e.name === "AbortError") throw e;
      const err = new Error(
        "Can't reach the Kokoro server at " + baseUrl(settings) + ". Start it with " + START
      );
      err.code = "unreachable";
      throw err;
    }
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error("Server error " + r.status + (t ? ": " + t.slice(0, 200) : ""));
    }
    return await r.blob();
  }

  // Split into sentence-aligned chunks. First chunk is short so playback starts quickly.
  function splitIntoChunks(raw, firstMax = 110, restMax = 260) {
    const text = raw
      .replace(/\r/g, "")
      .replace(/https?:\/\/\S+/g, " link ")
      .replace(/[ \t\u00a0]+/g, " ")
      .trim();
    const paragraphs = text.split(/\n{1,}/).map((p) => p.trim()).filter(Boolean);

    const sentences = [];
    const re = /[^.!?。！？…]+(?:[.!?。！？…]+["'”’)\]]*|$)\s*/g;
    for (const p of paragraphs) {
      const parts = p.match(re) || [p];
      for (const s of parts) {
        const t = s.trim();
        if (t) sentences.push(t);
      }
      sentences.push("\u0000");
    }

    const pieces = [];
    for (const s of sentences) {
      if (s === "\u0000") { pieces.push(s); continue; }
      if (s.length <= restMax) { pieces.push(s); continue; }
      let cur = "";
      for (const seg of s.split(/(?<=[,;:，；：、])\s*/)) {
        if ((cur + " " + seg).trim().length > restMax && cur) { pieces.push(cur.trim()); cur = seg; }
        else cur = (cur + " " + seg).trim();
      }
      if (cur) {
        while (cur.length > restMax) {
          let cut = cur.lastIndexOf(" ", restMax);
          if (cut < restMax / 2) cut = restMax;
          pieces.push(cur.slice(0, cut).trim());
          cur = cur.slice(cut).trim();
        }
        if (cur) pieces.push(cur);
      }
    }

    const chunks = [];
    let cur = "";
    for (const p of pieces) {
      const limit = chunks.length === 0 ? firstMax : restMax;
      if (p === "\u0000") { if (cur.length > 120) { chunks.push(cur); cur = ""; } continue; }
      if (cur && (cur + " " + p).length > limit) { chunks.push(cur); cur = p; }
      else cur = cur ? cur + " " + p : p;
    }
    if (cur) chunks.push(cur);
    return chunks;
  }

  return { settingsFrom, baseUrl, startHint, activeVoice, health, listVoices, synthesize, splitIntoChunks };
})();

if (typeof self !== "undefined") self.MurmurTTS = MurmurTTS;
