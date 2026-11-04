$ErrorActionPreference = 'Stop'
foreach ($script in @('tools/fiscal-archive/setup.ps1','tools/fiscal-archive/run.ps1')) {
    $tokens = $null; $errors = $null
    [Management.Automation.Language.Parser]::ParseFile((Join-Path (Get-Location) $script), [ref]$tokens, [ref]$errors) | Out-Null
    if ($errors.Count) { throw ('PowerShell parse failed: ' + $script) }
}
$folder = Join-Path ([IO.Path]::GetTempPath()) ('at-archive-windows-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $folder | Out-Null
try {
    Copy-Item -LiteralPath 'tools/fiscal-archive/run.ps1' -Destination $folder
    $credential = 'SYNTHETIC-READ-ONLY-ARCHIVE-SECRET-123456789'
    $secure = ConvertTo-SecureString $credential -AsPlainText -Force
    $secure | Export-Clixml -LiteralPath (Join-Path $folder 'archive-key.xml')
    $stored = Get-Content -Raw -LiteralPath (Join-Path $folder 'archive-key.xml')
    if ($stored.Contains($credential)) { throw 'Credential was saved in clear text' }
    '{}' | Set-Content -LiteralPath (Join-Path $folder 'config.json')
    # Exercise the real Windows PowerShell wrapper, DPAPI decryption and stdin pipe.
    @'
let data='';for await(const chunk of process.stdin)data+=chunk.toString('utf8');
const token=JSON.parse(data).token;
if(token!=='SYNTHETIC-READ-ONLY-ARCHIVE-SECRET-123456789')process.exit(4);
if(process.argv.some(v=>v.includes(token)))process.exit(5);
console.log('PASS hidden stdin credential');
'@ | Set-Content -LiteralPath (Join-Path $folder 'download.mjs')
    $output = & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $folder 'run.ps1')
    $joined = $output -join "`n"
    if ($LASTEXITCODE -ne 0 -or $joined -notmatch 'PASS hidden stdin credential' -or $joined.Contains($credential)) { throw 'Credential transport failed' }
    Write-Host 'PASS Windows: setup/run syntax, DPAPI storage and hidden credential stdin.'
} finally {
    Remove-Item -LiteralPath $folder -Recurse -Force
}
