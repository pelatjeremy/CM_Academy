param([switch]$Initialize,[switch]$RestartApp)
$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$backend = Join-Path $project 'backend'
$state = Join-Path $project '.demo-environment'
$secretFolder = Join-Path $project '.demo-secrets'
$pgBin = if ($env:CMH_PG_BIN) { $env:CMH_PG_BIN } else { 'C:\Program Files\PostgreSQL\18\bin' }
$node = (Get-Command node.exe).Source
Push-Location $project
try {
    & $node (Join-Path $backend 'scripts\prepare-demo-local.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Demo configuration failed' }
    $access = Get-Content -Raw -LiteralPath (Join-Path $secretFolder 'access.json') | ConvertFrom-Json
    $data = Join-Path $state 'postgres-data'
    if (-not (Test-Path -LiteralPath (Join-Path $data 'PG_VERSION'))) {
        if (-not $Initialize) { throw 'First launch requires -Initialize' }
        & (Join-Path $pgBin 'initdb.exe') -D $data -U cmh_demo --auth-host=scram-sha-256 --auth-local=scram-sha-256 "--pwfile=$(Join-Path $secretFolder 'pg-password.txt')" --encoding=UTF8 --locale=C
        if ($LASTEXITCODE -ne 0) { throw 'Demo PostgreSQL initialization failed' }
    }
    $listener = Get-NetTCPConnection -LocalPort 5441 -State Listen -ErrorAction SilentlyContinue
    if (-not $listener) {
        Start-Process -FilePath (Join-Path $pgBin 'postgres.exe') -ArgumentList @('-D', ('"' + $data + '"'), '-h', '127.0.0.1', '-p', '5441') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $state 'postgres.stdout.log') -RedirectStandardError (Join-Path $state 'postgres.stderr.log') | Out-Null
    }
    $ready = $false
    for ($i=0; $i -lt 40; $i++) {
        & (Join-Path $pgBin 'pg_isready.exe') -h 127.0.0.1 -p 5441 -U cmh_demo -d postgres *> $null
        if ($LASTEXITCODE -eq 0) { $ready=$true; break }
        Start-Sleep -Milliseconds 250
    }
    if (-not $ready) { throw 'Demo PostgreSQL not ready' }
    $env:PGPASSWORD = $access.databasePassword
    try {
        $actual = & (Join-Path $pgBin 'psql.exe') -h 127.0.0.1 -p 5441 -U cmh_demo -d postgres -tAc "SELECT current_setting('data_directory')"
        if ($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath($actual.Trim()) -ine [IO.Path]::GetFullPath($data)) { throw 'Demo PostgreSQL directory mismatch' }
        $exists = & (Join-Path $pgBin 'psql.exe') -h 127.0.0.1 -p 5441 -U cmh_demo -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='cmh_academy_demo'"
        if ($exists -ne '1') {
            if (-not $Initialize) { throw 'Demo database absent' }
            & (Join-Path $pgBin 'createdb.exe') -h 127.0.0.1 -p 5441 -U cmh_demo cmh_academy_demo
            if ($LASTEXITCODE -ne 0) { throw 'Demo database creation failed' }
        }
    } finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
    Push-Location $backend
    try {
        if ($Initialize) {
            & $node "--env-file=$(Join-Path $secretFolder '.env.demo')" scripts/migrate-demo.mjs
            if ($LASTEXITCODE -ne 0) { throw 'Demo migration failed' }
            & $node "--env-file=$(Join-Path $secretFolder '.env.demo')" scripts/seed-demo.mjs --confirm-demo-only
            if ($LASTEXITCODE -ne 0) { throw 'Demo seed failed' }
        }
    } finally { Pop-Location }
    $cloud = Join-Path $backend '.local-tools\cloudflared\cloudflared.exe'
    if (-not (Test-Path -LiteralPath $cloud)) { throw 'Install verified cloudflared before publishing' }
    $tunnelFile = Join-Path $state 'tunnel.json'
    $tunnel = if (Test-Path -LiteralPath $tunnelFile) { Get-Content -Raw -LiteralPath $tunnelFile | ConvertFrom-Json } else { $null }
    $running = if ($tunnel) { Get-CimInstance Win32_Process -Filter "ProcessId=$($tunnel.pid)" } else { $null }
    if (-not $running -or $running.ExecutablePath -ine $cloud -or $running.CommandLine -notlike '*127.0.0.1:3191*') {
        $stamp = Get-Date -Format yyyyMMdd-HHmmss
        $log = Join-Path $state "tunnel-$stamp.stderr.log"
        $launch = Start-Process -FilePath $cloud -ArgumentList @('--no-autoupdate','tunnel','--url','http://127.0.0.1:3191','--protocol','http2','--metrics','127.0.0.1:49312') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $state "tunnel-$stamp.stdout.log") -RedirectStandardError $log -PassThru
        $origin = $null
        for ($i=0; $i -lt 60; $i++) {
            if ($launch.HasExited) { throw 'HTTPS tunnel exited; inspect its private log' }
            if (Test-Path -LiteralPath $log) { $match=[regex]::Match((Get-Content -Raw -LiteralPath $log),'https://[a-z0-9-]+\.trycloudflare\.com'); if ($match.Success) { $origin=$match.Value; break } }
            Start-Sleep -Milliseconds 500
        }
        if (-not $origin) { throw 'HTTPS origin not available; inspect the private tunnel log' }
        $tunnel = @{pid=$launch.Id;origin=$origin;log=$log}
        $tunnel | ConvertTo-Json | Set-Content -Encoding utf8 -LiteralPath $tunnelFile
    }
    & $node (Join-Path $backend 'scripts\prepare-demo-local.mjs') "--origin=$($tunnel.origin)"
    if ($LASTEXITCODE -ne 0) { throw 'HTTPS origin configuration failed' }
    $app = Get-NetTCPConnection -LocalPort 3191 -State Listen -ErrorAction SilentlyContinue
    if ($app) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($app.OwningProcess)"
        if ($process.CommandLine -notlike '*.demo-secrets*server.js*') { throw 'Port 3191 belongs to another process' }
        if ($RestartApp) { Stop-Process -Id $app.OwningProcess; $app=$null }
    }
    if (-not $app) {
        Start-Process -FilePath $node -ArgumentList @(('"--env-file=' + (Join-Path $secretFolder '.env.demo') + '"'),'server.js') -WorkingDirectory $backend -WindowStyle Hidden -RedirectStandardOutput (Join-Path $state 'app.stdout.log') -RedirectStandardError (Join-Path $state 'app.stderr.log') | Out-Null
    }
    Write-Output "Demonstration HTTPS: $($tunnel.origin)"
    Write-Output 'Private access details: .demo-secrets/access.json (never publish this file).'
} finally { Pop-Location }
