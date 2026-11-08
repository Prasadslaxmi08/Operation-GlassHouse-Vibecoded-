Set-Location $PSScriptRoot
Write-Host "Operation Glasshouse -> http://localhost:8080  (Ctrl+C to stop)"
Start-Process "http://localhost:8080"
python -m http.server 8080
