#!/usr/bin/env bash
# Local Kokoro-FastAPI for Murmur.
# Listens on loopback. The Chrome extension calls http://127.0.0.1:8880.
#
# First run clones a pinned Kokoro-FastAPI checkout, creates a virtualenv,
# and downloads the Kokoro-82M weights from Hugging Face.
#
#   ./server/start-murmur.sh
#
# Device (default: mps on macOS, cpu elsewhere):
#   DEVICE_TYPE=mps|cpu|cuda|cuda128|rocm
# cuda128 is the PyTorch cu128 extra for NVIDIA RTX 50-series / Blackwell.
#
# Other environment variables:
#   HOST           default 127.0.0.1
#   KOKORO_PORT    default 8880
#   KOKORO_REPO    default https://github.com/remsky/Kokoro-FastAPI
#   KOKORO_REF     pinned commit to fetch when server/kokoro is missing
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$HERE/kokoro"
KOKORO_REPO="${KOKORO_REPO:-https://github.com/remsky/Kokoro-FastAPI}"
# Kokoro-FastAPI 0.10.1-rc1 (master, 2026-11-13). Override to move the pin.
KOKORO_REF="${KOKORO_REF:-3c0d616d75ad542a4ff87fa6a3026720888f809a}"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required to fetch Kokoro-FastAPI." >&2
  exit 1
fi
if ! command -v uv >/dev/null 2>&1; then
  echo "uv is required. Install it from https://docs.astral.sh/uv/ and run this again." >&2
  exit 1
fi

if [ ! -f "$ROOT/pyproject.toml" ]; then
  if [ -e "$ROOT" ]; then
    echo "server/kokoro exists but is not a Kokoro-FastAPI checkout." >&2
    echo "Move that directory aside, then run this script again." >&2
    exit 1
  fi
  echo "Fetching Kokoro-FastAPI @ ${KOKORO_REF}…"
  mkdir -p "$ROOT"
  if ! git -C "$ROOT" init -q \
    || ! git -C "$ROOT" remote add origin "$KOKORO_REPO" \
    || ! git -C "$ROOT" fetch --depth 1 origin "$KOKORO_REF" \
    || ! git -C "$ROOT" checkout --detach --quiet FETCH_HEAD; then
    rm -rf "$ROOT"
    echo "Could not fetch ${KOKORO_REPO} at ${KOKORO_REF}." >&2
    exit 1
  fi
fi

cd "$ROOT"

OS="$(uname -s)"
case "$OS" in
  Darwin) ;;
  Linux)
    echo "Linux support for Murmur is TBD. Track progress at https://github.com/AmirKamali/Murmur/issues" >&2
    echo "You can still force a start with DEVICE_TYPE=cpu (or cuda / cuda128 / rocm) if you want to experiment." >&2
    if [ -z "${DEVICE_TYPE:-}" ]; then
      exit 1
    fi
    ;;
  MINGW*|MSYS*|CYGWIN*)
    echo "On Windows use PowerShell: .\\server\\start-murmur.ps1" >&2
    exit 1
    ;;
esac

if [ -z "${DEVICE_TYPE:-}" ]; then
  if [ "$OS" = "Darwin" ]; then
    DEVICE_TYPE="mps"
  else
    DEVICE_TYPE="cpu"
  fi
fi

case "$DEVICE_TYPE" in
  mps) EXTRA="" USE_GPU=true ;;
  cpu) EXTRA="cpu" USE_GPU=false ;;
  cuda) EXTRA="gpu" USE_GPU=true ;;
  cuda128) EXTRA="gpu-cu128" USE_GPU=true ;;
  rocm) EXTRA="rocm" USE_GPU=true ;;
  *)
    echo "Unknown DEVICE_TYPE=$DEVICE_TYPE (use mps, cpu, cuda, cuda128, or rocm)." >&2
    exit 1
    ;;
esac

if [ ! -x .venv/bin/python ]; then
  echo "Creating the Kokoro environment (first run, a few minutes)…"
  if [ -z "$EXTRA" ]; then
    # Apple GPU uses the default install. The mps device is selected below.
    uv venv --python 3.12 .venv
    uv pip install --python .venv/bin/python -e .
  else
    uv sync --python 3.12 --extra "$EXTRA"
  fi
fi

if [ ! -f api/src/models/v1_0/kokoro-v1_0.pth ]; then
  echo "Downloading Kokoro-82M weights from Hugging Face…"
  .venv/bin/python docker/scripts/download_model.py --output api/src/models/v1_0
fi

if ! command -v espeak-ng >/dev/null 2>&1; then
  echo "Note: espeak-ng is not on PATH. Install it if unfamiliar words sound wrong."
fi

export USE_GPU
export DEVICE_TYPE
if [ "$DEVICE_TYPE" = "mps" ]; then
  export PYTORCH_ENABLE_MPS_FALLBACK=1
fi
export PYTHONPATH="$ROOT:$ROOT/api"
export MODEL_DIR="$ROOT/api/src/models"
export VOICES_DIR="$ROOT/api/src/voices/v1_0"
export WEB_PLAYER_PATH="$ROOT/web"

HOST="${HOST:-127.0.0.1}"
PORT="${KOKORO_PORT:-8880}"
case "$HOST" in
  127.0.0.1|localhost|::1) ;;
  *)
    echo "Warning: HOST=$HOST is reachable beyond this machine, and the server has no authentication."
    ;;
esac

SHORT_REF="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo "$KOKORO_REF")"
ACTUAL_REF="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo "")"
echo "Murmur"
echo "  engine  Kokoro-FastAPI @ ${SHORT_REF}"
echo "  device  ${DEVICE_TYPE}"
echo "  url     http://${HOST}:${PORT}"
if [ -n "$ACTUAL_REF" ] && [ "$ACTUAL_REF" != "$KOKORO_REF" ]; then
  echo "  note    this checkout is ${ACTUAL_REF}"
  echo "          the pin in this script is ${KOKORO_REF}"
fi
echo "Starting. Leave this terminal open."

exec .venv/bin/python -m uvicorn api.src.main:app --host "$HOST" --port "$PORT"
