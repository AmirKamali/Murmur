import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

function loadClient() {
  const sandbox = { self: {}, console };
  runInContext(
    readFileSync(root + "extension/tts-client.js", "utf8"),
    createContext(sandbox),
  );
  return sandbox.self.MurmurTTS;
}

const MurmurTTS = loadClient();

test("short text stays one chunk and links are spoken as words", () => {
  const chunks = MurmurTTS.splitIntoChunks("See https://example.com/docs/page for the notes.");
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].includes("http"), false);
  assert.match(chunks[0], /link/);
  assert.match(chunks[0], /notes/);
});

test("a passage splits into more than one sentence-sized chunk", () => {
  const sentence = "The harbor stayed quiet while the light moved across the water.";
  const chunks = MurmurTTS.splitIntoChunks(Array.from({ length: 30 }, () => sentence).join(" "));
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(chunk.length > 0);
    assert.ok(chunk.length <= 400);
    assert.equal(chunk.includes("\u0000"), false);
  }
});

test("blank input produces no chunks", () => {
  // The array is created in a vm realm, so compare length rather than identity.
  assert.equal(MurmurTTS.splitIntoChunks("   \n\n  ").length, 0);
});

test("saved Fish Speech settings migrate to the local Kokoro server", () => {
  const settings = MurmurTTS.settingsFrom({
    serverUrl: "http://127.0.0.1:8765",
    voice: "old-reference",
    kokoroVoice: "af_bella",
  });
  assert.equal(settings.serverUrl, "http://127.0.0.1:8880");
  assert.equal(settings.voice, "af_bella");
  assert.equal(settings.smooth, true);
});

test("an explicit Kokoro voice and server URL are kept", () => {
  const settings = MurmurTTS.settingsFrom({
    serverUrl: "http://localhost:8880/",
    voice: "bf_emma",
    speed: 1.25,
    volume: 0.4,
    smooth: false,
    autoRead: true,
  });
  assert.equal(settings.serverUrl, "http://localhost:8880");
  assert.equal(settings.voice, "bf_emma");
  assert.equal(settings.speed, 1.25);
  assert.equal(settings.volume, 0.4);
  assert.equal(settings.smooth, false);
  assert.equal(settings.autoRead, true);
});

test("the extension may call only the local server", () => {
  const manifest = JSON.parse(readFileSync(root + "extension/manifest.json", "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["contextMenus", "storage", "offscreen", "activeTab"]);
  assert.deepEqual(manifest.host_permissions, ["http://127.0.0.1/*", "http://localhost/*"]);
  assert.ok(manifest.version);
});
