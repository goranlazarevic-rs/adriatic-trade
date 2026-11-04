$ErrorActionPreference = 'Stop'
try {
    $state = $PSScriptRoot
    $config = Join-Path $state 'config.json'
    $secret = Import-Clixml -LiteralPath (Join-Path $state 'archive-key.xml')
    if ($secret -isnot [Security.SecureString]) { throw 'Invalid credential' }
    # A reboot makes a previous run's lock stale; never remove a live run's lock.
    $lock = Join-Path $state 'download.lock'
    if (Test-Path -LiteralPath $lock) {
        $boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
        if ((Get-Item -LiteralPath $lock).CreationTime -lt $boot) { Remove-Item -LiteralPath $lock }
    }
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $previousOutputEncoding = $OutputEncoding
    try {
        $OutputEncoding = New-Object Text.UTF8Encoding($false)
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        $payload = @{ token = $plain } | ConvertTo-Json -Compress
        # Secret travels over stdin, never as a process argument or log entry.
        $payload | & $node (Join-Path $state 'download.mjs') $config
        $code = $LASTEXITCODE
    } finally {
        $OutputEncoding = $previousOutputEncoding
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $plain = $null; $payload = $null; $secret = $null
    }
    exit $code
} catch {
    Write-Host 'Preuzimanje nije zavrseno. Proverite Node.js, lokalno podesavanje i pristup arhivi.'
    exit 1
}
