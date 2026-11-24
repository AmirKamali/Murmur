// Content script: floating "Read" button next to a text selection + a small player widget.
// Everything is rendered inside a shadow root so page CSS can't interfere.

(() => {
  if (window.top !== window) return; // only the top frame hosts the UI
  if (window.__murmurLoaded) return;
  window.__murmurLoaded = true;

  const host = document.createElement("div");
  host.id = "murmur-root";
  host.style.cssText = "all:initial;position:fixed;z-index:2147483647;top:0;left:0;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      .btn {
        position: fixed; display: none; align-items: center; gap: 6px;
        padding: 6px 11px; border-radius: 999px; border: none; cursor: pointer;
        background: #0f766e; color: #fff; font-size: 13px; font-weight: 600;
        box-shadow: 0 4px 14px rgba(0,0,0,.28); user-select: none;
      }
      .btn:hover { background: #0d9488; }
      .player {
        position: fixed; right: 18px; bottom: 18px; width: 300px; display: none;
        background: #111827; color: #f9fafb; border-radius: 14px; padding: 12px 14px;
        box-shadow: 0 10px 30px rgba(0,0,0,.4); font-size: 13px;
      }
      .row { display: flex; align-items: center; gap: 8px; }
      .title { font-weight: 600; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .sub { color: #9ca3af; font-size: 12px; margin-top: 2px; min-height: 16px; }
      .sub.err { color: #fca5a5; white-space: normal; }
      button.ic {
        background: #1f2937; color: #f9fafb; border: none; border-radius: 8px;
        width: 32px; height: 28px; cursor: pointer; font-size: 14px;
      }
      button.ic:hover { background: #374151; }
      .speed { margin-top: 10px; }
      .speed label { color: #9ca3af; font-size: 12px; min-width: 48px; }
      input[type=range] { flex: 1; accent-color: #14b8a6; }
      .val { width: 38px; text-align: right; font-variant-numeric: tabular-nums; }
      .spin { display:inline-block; width:10px; height:10px; border:2px solid #4b5563; border-top-color:#14b8a6; border-radius:50%; animation: s .8s linear infinite; margin-right:6px; vertical-align:-1px;}
      @keyframes s { to { transform: rotate(360deg);} }
      .chip {
        position: fixed; display: none; align-items: center; gap: 6px;
        z-index: 2147483647; pointer-events: auto;
      }
      .chip button {
        border: none; cursor: pointer; border-radius: 999px;
        padding: 5px 11px; font-size: 12px; font-weight: 600;
        background: #0f766e; color: #fff;
        box-shadow: 0 4px 14px rgba(0,0,0,.28);
      }
      .chip button:hover { background: #0d9488; }
      .chip button.stop { background: #1f2937; }
      .chip button.stop:hover { background: #374151; }
      .chip.page { left: 18px; bottom: 18px; }
      .chip.icons { gap: 4px; }
      .chip.icons button {
        width: 26px; height: 26px; padding: 0;
        display: inline-flex; align-items: center; justify-content: center;
      }
      .chip.icons svg { width: 12px; height: 12px; fill: currentColor; display: block; }
    </style>
    <button class="btn" id="read" title="Read selection aloud (Alt+R)">🔊 Read</button>
    <div class="chip icons" id="paraChip">
      <button type="button" id="paraSpeak" title="Read paragraph" aria-label="Read paragraph"></button>
      <button type="button" class="stop" id="paraStop" style="display:none" title="Stop" aria-label="Stop"></button>
    </div>
    <div class="chip icons" id="paraPin">
      <button type="button" id="pinSpeak" title="Pause" aria-label="Pause"></button>
      <button type="button" class="stop" id="pinStop" title="Stop" aria-label="Stop"></button>
    </div>
    <div class="chip page" id="pageChip">
      <button type="button" id="pageSpeak" title="Read page">Read page</button>
      <button type="button" class="stop" id="pageStop" style="display:none" title="Stop">Stop</button>
    </div>
    <div class="player" id="player">
      <div class="row">
        <span class="title" id="title">Murmur</span>
        <button class="ic" id="pp" title="Pause / resume (Alt+P)">⏸</button>
        <button class="ic" id="stop" title="Stop (Alt+S)">⏹</button>
        <button class="ic" id="close" title="Hide">✕</button>
      </div>
      <div class="sub" id="sub"></div>
      <div class="row speed">
        <label>Speed</label>
        <input type="range" id="speed" min="0.5" max="3" step="0.05" value="1" />
        <span class="val" id="speedVal">1.0×</span>
      </div>
    </div>`;
  document.documentElement.appendChild(host);

  const $ = (id) => root.getElementById(id);
  const readBtn = $("read"), player = $("player"), pp = $("pp"), sub = $("sub");
  const speedEl = $("speed"), speedVal = $("speedVal"), title = $("title");
  const paraChip = $("paraChip"), paraSpeak = $("paraSpeak"), paraStop = $("paraStop");
  const paraPin = $("paraPin"), pinSpeak = $("pinSpeak"), pinStop = $("pinStop");
  const pageChip = $("pageChip"), pageSpeak = $("pageSpeak"), pageStop = $("pageStop");

  const PREF_DEFAULTS = {
    autoRead: false,
    showButton: true,
    speed: 1,
    speakOnParagraphs: true,
    speakOnPage: true,
  };

  let lastText = "";
  let prefs = { ...PREF_DEFAULTS };
  let playback = { state: "idle", source: "", sourceId: "" };
  let hoverEl = null;
  let hoverRaf = 0;
  const paraIds = new WeakMap();
  const paraById = new Map();
  let paraSeq = 0;

  function loadPrefs() {
    try {
      chrome.storage.sync.get(PREF_DEFAULTS, (p) => {
        prefs = p;
        speedEl.value = p.speed;
        speedVal.textContent = Number(p.speed).toFixed(2).replace(/0$/, "") + "×";
        layout();
      });
    } catch {}
  }
  loadPrefs();
  try { chrome.storage.onChanged.addListener(loadPrefs); } catch {}

  function send(msg) {
    try {
      return chrome.runtime.sendMessage(msg).catch(() => null);
    } catch {
      return Promise.resolve(null); // extension was reloaded; page needs refresh
    }
  }

  function getSelectedText() {
    const sel = window.getSelection();
    let t = sel ? sel.toString() : "";
    if (!t) {
      const el = document.activeElement;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT") && typeof el.selectionStart === "number") {
        t = el.value.substring(el.selectionStart, el.selectionEnd);
      }
    }
    return t.trim();
  }

  function pageText() {
    const el = document.querySelector("article") || document.querySelector("main") || document.body;
    return (el.innerText || "").trim().slice(0, 40000);
  }

  // ---- paragraph / page speak buttons ----
  const BLOCK = /^(P|LI|BLOCKQUOTE|H1|H2|H3|H4|H5|H6|FIGCAPTION|TD|PRE|DD)$/;
  const MIN_CHARS = 20;

  function plainText(el) {
    return (el?.innerText || "").replace(/\s+/g, " ").trim();
  }

  function inChrome(node) {
    const el = node && node.nodeType === 1 ? node : node?.parentElement;
    return !el || el.id === "murmur-root" || !!el.closest("#murmur-root");
  }

  function paragraphOf(node) {
    let el = node && node.nodeType === 1 ? node : node?.parentElement;
    if (!el || inChrome(el)) return null;
    if (el.closest("nav, header, footer, aside, form, button, textarea, select")) return null;
    while (el && el !== document.body) {
      if (inChrome(el)) return null;
      const tag = el.tagName;
      const text = plainText(el);
      const nested = el.querySelector("p, li, blockquote");
      const blockish = BLOCK.test(tag) || ((tag === "DIV" || tag === "SECTION" || tag === "ARTICLE") && !nested);
      if (blockish && text.length >= MIN_CHARS && text.length <= 8000) {
        const hidden = getComputedStyle(el);
        if (hidden.display === "none" || hidden.visibility === "hidden") return null;
        return el;
      }
      if (el.closest("nav, header, footer, aside, form")) return null;
      el = el.parentElement;
    }
    return null;
  }

  function keyFor(el) {
    let id = paraIds.get(el);
    if (!id) {
      id = "p" + (++paraSeq);
      paraIds.set(el, id);
      paraById.set(id, el);
    }
    return id;
  }

  function busy() {
    return playback && playback.state && playback.state !== "idle" && playback.state !== "error";
  }

  function place(chip, el) {
    const r = el.getBoundingClientRect();
    const onScreen = r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
    if (!onScreen || r.width + r.height === 0) { chip.style.display = "none"; return; }
    chip.style.display = "inline-flex";
    // Sit in the margin, with the control's right edge just left of the paragraph.
    chip.style.transform = "translateX(-100%)";
    const top = Math.min(Math.max(8, r.top), window.innerHeight - 40);
    chip.style.top = top + "px";
    chip.style.left = (r.left - 8) + "px";
  }

  function setSpeakControl(speakBtn, stopBtn, active, idle = "Read") {
    const paused = playback.state === "paused";
    speakBtn.textContent = active ? (paused ? "Resume" : "Pause") : idle;
    speakBtn.title = active ? (paused ? "Resume" : "Pause") : idle;
    stopBtn.style.display = active ? "" : "none";
  }

  const ICONS = {
    play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.5v11l9-5.5z"/></svg>',
    pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>',
    stop: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="1.5"/></svg>',
  };
  paraStop.innerHTML = ICONS.stop;
  pinStop.innerHTML = ICONS.stop;

  // Icon-only variant of setSpeakControl for the paragraph controls.
  function setIconControl(speakBtn, stopBtn, active) {
    const paused = playback.state === "paused";
    const kind = active && !paused ? "pause" : "play";
    const label = active ? (paused ? "Resume" : "Pause") : "Read paragraph";
    if (speakBtn.dataset.icon !== kind) { speakBtn.innerHTML = ICONS[kind]; speakBtn.dataset.icon = kind; }
    speakBtn.title = label;
    speakBtn.setAttribute("aria-label", label);
    stopBtn.style.display = active ? "" : "none";
  }

  function layout() {
    const pageOn = !!prefs.speakOnPage;
    pageChip.style.display = pageOn ? "inline-flex" : "none";
    if (pageOn) setSpeakControl(pageSpeak, pageStop, busy() && playback.source === "page", "Read page");

    const activeEl = prefs.speakOnParagraphs && busy() && playback.source === "paragraph"
      ? paraById.get(playback.sourceId)
      : null;
    const pinned = activeEl && activeEl.isConnected ? activeEl : null;

    if (prefs.speakOnParagraphs && hoverEl && hoverEl.isConnected && hoverEl !== pinned) {
      setIconControl(paraSpeak, paraStop, false);
      place(paraChip, hoverEl);
    } else {
      paraChip.style.display = "none";
    }

    if (pinned) {
      setIconControl(pinSpeak, pinStop, true);
      place(paraPin, pinned);
    } else {
      paraPin.style.display = "none";
    }
  }

  // The control sits outside the paragraph, so the pointer has to cross a gap to reach it.
  // Keep the current paragraph while the pointer is on that control or still crossing over.
  let clearHoverTimer = 0;
  function nearReadControl(x, y) {
    for (const chip of [paraChip, paraPin]) {
      if (chip.style.display === "none") continue;
      const r = chip.getBoundingClientRect();
      if (r.width + r.height === 0) continue;
      if (x >= r.left - 16 && x <= r.right + 24 && y >= r.top - 16 && y <= r.bottom + 16) return true;
    }
    return false;
  }
  function scheduleHover(node, x, y) {
    if (hoverRaf) cancelAnimationFrame(hoverRaf);
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0;
      if (!prefs.speakOnParagraphs) {
        clearTimeout(clearHoverTimer);
        if (hoverEl) { hoverEl = null; layout(); }
        return;
      }
      const next = paragraphOf(node);
      if (next) {
        clearTimeout(clearHoverTimer);
        if (next !== hoverEl) { hoverEl = next; layout(); }
        return;
      }
      if (nearReadControl(x, y)) { clearTimeout(clearHoverTimer); return; }
      if (!hoverEl) return;
      clearTimeout(clearHoverTimer);
      clearHoverTimer = setTimeout(() => { hoverEl = null; layout(); }, 350);
    });
  }

  document.addEventListener("mousemove", (e) => {
    if (e.composedPath().includes(host)) { clearTimeout(clearHoverTimer); return; }
    scheduleHover(e.target, e.clientX, e.clientY);
  }, true);
  paraChip.addEventListener("mouseenter", () => clearTimeout(clearHoverTimer));
  paraPin.addEventListener("mouseenter", () => clearTimeout(clearHoverTimer));

  function arm(el) {
    el.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
  }
  [paraChip, paraPin, pageChip].forEach(arm);

  paraSpeak.addEventListener("click", () => {
    if (!hoverEl || !hoverEl.isConnected) return;
    const text = plainText(hoverEl);
    if (!text) return;
    send({ type: "read-text", text, source: "paragraph", sourceId: keyFor(hoverEl) });
  });
  pinSpeak.addEventListener("click", () => {
    send({ type: playback.state === "paused" ? "resume" : "pause" });
  });
  paraStop.addEventListener("click", () => send({ type: "stop" }));
  pinStop.addEventListener("click", () => send({ type: "stop" }));
  pageSpeak.addEventListener("click", () => {
    if (busy() && playback.source === "page") {
      send({ type: playback.state === "paused" ? "resume" : "pause" });
      return;
    }
    const text = pageText();
    if (text) send({ type: "read-text", text, source: "page", sourceId: "page" });
  });
  pageStop.addEventListener("click", () => send({ type: "stop" }));

  // ---- floating button ----
  function hideButton() { readBtn.style.display = "none"; }

  function showButtonAt(x, y) {
    readBtn.style.display = "inline-flex";
    const w = 80, h = 32;
    const left = Math.min(Math.max(8, x), window.innerWidth - w - 8);
    const top = Math.min(Math.max(8, y), window.innerHeight - h - 8);
    readBtn.style.left = left + "px";
    readBtn.style.top = top + "px";
  }

  function onSelectionSettled(ev) {
    if (ev && host.contains(ev.target)) return;
    setTimeout(() => {
      const t = getSelectedText();
      if (!t || t.length < 2) { hideButton(); return; }
      lastText = t;
      if (prefs.autoRead) { hideButton(); send({ type: "read-text", text: t }); return; }
      if (!prefs.showButton) return;
      let x = (ev && ev.clientX != null ? ev.clientX : 20) + 10;
      let y = (ev && ev.clientY != null ? ev.clientY : 20) + 14;
      const sel = window.getSelection();
      if (sel && sel.rangeCount && !sel.isCollapsed) {
        const rects = sel.getRangeAt(0).getClientRects();
        const r = rects[rects.length - 1];
        if (r && r.width + r.height > 0) { x = r.right + 6; y = r.bottom + 6; }
      }
      showButtonAt(x, y);
    }, 10);
  }

  document.addEventListener("mouseup", onSelectionSettled, true);
  document.addEventListener("keyup", (e) => {
    if (e.shiftKey || e.key === "a" || e.key.startsWith("Arrow")) onSelectionSettled(null);
  }, true);
  document.addEventListener("mousedown", (e) => {
    if (!host.contains(e.target) && e.composedPath()[0] !== readBtn) hideButton();
  }, true);
  document.addEventListener("scroll", () => { hideButton(); layout(); }, { passive: true, capture: true });
  window.addEventListener("resize", () => layout());

  readBtn.addEventListener("mousedown", (e) => e.preventDefault()); // keep selection
  readBtn.addEventListener("click", () => {
    const t = getSelectedText() || lastText;
    hideButton();
    if (t) send({ type: "read-text", text: t });
  });

  // ---- player ----
  let paused = false;
  pp.addEventListener("click", () => send({ type: "toggle-pause" }));
  $("stop").addEventListener("click", () => { send({ type: "stop" }); player.style.display = "none"; });
  $("close").addEventListener("click", () => { player.style.display = "none"; });
  speedEl.addEventListener("input", () => {
    const v = Number(speedEl.value);
    speedVal.textContent = v.toFixed(2).replace(/0$/, "") + "×";
    send({ type: "set-speed", speed: v });
    try { chrome.storage.sync.set({ speed: v }); } catch {}
  });

  function renderStatus(s) {
    if (!s) return;
    playback = s;
    layout();
    if (s.state === "idle") { player.style.display = "none"; return; }
    player.style.display = "block";
    sub.classList.toggle("err", s.state === "error");
    paused = s.state === "paused";
    pp.textContent = paused || s.state === "buffering" ? "▶" : "⏸";
    pp.title = s.state === "buffering" ? "Start now" : "Pause / resume (Alt+P)";
    speedEl.value = s.speed;
    speedVal.textContent = Number(s.speed).toFixed(2).replace(/0$/, "") + "×";
    const pos = s.total ? ` (${Math.min(s.index + 1, s.total)}/${s.total})` : "";
    if (s.state === "loading") { title.textContent = "Murmur"; sub.innerHTML = '<span class="spin"></span>Generating speech' + pos + "…"; }
    else if (s.state === "buffering") { title.textContent = "Getting ready"; sub.innerHTML = '<span class="spin"></span>Buffering for smooth playback' + (s.bufferEta ? " (~" + s.bufferEta + "s)" : "") + " – press ▶ to start now"; }
    else if (s.state === "playing") { title.textContent = "Reading aloud"; sub.textContent = "Playing" + pos; }
    else if (s.state === "paused") { title.textContent = "Paused"; sub.textContent = "Part" + pos; }
    else if (s.state === "error") { title.textContent = "Couldn't read"; sub.textContent = s.error; }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "get-selection") { sendResponse({ text: getSelectedText() }); }
    else if (msg.type === "get-page-text") { sendResponse({ text: pageText() }); }
    else if (msg.type === "status") { renderStatus(msg.status); }
  });
})();
