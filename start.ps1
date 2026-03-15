param(
  [int]$Port = 8000
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

if (Get-Command python -ErrorAction SilentlyContinue) {
  Write-Host "Serving site at http://localhost:$Port"
  python -m http.server $Port
  exit $LASTEXITCODE
}

if (Get-Command py -ErrorAction SilentlyContinue) {
  Write-Host "Serving site at http://localhost:$Port"
  py -m http.server $Port
  exit $LASTEXITCODE
}

Write-Error "Python was not found. Install Python or run with the Python launcher ('py')."
