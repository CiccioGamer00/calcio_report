param([Parameter(Mandatory=$true)][string]$SnapshotDirectory)
$ErrorActionPreference = 'Stop'
$sourceRef = '8dd45006cdd3e447d4d1dc2c4943cf7d563f9296'
$snapshotFile = Join-Path $SnapshotDirectory 'wrangler.jsonc'
if (-not (Test-Path -LiteralPath $snapshotFile)) { throw 'Copia locale Worker non trovata.' }
$nodeMajor = [int]((& node -p 'process.versions.node.split(".")[0]') | Select-Object -Last 1)
if ($LASTEXITCODE -ne 0 -or $nodeMajor -lt 22) { throw 'Serve Node 22 o successivo.' }
$stageDir = Join-Path $env:USERPROFILE ('calcio-report-maintenance-candidate-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $stageDir -ErrorAction Stop | Out-Null
$files = @(
 'worker/apple-production-entry.mjs',
 'worker/worker.js',
 'worker/pro-production-maintenance.mjs',
 'worker/apple-handler.mjs',
 'worker/app-review-router.mjs',
 'worker/legacy-pro-delivery.mjs',
 'worker/apple-purchase-ledger.mjs',
 'worker/apple-verifier-client.mjs',
 'worker/apple-pro-delivery.mjs',
 'worker/apple-notification-owner.mjs',
 'worker/pro-entitlements.mjs',
 'worker/apple-purchase-policy.mjs',
 'scripts/build-apple-production-worker.mjs',
 'scripts/prepare-worker-maintenance.mjs'
)
Write-Host '1/4 - Download del candidato versionato...'
foreach ($file in $files) {
    $destination = Join-Path $stageDir $file
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Invoke-WebRequest -UseBasicParsing -Uri ("https://raw.githubusercontent.com/CiccioGamer00/calcio_report/" + $sourceRef + "/" + $file) -OutFile $destination
}
function Invoke-LoggedNpm {
    param([string[]]$NpmArguments, [string]$LogPath)
    $savedPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & npx.cmd @NpmArguments *> $LogPath
        $resultCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $savedPreference }
    if ($resultCode -ne 0) { throw ("Comando locale non riuscito. Log conservato sul PC: " + $LogPath) }
}
Push-Location $stageDir
try {
    Write-Host '2/4 - Preparazione esbuild 0.28.2 e compilazione locale...'
    $mobile = Join-Path $stageDir 'mobile'
    New-Item -ItemType Directory -Path $mobile | Out-Null
    # Install only the pinned bundler into the isolated staging folder.
    $savedPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & npm.cmd install --prefix $mobile --ignore-scripts --no-audit --no-fund esbuild@0.28.2 *> (Join-Path $stageDir 'npm-build.log')
        $installCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $savedPreference }
    if ($installCode -ne 0) { throw 'Installazione locale esbuild non riuscita; log sul PC.' }
    & node scripts/build-apple-production-worker.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Build candidata non riuscita.' }
    Write-Host '3/4 - Verifica hash e conservazione delle impostazioni live...'
    & node scripts/prepare-worker-maintenance.mjs $snapshotFile
    if ($LASTEXITCODE -ne 0) { throw 'Preparazione configurazione interrotta; nessun deploy.' }
    Write-Host '4/4 - Wrangler dry-run: nessun upload o deploy...'
    Invoke-LoggedNpm -NpmArguments @('--yes','wrangler@4.152.0','deploy','--dry-run',
        '--config','wrangler.maintenance.json','--outdir','dry-run-output') -LogPath (Join-Path $stageDir 'wrangler-dry-run.log')
    Write-Host 'PREPARAZIONE OK - dry-run completato; nessun deploy, nessuna migrazione D1.'
    [ordered]@{
        candidate_directory = $stageDir
        source_commit = $sourceRef
        bundle_sha256 = (Get-FileHash -LiteralPath (Join-Path $stageDir 'worker/dist/apple-production-candidate.mjs') -Algorithm SHA256).Hash.ToLowerInvariant()
        compatibility_date = '2026-02-10'
        pause_candidate = '1'
        pro_ledger_candidate = '0'
        apple_production_candidate = '0'
        live_configuration = 'invariata'
    } | ConvertTo-Json
} finally { Pop-Location }
