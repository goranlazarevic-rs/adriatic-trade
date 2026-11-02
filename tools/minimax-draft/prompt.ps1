$ErrorActionPreference = 'Stop'
$VerbosePreference = 'SilentlyContinue'
$DebugPreference = 'SilentlyContinue'
$clientIdSecret = $clientPasswordSecret = $userPasswordSecret = $credentials = $null
$json = $asciiJson = $null
$savedOutputEncoding = $OutputEncoding
function SecretText([Security.SecureString] $secret) {
    $ptr = [IntPtr]::Zero
    try {
        $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    } finally {
        if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    }
}
try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host 'Potreban je Node.js 22 ili noviji (preporuka: 24 LTS), sa https://nodejs.org/ .'
        Write-Host 'Nista nije poslato u Minimax.'
        exit 1
    }
    $version = & node --version
    if ($LASTEXITCODE -ne 0 -or $version -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 22) {
        Write-Host 'Potreban je Node.js 22 ili noviji. Nista nije poslato u Minimax.'
        exit 1
    }
    $cli = Join-Path $PSScriptRoot 'cli.mjs'
    Write-Host 'ADRIATIC TRADE - MINIMAX PROBNI NACRT'
    Write-Host '1 - lokalni pregled (bez prijave i mreze)'
    Write-Host '2 - prenos jedne probne porudzbine u Minimax kao nacrta'
    Write-Host '3 - provera prethodnog neizvesnog pokusaja po ID-u nacrta'
    $choice = Read-Host 'Izbor [Enter = 1]'
    if ([string]::IsNullOrWhiteSpace($choice) -or $choice -eq '1') {
        & node $cli --preview
        exit $LASTEXITCODE
    }
    if ($choice -notin @('2', '3')) { Write-Host 'Prekinuto. Nista nije poslato.'; exit 0 }
    $nodeArgs = @('--live')
    if ($choice -eq '2') {
        Write-Host 'Proba: po 1 komad pet proizvoda (2548 RSD) + dostava 420 RSD = 2968 RSD.'
        Write-Host 'Organizacija 81179. Jedan trajno evidentiran pokusaj. Bez izdavanja racuna.'
        $confirmation = Read-Host 'Za prenos upisite KREIRAJ NACRT; za izlaz Enter'
        if ($confirmation -cne 'KREIRAJ NACRT') { Write-Host 'Prekinuto. Nista nije poslato.'; exit 0 }
    } else {
        $invoiceId = Read-Host 'ID nacrta koji ste prethodno pronasli u Minimaxu'
        if ($invoiceId -notmatch '^[1-9][0-9]{0,14}$') { Write-Host 'Neispravan ID. Nista nije poslato.'; exit 1 }
        $nodeArgs = @('--reconcile', $invoiceId)
    }
    $clientIdSecret = Read-Host '1/4 CLIENT identifikacioni kod iz poruke podrske' -AsSecureString
    $clientPasswordSecret = Read-Host '2/4 CLIENT lozinka iz poruke podrske' -AsSecureString
    $userName = Read-Host '3/4 USER korisnicko ime [Enter = adriatic-webshop]'
    if ([string]::IsNullOrWhiteSpace($userName)) { $userName = 'adriatic-webshop' }
    $userPasswordSecret = Read-Host '4/4 USER lozinka za spoljnu aplikaciju' -AsSecureString
    $credentials = @{clientId=(SecretText $clientIdSecret); clientSecret=(SecretText $clientPasswordSecret);
        username=$userName; password=(SecretText $userPasswordSecret)}
    $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    # Windows PowerShell 5.1 native pipes can replace non-ASCII characters.
    # Escape JSON UTF-16 units so every pipe byte is ASCII, preserving Unicode
    # credentials independently of the console code page. Node JSON.parse
    # reconstructs the original characters, including surrogate pairs.
    $json = $credentials | ConvertTo-Json -Compress
    $asciiJson = [regex]::Replace($json, '[^\u0000-\u007f]', {
        param($match)
        '\u{0:x4}' -f [int][char]$match.Value[0]
    })
    # Only stdin, never arguments, environment, logs or files.
    $asciiJson | & node $cli @nodeArgs
    $result = $LASTEXITCODE
} catch {
    Write-Host 'REZULTAT: NEUSPEH; lokalno pokretanje nije uspelo. Ne ponavljajte naslepo.'
    $result = 1
} finally {
    if ($null -ne $credentials) { $credentials.Clear() }
    foreach ($secret in @($clientIdSecret, $clientPasswordSecret, $userPasswordSecret)) {
        if ($null -ne $secret) { $secret.Dispose() }
    }
    $credentials = $null
    $json = $asciiJson = $null
    $OutputEncoding = $savedOutputEncoding
}
exit $result
