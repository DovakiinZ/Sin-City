$ErrorActionPreference = 'Stop'
if (-not (Test-Path .preview.pid)) {
  Write-Host "No .preview.pid file found; nothing to stop."
  exit 0
}
$previewPid = Get-Content .preview.pid | Select-Object -First 1
if ([string]::IsNullOrWhiteSpace($previewPid)) {
  Write-Host "PID file empty; nothing to stop."
  Remove-Item .preview.pid -ErrorAction SilentlyContinue
  exit 0
}
Write-Host "Stopping preview process PID ${previewPid} ..."
try {
  Stop-Process -Id ([int]$previewPid) -Force -ErrorAction Stop
  Write-Host "Stopped."
} catch {
  Write-Host "Could not stop PID ${previewPid}: $($_.Exception.Message)"
}
Remove-Item .preview.pid -ErrorAction SilentlyContinue
