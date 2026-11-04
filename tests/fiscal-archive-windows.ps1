$ErrorActionPreference = 'Stop'
foreach ($script in @('tools/fiscal-archive/setup.ps1','tools/fiscal-archive/run.ps1','tools/fiscal-archive/destination.ps1')) {
    $tokens = $null; $errors = $null
    [Management.Automation.Language.Parser]::ParseFile((Join-Path (Get-Location) $script), [ref]$tokens, [ref]$errors) | Out-Null
    if ($errors.Count) { throw ('PowerShell parse failed: ' + $script) }
}
$folder = Join-Path ([IO.Path]::GetTempPath()) ('at-archive-windows-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $folder | Out-Null
$previousArchiveModule = $env:AT_ARCHIVE_MODULE
try {
    . (Join-Path (Get-Location) 'tools/fiscal-archive/destination.ps1')
    $oneDrive = Join-Path $folder 'OneDrive - TEST'
    $expected = Join-Path $oneDrive ('Desktop\TEST FIRMA\FISKALNI RA' + [char]0x010c + 'UNI')
    $preferencesFile = Join-Path $folder 'destination.json'
    $utf8 = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($preferencesFile, (@{ root = $expected } | ConvertTo-Json), $utf8)
    $actual = Resolve-ArchiveDestination -Destination (Read-ArchiveDestination $preferencesFile) -OneDriveRoots @($oneDrive)
    if ($actual -cne $expected) { throw 'Unicode destination was changed' }
    foreach ($bad in @((Join-Path $folder 'outside'), ($oneDrive + '-other\invoices'), (Join-Path $oneDrive '..\outside'), 'relative\invoices')) {
        $rejected = $false
        try { Resolve-ArchiveDestination -Destination $bad -OneDriveRoots @($oneDrive) | Out-Null } catch { $rejected = $true }
        if (-not $rejected) { throw 'Destination outside OneDrive was accepted' }
    }
    $env:AT_ARCHIVE_MODULE = Join-Path (Get-Location) 'tools/fiscal-archive/download.mjs'
    Copy-Item -LiteralPath 'tools/fiscal-archive/run.ps1' -Destination $folder
    $credential = 'SYNTHETIC-READ-ONLY-ARCHIVE-SECRET-123456789' + [char]0x010d
    $secure = ConvertTo-SecureString $credential -AsPlainText -Force
    $secure | Export-Clixml -LiteralPath (Join-Path $folder 'archive-key.xml')
    $stored = Get-Content -Raw -LiteralPath (Join-Path $folder 'archive-key.xml')
    if ($stored.Contains($credential)) { throw 'Credential was saved in clear text' }
    '{}' | Set-Content -LiteralPath (Join-Path $folder 'config.json')
    # Exercise the real Windows PowerShell wrapper, DPAPI decryption and stdin pipe.
    @'
let data='';for await(const chunk of process.stdin)data+=chunk.toString('utf8');
const {pathToFileURL}=await import('node:url');
const {parseArchiveCredential}=await import(pathToFileURL(process.env.AT_ARCHIVE_MODULE));
const token=parseArchiveCredential(data);
if(token!=='SYNTHETIC-READ-ONLY-ARCHIVE-SECRET-123456789'+String.fromCharCode(269)){
  console.error('Synthetic encoding mismatch: length='+token.length+'; last='+token.charCodeAt(token.length-1));process.exit(4);
}
if(process.argv.some(v=>v.includes(token)))process.exit(5);
console.log('PASS hidden stdin credential');
'@ | Set-Content -LiteralPath (Join-Path $folder 'download.mjs')
    $output = & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $folder 'run.ps1')
    $joined = $output -join "`n"
    if ($joined.Contains($credential)) { throw 'Credential appeared in output' }
    if ($LASTEXITCODE -ne 0 -or $joined -notmatch 'PASS hidden stdin credential') {
        Write-Host ('Wrapper exit code: ' + $LASTEXITCODE + '; output: ' + $joined)
        throw 'Credential transport failed'
    }
    Write-Host 'PASS Windows: setup/run syntax, DPAPI storage and hidden credential stdin.'
} finally {
    $env:AT_ARCHIVE_MODULE = $previousArchiveModule
    Remove-Item -LiteralPath $folder -Recurse -Force
}
