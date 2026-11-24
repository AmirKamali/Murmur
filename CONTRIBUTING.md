# Contributing

Issues and pull requests are welcome on [AmirKamali/Murmur](https://github.com/AmirKamali/Murmur).

## Setup

### macOS

1. `./server/start-murmur.sh` and leave it running.
2. Load `extension/` as an unpacked extension at `chrome://extensions`.
3. Reload the extension card after changing extension files. Reload the page too, because the content script is already injected.

### Windows

1. `.\server\start-murmur.ps1` in PowerShell and leave it running.
2. Load `extension/` as an unpacked extension at `chrome://extensions` or `edge://extensions`.

### Linux

Linux support is TBD.

`make check` runs the syntax checks, `node --test`, and `bash -n` on the Unix launcher. GitHub Actions runs the same checks.

## Scope

This repository is the extension and the launcher.

- Engine bugs belong in [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI).
- Voice and weight bugs belong with [Kokoro-tts-82M](https://huggingface.co/amir-n3t/Kokoro-tts-82M) / [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M).
- Do not commit `server/kokoro/`, virtualenvs, or `*.pth` weights. `.gitignore` already excludes them.

## Pull requests

Describe what changed and how you checked it. Keep the extension free of remote hosts: `extension/manifest.json` should keep loopback-only `host_permissions`. `tests/reader.test.mjs` locks that list.

The extension is plain JavaScript (no bundler). Match the surrounding style: two-space indent, and comments only where the control flow is easy to misread.
