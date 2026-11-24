# Security

Murmur is a local speech tool. The server has no authentication and is meant to listen on loopback.

## Report a vulnerability

Open a private security advisory on [AmirKamali/Murmur](https://github.com/AmirKamali/Murmur) (**Security → Advisories → Report a vulnerability**). Include the version, the platform, and a way to reproduce the issue.

Please use that channel for anything that would let a website read data it should not, escape the extension sandbox, or reach a Kokoro server the user did not choose. Public issues are fine for crashes and ordinary bugs.

## What we consider in scope

- The extension sending page text somewhere other than the configured local server
- Content-script behavior that lets a page invoke reading or observe the spoken text without a user action
- The launcher binding a wider interface than `127.0.0.1` by default

The Kokoro model and Kokoro-FastAPI are separate projects. Report engine vulnerabilities to their maintainers.
