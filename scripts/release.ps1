param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^\d+\.\d+\.\d+$')]
  [string]$Version,

  [switch]$SkipPush,
  [switch]$Draft
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $FilePath $($Arguments -join ' ')"
  }
}

function Get-GitOutput {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
  )

  $output = & git @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Git command failed: git $($Arguments -join ' ')"
  }
  return $output
}

$repoRoot = (Get-GitOutput rev-parse --show-toplevel | Select-Object -First 1).Trim()
Set-Location $repoRoot

$tagName = "v$Version"
$currentBranch = (Get-GitOutput branch --show-current | Select-Object -First 1).Trim()
if (-not $currentBranch) {
  throw "Cannot release from detached HEAD."
}

$dirty = Get-GitOutput status --porcelain
if ($dirty) {
  throw "Working tree is not clean. Commit or stash changes before releasing."
}

$existingTag = & git tag --list $tagName
if ($LASTEXITCODE -ne 0) {
  throw "Failed to check existing tags."
}
if ($existingTag) {
  throw "Tag $tagName already exists."
}

$manifestPath = Join-Path $repoRoot "manifest.json"
$manifest = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json
$oldVersion = [string]$manifest.version
$manifest.version = $Version
$manifest |
  ConvertTo-Json -Depth 20 |
  Set-Content -Path $manifestPath -Encoding utf8

$previousTag = (& git describe --tags --abbrev=0 --match "v*" 2>$null)
if ($LASTEXITCODE -ne 0) {
  $previousTag = ""
}
$previousTag = [string]$previousTag

if ($previousTag) {
  $changeLines = & git log "$previousTag..HEAD" --pretty=format:"- %s"
} else {
  $changeLines = & git log --pretty=format:"- %s"
}
if (-not $changeLines) {
  $changeLines = @("- Version bump from $oldVersion to $Version.")
}

$releaseNotes = @(
  "# Release $tagName",
  "",
  "## Changes",
  ""
) + $changeLines + @(
  "",
  "## Notes",
  "",
  "- Reload the extension after updating."
)
$releaseNotes -join "`r`n" | Set-Content -Path (Join-Path $repoRoot "RELEASE.md") -Encoding utf8

Invoke-Checked npm test
$packagePath = (& (Join-Path $repoRoot "scripts\package-extension.ps1") -Version $Version | Select-Object -Last 1)
if (-not (Test-Path $packagePath)) {
  throw "Package was not created: $packagePath"
}
Invoke-Checked git add manifest.json RELEASE.md
Invoke-Checked git commit -m "Release $tagName" -m "Changes:`n$($changeLines -join "`n")"
Invoke-Checked git tag -a $tagName -m "Release $tagName"

if (-not $SkipPush) {
  Invoke-Checked git push origin $currentBranch
  Invoke-Checked git push origin $tagName

  $ghArgs = @("release", "create", $tagName, $packagePath, "--notes-file", "RELEASE.md", "--title", "Release $tagName")
  if ($Draft) {
    $ghArgs += "--draft"
  }
  Invoke-Checked gh @ghArgs
}

Write-Host "Prepared release $tagName."
