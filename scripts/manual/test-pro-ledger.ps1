$ErrorActionPreference = 'Stop'
# Fixed TEST target. Never accepts a production URL or modifies an existing user.
$base = 'https://calcio-report-test.stemoro84.workers.dev'
$runId = [guid]::NewGuid().ToString()
$email = "ledger-$runId@example.invalid"
$password = [guid]::NewGuid().ToString() + 'Aa1!'
$keySecure = Read-Host 'ADMIN_KEY del solo Worker calcio-report-test (input nascosto)' -AsSecureString
$key = [System.Net.NetworkCredential]::new('', $keySecure).Password
function Call-TestApi($path, $body, $headers) {
    $requestOptions = @{Uri = "$base$path"; Headers = $headers; TimeoutSec = 30}
    if ($null -ne $body) {
        $requestOptions.Method = 'Post'
        $requestOptions.ContentType = 'application/json'
        $requestOptions.Body = ($body | ConvertTo-Json -Compress)
    } else { $requestOptions.Method = 'Get' }
    Invoke-RestMethod @requestOptions
}
try {
    $registered = Call-TestApi '/auth/register' @{email=$email; password=$password} @{}
    if (!$registered.ok -or !$registered.token) { throw 'Registrazione account di collaudo fallita.' }
    Write-Host "Account di collaudo: $email"
    $auth = @{Authorization = "Bearer $($registered.token)"}
    $context = Call-TestApi '/apple/token' $null $auth
    if ($context.environment -ne 'Sandbox') { throw 'Ambiente inatteso: collaudo fermato.' }
    $admin = @{'x-admin-key'=$key}
    $operation = @{email=$email; requestId="ledger-smoke-$runId"}
    $first = Call-TestApi '/admin/grant' $operation $admin
    if (!$first.ok -or !$first.operationId -or !$first.paidUntil) {
        throw 'Risposta priva del registro: nessun secondo accredito inviato.'
    }
    $second = Call-TestApi '/admin/grant' $operation $admin
    if (!$second.ok -or $second.duplicate -ne $true -or $second.paidUntil -ne $first.paidUntil -or
        $second.operationId -ne $first.operationId) { throw 'Controllo duplicati NON superato.' }
    $me = Call-TestApi '/auth/me' $null $auth
    if ($me.paidUntil -ne $first.paidUntil) { throw 'Scadenza account diversa dalla consegna.' }
    Write-Host 'PASS: accredito registrato, ripetizione senza giorni aggiunti, scadenza account coerente.'
    Write-Host "Operazione: $($first.operationId)"
    Write-Host "paidUntil: $($first.paidUntil)"
    Write-Host 'Account tecnico conservato nel solo database TEST per verifica.'
} finally {
    $key = $null; $keySecure = $null; $password = $null
    $registered = $null; $auth = $null; $admin = $null
}
