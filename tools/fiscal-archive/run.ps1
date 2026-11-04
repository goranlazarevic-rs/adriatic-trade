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
    try {
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        $payload = @{ token = $plain } | ConvertTo-Json -Compress
        # Write raw UTF-8 bytes: Windows PowerShell's native pipeline can prepend
        # a BOM even when OutputEncoding is changed. No secret in argv or logs.
        $start = New-Object Diagnostics.ProcessStartInfo
        $start.FileName = $node
        $start.Arguments = '"' + (Join-Path $state 'download.mjs') + '" "' + $config + '"'
        $start.UseShellExecute = $false
        $start.CreateNoWindow = $true
        $start.RedirectStandardInput = $true
        $start.RedirectStandardOutput = $true
        $start.RedirectStandardError = $true
        $process = New-Object Diagnostics.Process
        $process.StartInfo = $start
        if (-not $process.Start()) { throw 'Downloader did not start' }
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $utf8 = New-Object Text.UTF8Encoding($false)
        $bytes = $utf8.GetBytes($payload)
        $process.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
        $process.StandardInput.BaseStream.Flush()
        $process.StandardInput.Close()
        $process.WaitForExit()
        $output = $stdoutTask.GetAwaiter().GetResult()
        $errors = $stderrTask.GetAwaiter().GetResult()
        if ($output) { Write-Host $output.TrimEnd() }
        if ($errors) { Write-Host $errors.TrimEnd() }
        $code = $process.ExitCode
        $process.Dispose()
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        if ($bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
        $plain = $null; $payload = $null; $secret = $null
    }
    exit $code
} catch {
    Write-Host 'Preuzimanje nije zavrseno. Proverite Node.js, lokalno podesavanje i pristup arhivi.'
    exit 1
}
