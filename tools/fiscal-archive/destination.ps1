function Read-ArchiveDestination {
    param([string]$PreferencesFile)
    if (-not (Test-Path -LiteralPath $PreferencesFile -PathType Leaf)) { return '' }
    $preferences = Get-Content -LiteralPath $PreferencesFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($preferences.root -isnot [string] -or -not $preferences.root.Trim()) { throw 'Invalid destination preferences' }
    return $preferences.root
}

function Resolve-ArchiveDestination {
    param([string]$Destination, [string[]]$OneDriveRoots)
    if ($Destination -notmatch '^[A-Za-z]:\\') { throw 'An absolute local Windows destination is required' }
    $resolved = [IO.Path]::GetFullPath($Destination).TrimEnd('\')
    foreach ($candidate in $OneDriveRoots) {
        if (-not $candidate) { continue }
        $prefix = [IO.Path]::GetFullPath($candidate).TrimEnd('\') + '\'
        if ($resolved.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { return $resolved }
    }
    throw 'Destination must be inside an existing OneDrive account folder'
}
