$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$testFolder = Join-Path ([IO.Path]::GetTempPath()) ('minimax-windows-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $testFolder | Out-Null
$oldLocalAppData = $env:LOCALAPPDATA
$oldNodeOptions = $env:NODE_OPTIONS
$oldFixtureMode = $env:MINIMAX_FIXTURE_MODE
$oldTraceFile = $env:MINIMAX_FIXTURE_TRACE_FILE
try {
    $files = @('tools/minimax-draft/prompt.ps1', 'tests/minimax-windows.ps1')
    foreach ($file in $files) {
        $parseErrors = $null
        $tokens = $null
        [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $root $file), [ref]$tokens, [ref]$parseErrors) | Out-Null
        if ($parseErrors.Count -ne 0) { throw 'PowerShell parse failure' }
    }
    $env:LOCALAPPDATA = $testFolder
    $env:MINIMAX_FIXTURE_MODE = 'synthetic'
    $env:MINIMAX_FIXTURE_TRACE_FILE = Join-Path $testFolder 'trace.txt'
    $fixture = ((Join-Path $root 'tests/helpers/minimax-http-fixture.mjs') -replace '\\', '/')
    $env:NODE_OPTIONS = '--import="file:///' + $fixture + '"'
    $promptFile = Join-Path $root 'tools/minimax-draft/prompt.ps1'
    # Run the real script in Windows PowerShell 5.1 with controlled Read-Host.
    # Password contains a non-ASCII character to verify the UTF-8 stdin pipe.
    $mock = @'
function global:Read-Host {
  param([string]$Prompt, [switch]$AsSecureString)
  if ($AsSecureString) {
    if ($Prompt.StartsWith('1/4')) { $v = 'SYNTHETIC-CODE' }
    elseif ($Prompt.StartsWith('2/4')) { $v = 'SYNTHETIC-CLIENT-SECRET' }
    else { $v = 'SYNTHETIC-USER-SECRET-' + [char]0x010d }
    return ConvertTo-SecureString $v -AsPlainText -Force
  }
  if ($Prompt.StartsWith('Izbor')) { return $env:MINIMAX_TEST_CHOICE }
  if ($Prompt.StartsWith('Za prenos')) { return 'KREIRAJ NACRT' }
  return ''
}
& $env:MINIMAX_TEST_PROMPT
'@
    $env:MINIMAX_TEST_PROMPT = $promptFile
    $env:MINIMAX_TEST_CHOICE = '1'
    $preview = & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command $mock
    if ($LASTEXITCODE -ne 0 -or ($preview -join "`n") -notmatch 'LOKALNI PREGLED') { throw 'Preview failed' }
    if (Test-Path $env:MINIMAX_FIXTURE_TRACE_FILE) { throw 'Offline preview made a request' }
    foreach ($attempt in @(1,2)) {
        $env:MINIMAX_TEST_CHOICE = '2'
        $output = & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command $mock
        $joined = $output -join "`n"
        if ($LASTEXITCODE -ne 0 -or $joined -notmatch 'REZULTAT: USPEH; nacrt 99999991') { throw ('Live fixture failed: ' + $joined) }
        if ($joined -match 'SYNTHETIC-(CLIENT|USER|TOKEN|CODE)') { throw 'Credential appeared in output' }
        if ($attempt -eq 2 -and $joined -notmatch 'Postojeci nacrt') { throw 'Existing ID was not reused' }
    }
    $trace = Get-Content $env:MINIMAX_FIXTURE_TRACE_FILE
    $creates = @($trace | Where-Object { $_ -eq 'POST /RS/API/api/orgs/81179/issuedinvoices' })
    if ($creates.Count -ne 1) { throw 'Duplicate synthetic create' }
    Write-Host 'PASS Windows PowerShell: AST, offline preview, hidden inputs, Unicode stdin, draft readback, repeat without duplicate POST, no credential output.'
} finally {
    $env:LOCALAPPDATA = $oldLocalAppData
    $env:NODE_OPTIONS = $oldNodeOptions
    $env:MINIMAX_FIXTURE_MODE = $oldFixtureMode
    $env:MINIMAX_FIXTURE_TRACE_FILE = $oldTraceFile
    Remove-Item Env:MINIMAX_TEST_CHOICE -ErrorAction SilentlyContinue
    Remove-Item Env:MINIMAX_TEST_PROMPT -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $testFolder -Recurse -Force
}
