$ErrorActionPreference = "SilentlyContinue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Data = if ($env:BME_DATA_DIR) { $env:BME_DATA_DIR } else { Join-Path $Root "data" }
$OneDrive = Join-Path $env:USERPROFILE "OneDrive"
if (!(Test-Path $OneDrive)) { exit 0 }

$Target = Join-Path $OneDrive "Paolo-Samut-Prakan-BME-Backup"
$Mirror = Join-Path $Target "latest-data"
$Snapshots = Join-Path $Target "snapshots"
New-Item -ItemType Directory -Path $Mirror -Force | Out-Null
New-Item -ItemType Directory -Path $Snapshots -Force | Out-Null

Copy-Item -LiteralPath (Join-Path $Data "database.json") -Destination (Join-Path $Mirror "database.json") -Force
foreach ($folder in @("uploads", "generated", "completed")) {
  $from = Join-Path $Data $folder
  $to = Join-Path $Mirror $folder
  if (Test-Path $from) {
    New-Item -ItemType Directory -Path $to -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $from "*") -Destination $to -Recurse -Force -ErrorAction SilentlyContinue
  }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$snapshot = Join-Path $Snapshots "database-$stamp.json"
Copy-Item -LiteralPath (Join-Path $Data "database.json") -Destination $snapshot -Force
Get-ChildItem -LiteralPath $Snapshots -Filter "database-*.json" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 60 |
  Remove-Item -Force

@(
  "Last backup: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
  "Scope: ONLY this system data folder",
  "Source: $Data",
  "Mirror folder: $Mirror",
  "Database snapshot: $snapshot",
  "This folder is synced by OneDrive if OneDrive is signed in.",
  "This script does NOT backup the whole computer."
) | Set-Content -LiteralPath (Join-Path $Target "LAST_BACKUP.txt") -Encoding UTF8
