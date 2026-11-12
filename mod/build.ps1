param([switch]$GameTests)
$ErrorActionPreference = 'Stop'
$modRoot = $PSScriptRoot
$workspaceRoot = Split-Path -Parent $modRoot
$toolRoot = Join-Path $workspaceRoot '.tools'
$gradleVersion = '9.2.1'
$gradle = Join-Path $toolRoot "gradle-$gradleVersion\bin\gradle.bat"
if (-not (Test-Path -LiteralPath $gradle)) {
  New-Item -ItemType Directory -Path $toolRoot -Force | Out-Null
  $zipPath = Join-Path $toolRoot "gradle-$gradleVersion-bin.zip"
  $url = "https://services.gradle.org/distributions/gradle-$gradleVersion-bin.zip"
  if (-not (Test-Path -LiteralPath $zipPath)) { Invoke-WebRequest -Uri $url -OutFile $zipPath }
  $expectedHash = (Invoke-RestMethod -Uri "$url.sha256").Trim()
  $hashAlgorithm = [System.Security.Cryptography.SHA256]::Create()
  $zipStream = [System.IO.File]::OpenRead($zipPath)
  try { $actualHash = [BitConverter]::ToString($hashAlgorithm.ComputeHash($zipStream)).Replace('-', '') }
  finally { $zipStream.Dispose(); $hashAlgorithm.Dispose() }
  if ($expectedHash -notmatch '^[a-fA-F0-9]{64}$' -or $actualHash -ine $expectedHash) { throw 'Gradle distribution checksum mismatch' }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $toolRoot)
}
$buildArguments = @('build')
if ($GameTests) { $buildArguments += '-PbridgeGameTests' }
& $gradle --project-dir $modRoot --gradle-user-home (Join-Path $workspaceRoot '.gradle-builder') --no-daemon @buildArguments
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host 'Mod built:' (Join-Path $modRoot 'build\libs\voxel-build-bridge-0.1.0.jar')
