$ErrorActionPreference='Stop'
$project=Split-Path $PSScriptRoot -Parent
$state=Join-Path $project '.demo-environment'
$secretFolder=Join-Path $project '.demo-secrets'
$access=Get-Content -Raw -LiteralPath (Join-Path $secretFolder 'access.json') | ConvertFrom-Json
$pgBin=if($env:CMH_PG_BIN){$env:CMH_PG_BIN}else{'C:\Program Files\PostgreSQL\18\bin'}
$listener=Get-NetTCPConnection -LocalPort 3191 -State Listen -ErrorAction SilentlyContinue
if($listener){
 $process=Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
 if($process.CommandLine -notlike '*.demo-secrets*server.js*'){throw 'Port belongs to another process'}
 Stop-Process -Id $listener.OwningProcess
}
$folder=Join-Path $project ('.local-backups\demo-'+(Get-Date -Format yyyyMMdd-HHmmss))
New-Item -ItemType Directory -Path $folder | Out-Null
$env:PGPASSWORD=$access.databasePassword
try{
 $identity=& (Join-Path $pgBin 'psql.exe') -h 127.0.0.1 -p 5441 -U cmh_demo -d cmh_academy_demo -tAc "SELECT current_database()||'|'||current_setting('data_directory')"
 if($LASTEXITCODE -ne 0 -or $identity -notlike 'cmh_academy_demo|*\.demo-environment\postgres-data'){throw 'Unexpected backup database'}
 & (Join-Path $pgBin 'pg_dump.exe') -h 127.0.0.1 -p 5441 -U cmh_demo -d cmh_academy_demo -Fc -f (Join-Path $folder 'demo.dump')
 if($LASTEXITCODE -ne 0){throw 'Demo dump failed'}
 Copy-Item -LiteralPath (Join-Path $state 'private') -Destination (Join-Path $folder 'private') -Recurse
 Get-FileHash -LiteralPath (Join-Path $folder 'demo.dump') -Algorithm SHA256 | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $folder 'dump-sha256.json')
 Write-Output "Joint demo backup: $folder"
}finally{Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue}
Write-Output 'Restart the application with deploy/Start-Demo.ps1; database and HTTPS tunnel were preserved.'
