param([string]$Destination = '')
$ErrorActionPreference = 'Stop'
try {
    . (Join-Path $PSScriptRoot 'destination.ps1')
    if ($env:OS -ne 'Windows_NT') { throw 'Windows required' }
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $nodeVersion = (& $node --version).TrimStart('v')
    if ($LASTEXITCODE -ne 0 -or [version]$nodeVersion -lt [version]'22.0') { throw 'Node.js 22 or newer required' }
    $candidates = @(@($env:OneDriveConsumer, $env:OneDriveCommercial, $env:OneDrive) |
        Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Container) } | Select-Object -Unique)
    if ($candidates.Count -eq 0) { throw 'OneDrive folder not found' }
    if (-not $Destination) { $Destination = Read-ArchiveDestination (Join-Path $PSScriptRoot 'destination.json') }
    if (-not $Destination) {
        Write-Host 'OneDrive folderi na ovom racunaru:'
        for ($i = 0; $i -lt $candidates.Count; $i++) { Write-Host ($i + 1) $candidates[$i] }
        $choice = 1
        if ($candidates.Count -gt 1) { $choice = [int](Read-Host 'Unesite broj OneDrive naloga za racune firme') }
        if ($choice -lt 1 -or $choice -gt $candidates.Count) { throw 'Invalid folder' }
        $Destination = Join-Path $candidates[$choice - 1] 'Adriatic Trade\Fiskalni racuni'
    }
    $root = Resolve-ArchiveDestination -Destination $Destination -OneDriveRoots $candidates
    Write-Host 'Folder racuna:' $root
    Write-Host 'Unesite poseban KLJUC ARHIVE koji dozvoljava samo preuzimanje. Ne unosite administratorski kljuc.'
    $secret = Read-Host 'Kljuc arhive' -AsSecureString
    if ($secret.Length -lt 32) { throw 'Invalid archive key' }
    $state = Join-Path $env:LOCALAPPDATA 'AdriaticTrade\FiscalArchive'
    New-Item -ItemType Directory -Path $state -Force | Out-Null
    # Credentials and scripts stay outside the synced PDF folder, under this user.
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $acl = Get-Acl -LiteralPath $state
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.SetAccessRule($rule)
    Set-Acl -LiteralPath $state -AclObject $acl
    foreach ($file in @('download.mjs', 'run.ps1')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $state $file) -Force
    }
    $secret | Export-Clixml -LiteralPath (Join-Path $state 'archive-key.xml')
    $encoding = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText((Join-Path $state 'config.json'), (@{ root = $root } | ConvertTo-Json), $encoding)
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    Write-Host 'Prvo proveravam preuzimanje. Raspored se ukljucuje tek ako provera uspe.'
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $state 'run.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'Initial download failed or archive incomplete' }
    $action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
        -Argument ('-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $state 'run.ps1') + '"')
    $daily = New-ScheduledTaskTrigger -Daily -At '18:00'
    $login = New-ScheduledTaskTrigger -AtLogOn -User $identity
    $principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
        -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 15)
    Register-ScheduledTask -TaskName 'AdriaticTrade-FiscalArchive' -Action $action -Trigger @($daily, $login) `
        -Principal $principal -Settings $settings -Description 'Preuzima nove originalne fiskalne PDF-ove u OneDrive; ne brise niti prepisuje postojece.' -Force | Out-Null
    Write-Host 'Podeseno: svakog dana u 18:00 i pri prijavi u Windows, dok je korisnik prijavljen.'
    Write-Host 'U OneDrive folderu kliknite desnim tasterom na Fiskalni racuni > Always keep on this device.'
    Write-Host 'Proverite zelenu oznaku OneDrive. Preuzimanje samo po sebi ne potvrdjuje slanje na cloud.'
    Start-Process explorer.exe -ArgumentList ('"' + $root + '"')
} catch {
    Write-Host 'Podesavanje nije zavrseno. Proverite Node.js 22+, OneDrive i poseban kljuc arhive.'
    Write-Host 'Ako je pregled prazan ili arhiva nepotpuna, prvo zavrsite podesavanje webshopa.'
    exit 1
}
