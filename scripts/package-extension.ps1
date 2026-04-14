param(
  [ValidatePattern('^\d+\.\d+\.\d+$')]
  [string]$Version = "",

  [string]$OutputDir = "dist"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-RepoRoot {
  $root = & git rev-parse --show-toplevel
  if ($LASTEXITCODE -eq 0 -and $root) {
    return ($root | Select-Object -First 1).Trim()
  }
  return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$repoRoot = Get-RepoRoot
$manifestPath = Join-Path $repoRoot "manifest.json"
$manifest = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json
if (-not $Version) {
  $Version = [string]$manifest.version
}

$outputRoot = Join-Path $repoRoot $OutputDir
$tempRoot = Join-Path $outputRoot "package-work"
$zipPath = Join-Path $outputRoot "LLM-Translator-v$Version.zip"

if (Test-Path $tempRoot) {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $tempRoot "manifest.json")
Copy-Item -LiteralPath (Join-Path $repoRoot "src") -Destination (Join-Path $tempRoot "src") -Recurse

if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $tempRoot "*") -DestinationPath $zipPath -CompressionLevel Optimal
Remove-Item -LiteralPath $tempRoot -Recurse -Force

$zip = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  $entries = @($zip.Entries | ForEach-Object { $_.FullName })
  $requiredEntries = @("manifest.json", "src/background.js", "src/markdown.js")
  foreach ($entry in $requiredEntries) {
    if ($entries -notcontains $entry) {
      throw "Package is missing required entry: $entry"
    }
  }

  $forbidden = $entries | Where-Object {
    $_ -match '(^|[\\/])(?:\.git|docs|tests|scripts|dist|node_modules)([\\/]|$)' -or
    $_ -match '(^|[\\/])(?:package(?:-lock)?\.json|README\.md|RELEASE\.md)$'
  }
  if ($forbidden) {
    throw "Package contains forbidden entries: $($forbidden -join ', ')"
  }
} finally {
  $zip.Dispose()
}

Write-Output $zipPath
