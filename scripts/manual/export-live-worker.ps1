$ErrorActionPreference = 'Stop'
$inventoryDir = Join-Path $env:USERPROFILE ("calcio-report-worker-copy-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $inventoryDir -ErrorAction Stop | Out-Null
Push-Location $inventoryDir
try {
    # Wrangler 4.152.0's non-C3 branch downloads only: no deploy or init wizard.
    npx --yes wrangler@4.152.0 init --from-dash calcio-report-proxy --delegate-c3=false
    if ($LASTEXITCODE -ne 0) { throw 'Download Worker non riuscito. Nessun deploy richiesto.' }
    $workerDir = Join-Path $inventoryDir 'calcio-report-proxy'
    $configPath = Join-Path $workerDir 'wrangler.jsonc'
    if (-not (Test-Path -LiteralPath $configPath)) { throw 'Configurazione scaricata non trovata.' }
    # This exact Wrangler path emits JSON.stringify, despite the .jsonc extension.
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    if ($config.name -ne 'calcio-report-proxy') { throw 'Nome Worker inatteso.' }
    $sources = @(Get-ChildItem -LiteralPath (Join-Path $workerDir 'src') -File -Recurse)
    if ($sources.Count -eq 0) { throw 'Nessun modulo Worker scaricato.' }
    $safeSummary = [ordered]@{
        worker = $config.name
        compatibility_date = $config.compatibility_date
        compatibility_flags = @($config.compatibility_flags)
        configuration_keys = @($config.PSObject.Properties.Name)
        variable_names_only = @($config.vars.PSObject.Properties.Name)
        d1_bindings = @($config.d1_databases | ForEach-Object {
            [ordered]@{ binding = $_.binding; database_id = $_.database_id }
        })
        source_files_downloaded = $sources.Count
        local_copy = $workerDir
    }
    Write-Host 'Copia locale completata. Nessun deploy o cambiamento D1.'
    $safeSummary | ConvertTo-Json -Depth 5
} finally {
    Pop-Location
}
