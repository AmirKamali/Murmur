# Murmur

Highlight text on any page and hear it from a local [Kokoro-82M](https://huggingface.co/amir-n3t/Kokoro-tts-82M) voice. Pick a voice and a speed. Speech is synthesized on your machine by [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI).

**GitHub:** [AmirKamali/Murmur](https://github.com/AmirKamali/Murmur) · **Weights:** [amir-n3t/Kokoro-tts-82M](https://huggingface.co/amir-n3t/Kokoro-tts-82M)

```
Chrome extension  -- HTTP 127.0.0.1:8880 -->  Kokoro-FastAPI  -->  Kokoro-82M
```

The extension runs in Chrome, Edge, Brave, and other Chromium browsers (Manifest V3, Chrome 109+). Firefox is unsupported: playback uses the offscreen-document API.

## Features

- Read a selection, the paragraph under the pointer, or the article on the page.
- Kokoro’s built-in voices, grouped by language: English (US and UK), Spanish, French, Hindi, Italian, Japanese, Brazilian Portuguese, and Mandarin.
- Speed from 0.5× to 3×, including while a clip is already playing. Volume in the popup.
- Sentence chunking with lookahead, so the next sentence is generated while the current one plays.
- Optional smooth start: playback can wait up to 12 seconds so a long passage does not stall between sentences. Press play in the player to skip that wait.
- Shortcuts: `Alt+R` read selection, `Alt+P` pause or resume, `Alt+S` stop. Rebind them at `chrome://extensions/shortcuts`.

## Requirements

- **macOS** (supported) and **Windows** (supported)
- **Linux:** TBD
- [Git](https://git-scm.com/)
- [uv](https://docs.astral.sh/uv/) (it installs Python 3.12 for the server)
- A Chromium browser
- [espeak-ng](https://github.com/espeak-ng/espeak-ng), recommended so unfamiliar words phonemize cleanly
- A few GB of disk for PyTorch and the weights (about 300 MB for `kokoro-v1_0.pth`, plus the voice packs)

Device defaults:

| Machine | Default | Override |
| --- | --- | --- |
| macOS | Apple GPU (`mps`) | `DEVICE_TYPE=cpu` |
| Windows | CPU | `DEVICE_TYPE=cuda` for NVIDIA, `DEVICE_TYPE=cuda128` for RTX 50-series |
| Linux | TBD | — |

## Quick start

### macOS

From the repository root, start the server and leave the terminal open. The first launch clones a pinned Kokoro-FastAPI commit, builds a virtualenv, and downloads the weights from Hugging Face.

```bash
./server/start-murmur.sh
```

NVIDIA example (when running on a machine with CUDA):

```bash
DEVICE_TYPE=cuda ./server/start-murmur.sh
```

### Windows

Install [Git for Windows](https://git-scm.com/download/win), [uv](https://docs.astral.sh/uv/), and preferably [eSpeak NG](https://github.com/espeak-ng/espeak-ng/releases) (default path `C:\Program Files\eSpeak NG\`). Then in PowerShell from the repository root:

```powershell
.\server\start-murmur.ps1
```

NVIDIA:

```powershell
$env:DEVICE_TYPE = "cuda"
.\server\start-murmur.ps1
```

### Load the extension

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. **Load unpacked** and choose the `extension/` folder.
4. Pin **Murmur**. After you change the extension files, press reload on that card.

Health check: the dot in the popup is green when `http://127.0.0.1:8880/health` answers. The same check is under **Settings**.

### Read something

- Select text, then click the floating **Read** button, press **Alt+R**, or right-click and choose **Read “…” aloud**.
- Right-click a page with nothing selected and choose **Read this page aloud**. Page text is taken from `<article>`, then `<main>`, then the body, and capped at 40,000 characters.
- In the popup, **Display Read on paragraphs** puts a control in the margin of the paragraph under the pointer. **Display Read on page** keeps a **Read page** button at the bottom-left. While that passage is playing, the button becomes pause and a stop button appears beside it.

Settings (right-click the toolbar icon, or the Settings link in the popup) also cover the server URL, a voice preview, smooth playback, the highlight button, and “start reading as soon as I highlight.”

On Apple Silicon, generation is often faster than real time, so a sentence is ready before the previous one finishes. Pressing stop cancels generation within about a second.

## Privacy

Page text is sent only to the server URL in Settings, which defaults to `http://127.0.0.1:8880`. The extension’s host permission is limited to loopback. There is no account, analytics, or remote script. Details are in [PRIVACY.md](PRIVACY.md).

The server process listens on `127.0.0.1` unless you set `HOST`. It has no authentication. Keep `HOST` on loopback.

## Layout

| Path | What |
| --- | --- |
| `extension/` | Chromium extension (Manifest V3) |
| `server/start-murmur.sh` | macOS / Unix launcher for Kokoro-FastAPI |
| `server/start-murmur.ps1` | Windows PowerShell launcher |
| `server/kokoro/` | Local engine checkout, virtualenv, and weights. Gitignored. |
| `huggingface/` | Static [Hugging Face Space](https://huggingface.co/docs/hub/spaces-overview) card |
| `tests/` | Node tests for chunking, settings migration, and the manifest |

`make serve` starts the server on macOS. `make check` runs syntax checks and `node --test`.

### Moving the engine pin

`KOKORO_REF` in `server/start-murmur.sh` (and the matching value in `start-murmur.ps1`) is the commit fetched when `server/kokoro/` is missing. An existing checkout is left as-is. To update it:

```bash
git -C server/kokoro fetch origin
git -C server/kokoro checkout <commit>
rm -rf server/kokoro/.venv   # only if dependencies changed
./server/start-murmur.sh
```

Deleting `server/kokoro/` and starting again re-downloads the weights.

## Credits and licenses

Code in this repository is [MIT](LICENSE). See [NOTICE](NOTICE).

| Piece | Project | License |
| --- | --- | --- |
| Voice model and packs | [amir-n3t/Kokoro-tts-82M](https://huggingface.co/amir-n3t/Kokoro-tts-82M) (upstream [hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)) | Apache-2.0 |
| Local HTTP server | [remsky/Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) | Apache-2.0 |
| Model package | [hexgrad/kokoro](https://github.com/hexgrad/kokoro) | Apache-2.0 |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md).
