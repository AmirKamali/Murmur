---
title: Murmur
emoji: "🔊"
colorFrom: teal
colorTo: gray
sdk: static
app_file: index.html
pinned: false
license: mit
short_description: Local read-aloud Chrome extension powered by Kokoro-82M
---

# Murmur

A Chromium extension that reads a selection, a paragraph, or a page with a [Kokoro-82M](https://huggingface.co/amir-n3t/Kokoro-tts-82M) voice running on your machine.

**Code:** [github.com/AmirKamali/Murmur](https://github.com/AmirKamali/Murmur) · **Weights:** [amir-n3t/Kokoro-tts-82M](https://huggingface.co/amir-n3t/Kokoro-tts-82M)

Speech is synthesized locally by [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI). This Space is the project card. It does not host the weights and it does not speak: audio is generated at `http://127.0.0.1:8880`.

## Use it

Requirements: Git, [uv](https://docs.astral.sh/uv/), a Chromium browser, and a few GB of disk. espeak-ng is recommended. **macOS** and **Windows** are supported. **Linux is TBD.**

```bash
git clone https://github.com/AmirKamali/Murmur.git
cd Murmur
./server/start-murmur.sh          # macOS
# .\server\start-murmur.ps1       # Windows PowerShell
```

The first launch clones a pinned Kokoro-FastAPI commit and downloads the weights. On macOS the server uses the Apple GPU. On Windows it defaults to CPU; set `DEVICE_TYPE=cuda` or `cuda128` for NVIDIA.

Then open `chrome://extensions`, turn on Developer mode, and **Load unpacked** the `extension/` folder. Select text and press **Alt+R**.

## Voices

English (US and UK), Spanish, French, Hindi, Italian, Japanese, Brazilian Portuguese, and Mandarin, from the Kokoro-82M voice packs. Speed is 0.5×–3× and can change while audio is playing.

## Privacy

The extension’s host permission is `http://127.0.0.1/*` and `http://localhost/*`. Page text is sent when you ask for it to be read. There is no account and no analytics.

## License

Extension and launcher: MIT. Kokoro-82M and Kokoro-FastAPI: Apache-2.0.
