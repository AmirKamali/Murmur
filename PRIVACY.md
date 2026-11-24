# Privacy

Murmur reads page text only after you ask it to, and sends that text to a speech server you run.

## What the extension can see

The content script is injected into ordinary web pages so it can offer a Read button. It reads:

- text you select, when you click Read, press `Alt+R`, or use the context menu
- the paragraph under the pointer, when you click its Read control
- article text, when you use Read page or the page context menu (capped at 40,000 characters)

It does not send text because a page loaded, because you moved the pointer, or on a timer.

## Where text goes

Requests go to the server URL in Settings. The default is `http://127.0.0.1:8880`. The manifest allows only `http://127.0.0.1/*` and `http://localhost/*`. A different host requires editing the extension.

The local server turns text into audio and returns a WAV. That audio is played inside the extension. Changing the server URL to another machine on your network sends the passage there. The server has no authentication.

## What is stored

Chrome sync storage holds your settings: server URL, voice id, speed, volume, and the on/off switches. Session storage holds which tab started the current reading, so pause and status can be shown on that tab. Nothing is written to a project server. There is no account and no analytics.

## Permissions

| Permission | Why |
| --- | --- |
| `activeTab` | Read the selection in the tab you invoked the extension from |
| `contextMenus` | “Read aloud” items in the right-click menu |
| `storage` | Remember voice, speed, and the other settings |
| `offscreen` | Play audio after the service worker goes idle |
| `http://127.0.0.1/*`, `http://localhost/*` | Call the local speech server |

The extension does not request `tabs`, history, cookies, or a broad host permission.
