$ErrorActionPreference = 'Stop'
$port = 5174
Write-Host "Starting preview on http://localhost:$port ..."
$proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm","run","preview","--","--port",$port,"--strictPort" -PassThru
$proc.Id | Out-File -Encoding ascii -FilePath ".preview.pid"
Start-Sleep -Seconds 2
Write-Host ("Preview PID: {0}" -f $proc.Id)

