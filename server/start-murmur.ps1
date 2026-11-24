# Local Kokoro-FastAPI for Murmur (Windows).
# Listens on loopback. The Chrome / Edge extension calls http://127.0.0.1:8880.
#
# First run clones a pinned Kokoro-FastAPI checkout, creates a virtualenv,
# and downloads the Kokoro-82M weights from Hugging Face.
#
#   .\server\start-murmur.ps1
#
# Device (default: cpu):
#   $env:DEVICE_TYPE = "cpu" | "cuda" | "cuda128"
#
# Other environment variables:
#   HOST           default 127.0.0.1
#   KOKORO_PORT    default 8880
#   KOKORO_REPO    default https://github.com/remsky/Kokoro-FastAPI
#   KOKORO_REF     pinned commit to fetch when server/kokoro is missing

$ErrorActionPreference = "Stop"
$env:PYTHONUTF8 = "1"

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Join-Path $Here "kokoro"
$KokoroRepo = if ($env:KOKORO_REPO) { $env:KOKORO_REPO } else { "https://github.com/remsky/Kokoro-FastAPI" }
# Kokoro-FastAPI 0.10.1-rc1 (master, 2026-11-13). Override to move the pin.
$KokoroRef = if ($env:KOKORO_REF) { $env:KOKORO_REF } else { "3c0d616d75ad542a4ff87fa6a3026720888f809a" }

function Require-Command([string]$Name, [string]$Hint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Write-Error "$Name is required. $Hint"
  }
}

Require-Command "git" "Install Git for Windows from https://git-scm.com/download/win"
Require-Command "uv" "Install uv from https://docs.astral.sh/uv/ and reopen this terminal."

$PyProject = Join-Path $Root "pyproject.toml"
if (-not (Test-Path $PyProject)) {
  if (Test-Path $Root) {
    Write-Error "server/kokoro exists but is not a Kokoro-FastAPI checkout. Move that directory aside, then run this script again."
  }
  Write-Host "Fetching Kokoro-FastAPI @ $KokoroRef…"
  New-Item -ItemType Directory -Path $Root -Force | Out-Null
  try {
    git -C $Root init -q
    git -C $Root remote add origin $KokoroRepo
    git -C $Root fetch --depth 1 origin $KokoroRef
    git -C $Root checkout --detach --quiet FETCH_HEAD
  } catch {
    Remove-Item -Recurse -Force $Root -ErrorAction SilentlyContinue
    Write-Error "Could not fetch $KokoroRepo at $KokoroRef."
  }
}

Set-Location $Root

$Device = if ($env:DEVICE_TYPE) { $env:DEVICE_TYPE.ToLowerInvariant() } else { "cpu" }
switch ($Device) {
  "cpu" { $Extra = "cpu"; $UseGpu = "false" }
  "cuda" { $Extra = "gpu"; $UseGpu = "true" }
  "cuda128" { $Extra = "gpu-cu128"; $UseGpu = "true" }
  "mps" { Write-Error "DEVICE_TYPE=mps is macOS-only. On Windows use cpu, cuda, or cuda128." }
  "rocm" { Write-Error "DEVICE_TYPE=rocm is not supported on Windows for Murmur yet." }
  default { Write-Error "Unknown DEVICE_TYPE=$Device (use cpu, cuda, or cuda128)." }
}

$VenvPython = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
  Write-Host "Creating the Kokoro environment (first run, a few minutes)…"
  uv sync --python 3.12 --extra $Extra
}

$Weights = Join-Path $Root "api\src\models\v1_0\kokoro-v1_0.pth"
if (-not (Test-Path $Weights)) {
  Write-Host "Downloading Kokoro-82M weights from Hugging Face…"
  & $VenvPython "docker\scripts\download_model.py" --output "api\src\models\v1_0"
}

$EspeakDll = "C:\Program Files\eSpeak NG\libespeak-ng.dll"
if (Test-Path $EspeakDll) {
  $env:PHONEMIZER_ESPEAK_LIBRARY = $EspeakDll
} else {
  Write-Host "Note: eSpeak NG was not found at '$EspeakDll'. Install it if unfamiliar words sound wrong."
}

$env:USE_GPU = $UseGpu
$env:DEVICE_TYPE = $Device
$env:PYTHONPATH = "$Root;$Root\api"
$env:MODEL_DIR = "$Root\api\src\models"
$env:VOICES_DIR = "$Root\api\src\voices\v1_0"
$env:WEB_PLAYER_PATH = "$Root\web"

$HostAddr = if ($env:HOST) { $env:HOST } else { "127.0.0.1" }
$Port = if ($env:KOKORO_PORT) { $env:KOKORO_PORT } else { "8880" }
if ($HostAddr -notin @("127.0.0.1", "localhost", "::1")) {
  Write-Warning "HOST=$HostAddr is reachable beyond this machine, and the server has no authentication."
}

$ShortRef = $KokoroRef.Substring(0, [Math]::Min(7, $KokoroRef.Length))
try { $ShortRef = (git -C $Root rev-parse --short HEAD).Trim() } catch {}
$ActualRef = ""
try { $ActualRef = (git -C $Root rev-parse HEAD).Trim() } catch {}

Write-Host "Murmur"
Write-Host "  engine  Kokoro-FastAPI @ $ShortRef"
Write-Host "  device  $Device"
Write-Host "  url     http://${HostAddr}:${Port}"
if ($ActualRef -and $ActualRef -ne $KokoroRef) {
  Write-Host "  note    this checkout is $ActualRef"
  Write-Host "          the pin in this script is $KokoroRef"
}
Write-Host "Starting. Leave this window open."

& $VenvPython -m uvicorn api.src.main:app --host $HostAddr --port $Port
