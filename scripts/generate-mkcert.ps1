# generate-mkcert.ps1
# Usage: Run as Administrator in PowerShell from project root:
#   powershell -ExecutionPolicy Bypass -File .\scripts\generate-mkcert.ps1

param(
  [string]$CertDir = "./certs"
)

function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red }

# Ensure running from project root
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
Push-Location $scriptRoot | Out-Null

# Resolve cert dir
$certDirFull = Resolve-Path -LiteralPath (Join-Path $scriptRoot ".." | Resolve-Path).Path | ForEach-Object { Join-Path $_ $CertDir }
if (-not (Test-Path $certDirFull)) {
  New-Item -ItemType Directory -Path $certDirFull -Force | Out-Null
}

# Check for mkcert
if (-not (Get-Command mkcert -ErrorAction SilentlyContinue)) {
  Write-Warn "mkcert not found on PATH. Attempting to install via Chocolatey..."
  if (Get-Command choco -ErrorAction SilentlyContinue) {
    Write-Info "Installing mkcert via choco (this requires admin privileges)..."
    choco install mkcert -y
  } else {
    Write-Err "Chocolatey not found. Please install mkcert manually from https://github.com/FiloSottile/mkcert and re-run this script."
    exit 1
  }
}

# Ensure mkcert is available now
if (-not (Get-Command mkcert -ErrorAction SilentlyContinue)) {
  Write-Err "mkcert still not available. Aborting."
  exit 1
}

# Install local CA if necessary
Write-Info "Installing local mkcert CA (if not already installed)..."
mkcert -install

# Gather local IPv4 addresses (exclude loopback and APIPA 169.254.x.x)
$ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
  $_.IPAddress -notmatch '^(127|169)\.' -and $_.InterfaceOperationalStatus -eq 'Up'
} | Select-Object -ExpandProperty IPAddress -ErrorAction SilentlyContinue

$hosts = @('localhost','127.0.0.1','::1') + ($ips | Sort-Object -Unique)

Write-Info "Found hosts to include in cert: $($hosts -join ', ')"

$certPath = Join-Path $certDirFull 'localhost.pem'
$keyPath = Join-Path $certDirFull 'localhost-key.pem'

$args = @('-cert-file', $certPath, '-key-file', $keyPath) + $hosts

Write-Info "Generating certs in: $certDirFull"
mkcert @args

if ($LASTEXITCODE -eq 0) {
  Write-Info "Certificates generated successfully."
  Write-Info "Files created:"
  Write-Host "  $certPath" -ForegroundColor Green
  Write-Host "  $keyPath" -ForegroundColor Green
  Write-Info "Now run: npm run dev and use the https://<your-ip>:5173 URL printed by Vite."
} else {
  Write-Err "mkcert failed (exit code $LASTEXITCODE). Check mkcert output above for details."
}

Pop-Location | Out-Null
