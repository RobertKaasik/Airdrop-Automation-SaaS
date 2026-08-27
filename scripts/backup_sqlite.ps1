[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$DatabasePath,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$DestinationDirectory,

    [ValidateNotNullOrEmpty()]
    [string]$PythonExecutable = "python"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$sourceItem = Get-Item -LiteralPath (Resolve-Path -LiteralPath $DatabasePath) -ErrorAction Stop
if ($sourceItem.PSIsContainer) {
    throw "DatabasePath must point to a SQLite file."
}

$allowedExtensions = @(".db", ".sqlite", ".sqlite3")
$sourceExtension = [IO.Path]::GetExtension($sourceItem.Name).ToLowerInvariant()
if ($allowedExtensions -notcontains $sourceExtension) {
    throw "DatabasePath must end in .db, .sqlite, or .sqlite3."
}

$destinationPath = [IO.Path]::GetFullPath($DestinationDirectory)
if (Test-Path -LiteralPath $destinationPath) {
    $destinationItem = Get-Item -LiteralPath $destinationPath -ErrorAction Stop
    if (-not $destinationItem.PSIsContainer) {
        throw "DestinationDirectory must be a directory."
    }
} else {
    New-Item -ItemType Directory -Path $destinationPath -ErrorAction Stop | Out-Null
}

$helperPath = Join-Path -Path $PSScriptRoot -ChildPath "sqlite_backup.py"
if (-not (Test-Path -LiteralPath $helperPath -PathType Leaf)) {
    throw "SQLite backup helper is missing: $helperPath"
}

$timestamp = [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmssfff")
$sourceBaseName = [IO.Path]::GetFileNameWithoutExtension($sourceItem.Name)
$backupName = "$sourceBaseName-$timestamp-$PID.sqlite3"
$backupPath = Join-Path -Path $destinationPath -ChildPath $backupName
if (Test-Path -LiteralPath $backupPath) {
    throw "Refusing to overwrite existing backup: $backupPath"
}

& $PythonExecutable $helperPath --source $sourceItem.FullName --destination $backupPath
if ($LASTEXITCODE -ne 0) {
    throw "SQLite online backup failed with exit code $LASTEXITCODE. No source files were changed."
}

$backupStream = [IO.File]::OpenRead($backupPath)
try {
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        $hashBytes = $sha256.ComputeHash($backupStream)
        $hash = -join ($hashBytes | ForEach-Object { $_.ToString("x2") })
    } finally {
        $sha256.Dispose()
    }
} finally {
    $backupStream.Dispose()
}
$manifestPath = "$backupPath.sha256"
"$hash  $backupName" | Set-Content -LiteralPath $manifestPath -Encoding ascii -NoNewline

Write-Output "Backup created and integrity-checked: $backupPath"
Write-Output "SHA-256 manifest: $manifestPath"
