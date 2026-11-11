$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$directory = Join-Path $root '.cache\studio'
$exe = Join-Path $directory 'Studio.exe'
New-Item -ItemType Directory -Path $directory -Force | Out-Null
if (Test-Path $exe) { Remove-Item -LiteralPath $exe }
Add-Type -TypeDefinition (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'studio-bootstrap.cs') -Raw) -OutputAssembly $exe -OutputType WindowsApplication

$shell = New-Object -ComObject WScript.Shell
$paths = @((Join-Path ([Environment]::GetFolderPath('Desktop')) 'CTF-WU Studio.lnk'))
$pinned = Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\CTF-WU Studio.lnk'
if (Test-Path $pinned) { $paths += $pinned }
foreach ($path in $paths) {
    $link = $shell.CreateShortcut($path)
    $link.TargetPath = $exe
    $link.Arguments = ''
    $link.WorkingDirectory = $root
    $link.IconLocation = (Join-Path $root 'studio.ico') + ',0'
    $link.Description = 'Studio: logs, hide to tray, exit to stop server'
    $link.Save()
    Write-Output ('Updated shortcut: ' + $path)
}
