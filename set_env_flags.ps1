# Sets only these flags in .env: WINDOWS_MCP=1, BROWSER_AGENT=1, KOKORO_TTS=0. Every other line is left exactly as it is.
$p = Join-Path $PSScriptRoot '.env'
$lines = @()
if (Test-Path -LiteralPath $p) { $lines = @(Get-Content -LiteralPath $p) }
$flags = [ordered]@{ 'WINDOWS_MCP' = '1'; 'BROWSER_AGENT' = '1'; 'KOKORO_TTS' = '0' }
foreach ($k in $flags.Keys) {
  $v = $flags[$k]
  $found = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match ('^\s*' + $k + '\s*=')) { $lines[$i] = "$k=$v"; $found = $true }
  }
  if (-not $found) { $lines += "$k=$v" }
}
[System.IO.File]::WriteAllLines($p, [string[]]$lines, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Updated .env. Feature flags now (no other lines are shown):"
Get-Content -LiteralPath $p | Select-String -Pattern '^\s*(WINDOWS_MCP|BROWSER_AGENT|KOKORO_TTS|WAKEWORD_ENGINE)\s*='
