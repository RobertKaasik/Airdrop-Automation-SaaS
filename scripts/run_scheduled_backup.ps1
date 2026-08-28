[CmdletBinding()]
param(
    [string]$DestinationDirectory = "C:\AIRDROP-X-backups",
    [string]$PythonExecutable = "C:\Users\robiii\AppData\Local\Programs\Python\Python312\python.exe"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$databasePath = Join-Path $projectRoot "airdrop_x.db"
$backupScript = Join-Path $PSScriptRoot "backup_sqlite.ps1"
$logDirectory = Join-Path $DestinationDirectory "logs"
$logPath = Join-Path $logDirectory "sqlite-backup.log"

New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

try {
    $timestamp = [DateTime]::UtcNow.ToString("o")
    "[$timestamp] Starting verified SQLite backup." | Add-Content -LiteralPath $logPath -Encoding utf8
    $backupOutput = & $backupScript `
        -DatabasePath $databasePath `
        -DestinationDirectory $DestinationDirectory `
        -PythonExecutable $PythonExecutable 2>&1
    $backupOutput | ForEach-Object {
        $_.ToString() | Add-Content -LiteralPath $logPath -Encoding utf8
    }
    if ($LASTEXITCODE -ne 0) {
        throw "SQLite backup helper exited with code $LASTEXITCODE."
    }
    "[$([DateTime]::UtcNow.ToString('o'))] Backup completed." | Add-Content -LiteralPath $logPath -Encoding utf8
} catch {
    "[$([DateTime]::UtcNow.ToString('o'))] Backup failed: $($_.Exception.Message)" | Add-Content -LiteralPath $logPath -Encoding utf8
    throw
}
