// Service worker: wires up the context menu, keyboard shortcuts and message routing.
// Audio generation + playback lives in the offscreen document (offscreen.js) because
// service workers can't play audio and are killed when idle.

importScripts("tts-client.js");

const OFFSCREEN_URL = "offscreen.html";

async function getSettings() {
  return MurmurTTS.settingsFrom(await chrome.storage.sync.get(null));
}

// ---------- offscreen document ----------
let creating = null;
async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });
  if (existing.length) return;
  if (!creating) {
    creating = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_URL,
        reasons: ["AUDIO_PLAYBACK", "BLOBS"],
        justification: "Play synthesized speech (as blob audio) for the selected text.",
      })
      .finally(() => (creating = null));
  }
  await creating;
}

async function toOffscreen(msg) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ target: "offscreen", ...msg });
}

// ---------- state shared with UI (popup / content script) ----------
// Which tab started the current reading, so we can relay status to its content script.
async function getOwnerTab() {
  return (await chrome.storage.session.get("ownerTabId")).ownerTabId ?? null;
}

async function startReading(text, tabId, origin) {
  text = (text || "").trim();
  if (!text) return { ok: false, error: "No text selected." };
  await chrome.storage.session.set({
    ownerTabId: tabId ?? null,
    readSource: origin?.source || "",
    readSourceId: origin?.sourceId || "",
  });
  const settings = await getSettings();
  await toOffscreen({ type: "speak", text, settings });
  return { ok: true };
}

async function getSelectionFromTab(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: "get-selection" });
    return res?.text || "";
  } catch {
    return "";
  }
}

// ---------- context menu ----------
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "read-selection",
      title: "Read “%s” aloud",
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "read-page",
      title: "Read this page aloud",
      contexts: ["page"],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "read-selection") {
    await startReading(info.selectionText, tab?.id, { source: "selection" });
  } else if (info.menuItemId === "read-page" && tab?.id) {
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: "get-page-text" });
      await startReading(res?.text, tab.id, { source: "page", sourceId: "page" });
    } catch (e) {
      console.warn("Could not read page text", e);
    }
  }
});

// ---------- keyboard shortcuts ----------
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (command === "read-selection" && tab?.id) {
    const text = await getSelectionFromTab(tab.id);
    await startReading(text, tab.id, { source: "selection" });
  } else if (command === "toggle-pause") {
    await toOffscreen({ type: "toggle-pause" });
  } else if (command === "stop-reading") {
    await toOffscreen({ type: "stop" });
  }
});

// ---------- messages ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target === "offscreen") return; // not for us

  (async () => {
    switch (msg.type) {
      // From content script / popup
      case "read-text": {
        const tabId = msg.tabId ?? sender.tab?.id ?? null;
        sendResponse(await startReading(msg.text, tabId, { source: msg.source || "", sourceId: msg.sourceId || "" }));
        break;
      }
      case "read-active-selection": {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const text = tab?.id ? await getSelectionFromTab(tab.id) : "";
        sendResponse(await startReading(text, tab?.id, { source: "selection" }));
        break;
      }
      case "pause":
      case "resume":
      case "toggle-pause":
      case "stop":
      case "set-speed":
      case "set-volume":
      case "get-status": {
        sendResponse(await toOffscreen(msg));
        break;
      }
      // From offscreen: relay status to the tab that started the reading.
      case "status": {
        const tabId = await getOwnerTab();
        const origin = await chrome.storage.session.get(["readSource", "readSourceId"]);
        const status = {
          ...msg.status,
          source: origin.readSource || "",
          sourceId: origin.readSourceId || "",
        };
        if (tabId != null) {
          chrome.tabs.sendMessage(tabId, { type: "status", status }).catch(() => {});
        }
        sendResponse({ ok: true });
        break;
      }
      default:
        sendResponse({ ok: false, error: "unknown message" });
    }
  })();
  return true; // async response
});
