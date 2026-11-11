param([switch]$Check)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$root = Split-Path $PSScriptRoot -Parent
$logPath = Join-Path $root '.cache\studio\server.log'
$url = 'http://localhost:4321/admin/studio'
# Windows can resolve localhost to IPv6 while WSL forwards the server over IPv4.
$readyUrl = 'http://127.0.0.1:4321/'

$form = New-Object System.Windows.Forms.Form
$form.Text = 'CTF-WU Studio - Logs'
$form.Size = New-Object System.Drawing.Size(900, 600)
$form.StartPosition = 'CenterScreen'
$form.Icon = New-Object System.Drawing.Icon((Join-Path $root 'studio.ico'))
$output = New-Object System.Windows.Forms.RichTextBox
$output.Multiline = $true
$output.ReadOnly = $true
$output.ScrollBars = 'Vertical'
$output.WordWrap = $true
$output.BackColor = [System.Drawing.Color]::Black
$output.ForeColor = [System.Drawing.Color]::Gainsboro
$output.DetectUrls = $false
$output.Dock = 'Fill'
$output.Font = New-Object System.Drawing.Font('Consolas', 10)
$output.Text = 'Waiting for Studio...'
$form.Controls.Add($output)
function Set-StudioLog {
    param([string]$Log)
    $Log = $Log -replace "$([char]27)\[[0-?]*[ -/]*[@-~]", ''
    $Log = $Log -replace "`r`n|`r|`n", "`n"
    $output.Text = $Log
    $output.SelectAll()
    $output.SelectionColor = $output.ForeColor
    foreach ($match in [regex]::Matches($output.Text, '(?im)^.*(?:\b(?:error|fatal|exception|failed|failure)\b|\[5\d{2}\]).*$')) {
        $output.Select($match.Index, $match.Length)
        $output.SelectionColor = [System.Drawing.Color]::Salmon
    }
    foreach ($match in [regex]::Matches($output.Text, '(?im)^.*(?:\bwarn(?:ing)?\b|\[4\d{2}\]).*$')) {
        $output.Select($match.Index, $match.Length)
        if ($output.SelectionColor -ne [System.Drawing.Color]::Salmon) {
            $output.SelectionColor = [System.Drawing.Color]::Gold
        }
    }
    $output.Select($output.TextLength, 0)
    $output.SelectionColor = $output.ForeColor
    $output.ScrollToCaret()
}

function Add-StudioLog {
    param([string]$Message)
    Set-StudioLog ($output.Text + "`n" + $Message)
}

$script:exiting = $false
$hideOnClose = {
    param($sender, $eventArgs)
    if (-not $script:exiting) {
        $eventArgs.Cancel = $true
        $sender.Hide()
    }
}
$form.Add_FormClosing($hideOnClose)

$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = $form.Icon
$tray.Text = 'CTF-WU Studio - click to view logs'
$tray.Add_MouseClick({
    param($sender, $eventArgs)
    if ($eventArgs.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
        $form.Show()
        $form.WindowState = 'Normal'
        $form.Activate()
    }
})
$menu = New-Object System.Windows.Forms.ContextMenuStrip
$open = $menu.Items.Add('Open Studio')
$open.Add_Click({ Start-Process $url })
$quit = $menu.Items.Add('Exit Studio (stop server)')
$exitApplication = { [System.Windows.Forms.Application]::ExitThread() }
$exitStudio = {
    $timer.Stop()
    $quit.Enabled = $false
    try {
        Stop-StudioServer
        $script:exiting = $true
        & $exitApplication
    } catch {
        Add-StudioLog "Error: Could not stop Studio: $($_.Exception.Message)"
        $form.Show()
        $quit.Enabled = $true
        $timer.Start()
    }
}
$quit.Add_Click($exitStudio)
$tray.ContextMenuStrip = $menu

function Test-StudioReady {
    try {
        $response = Invoke-WebRequest -Uri $readyUrl -UseBasicParsing -TimeoutSec 5
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function New-StudioServerProcessInfo {
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $env:ComSpec
    $info.Arguments = '/d /c wsl.exe -e zsh -lic "cd /mnt/d/Projects/Blog && bash scripts/studio-server.sh start" > "{0}" 2>&1' -f $logPath
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    return $info
}

function Stop-StudioServer {
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = 'wsl.exe'
    $info.Arguments = '-e bash /mnt/d/Projects/Blog/scripts/studio-server.sh stop'
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $stop = [System.Diagnostics.Process]::Start($info)
    try {
        if (-not $stop.WaitForExit(10000)) { throw 'Server shutdown timed out. Try Exit Studio again.' }
        if ($stop.ExitCode -ne 0) { throw "Server shutdown failed (code $($stop.ExitCode))." }
    } finally {
        $stop.Dispose()
    }
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$script:waiting = $true
$script:slowStartupWarned = $false
$script:startedAt = Get-Date
$script:server = $null
$script:lastLog = $null
$pollStudio = {
    if ($showRequest -and $showRequest.WaitOne(0)) {
        $form.Show()
        $form.WindowState = 'Normal'
        $form.Activate()
    }
    if (Test-Path $logPath) {
        try {
            $stream = [System.IO.File]::Open($logPath, 'Open', 'Read', 'ReadWrite')
            $reader = New-Object System.IO.StreamReader($stream)
            try { $log = $reader.ReadToEnd() } finally { $reader.Dispose() }
            if ($log -ne $script:lastLog) {
                Set-StudioLog $log
                $script:lastLog = $log
            }
        } catch {
            # The server may briefly hold the log file while writing.
        }
    }
    if ($script:waiting) {
        if (Test-StudioReady) {
            $script:waiting = $false
            Start-Process $url
        } elseif ($script:server -and $script:server.HasExited) {
            $script:waiting = $false
            Add-StudioLog "Error: The server process exited (code $($script:server.ExitCode)). Check the log above, then run Studio.bat again."
            $form.Show()
        } elseif (-not $script:slowStartupWarned -and ((Get-Date) - $script:startedAt).TotalSeconds -gt 90) {
            $script:slowStartupWarned = $true
            Add-StudioLog "Warning: Still waiting for Studio at $readyUrl. The launcher will keep checking."
            $form.Show()
        }
    }
}
$timer.Add_Tick($pollStudio)

# Check the real close handler without showing a window or starting a server.
if ($Check) {
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class StudioConsole {
    [DllImport("kernel32.dll")]
    public static extern IntPtr GetConsoleWindow();
}
'@
    if ([StudioConsole]::GetConsoleWindow() -ne [IntPtr]::Zero) {
        throw 'The log viewer must not retain a console window.'
    }
    Set-StudioLog "normal`n$([char]27)[31mERROR: broken$([char]27)[0m`r`n[404] /missing`rfatal warning"
    if ($output.Lines.Count -ne 4 -or $output.Text.Contains([string][char]27)) {
        throw 'Log lines must normalize LF/CRLF/CR and strip ANSI escapes.'
    }
    foreach ($sample in @(@('normal', 'Gainsboro'), @('ERROR', 'Salmon'), @('[404]', 'Gold'), @('fatal', 'Salmon'))) {
        $output.Select($output.Text.IndexOf($sample[0]), $sample[0].Length)
        if ($output.SelectionColor -ne [System.Drawing.Color]::FromName($sample[1])) {
            throw "Incorrect log color for $($sample[0])."
        }
    }
    if ($output.BackColor -ne [System.Drawing.Color]::Black -or -not $output.WordWrap) {
        throw 'Logs must wrap on a black background.'
    }
    $processInfo = New-StudioServerProcessInfo
    if (-not $processInfo.CreateNoWindow -or $processInfo.UseShellExecute) {
        throw 'The server must start without a console window.'
    }
    # Exercise the actual probe and timer without network access, browser launches or visible windows.
    function Invoke-WebRequest {
        param($Uri, [switch]$UseBasicParsing, $TimeoutSec)
        if ($Uri -ne 'http://127.0.0.1:4321/' -or $TimeoutSec -lt 5) { throw 'Invalid readiness probe' }
        if ($script:probeFails) { throw 'Server not ready yet' }
        return [pscustomobject]@{ StatusCode = 200 }
    }
    $script:openedUrls = New-Object 'System.Collections.Generic.List[string]'
    function Start-Process { param($FilePath) $script:openedUrls.Add($FilePath) }
    if (-not (Test-StudioReady)) { throw 'The readiness probe must accept HTTP 200 over IPv4.' }
    $actualForm = $form
    $form = New-Object PSObject
    $form | Add-Member ScriptMethod Show { $script:showCount++ }
    $script:showCount = 0
    $script:probeFails = $true
    $script:startedAt = (Get-Date).AddSeconds(-91)
    & $pollStudio
    & $pollStudio
    if (-not $script:waiting -or $script:showCount -ne 1 -or $script:openedUrls.Count -ne 0) {
        throw 'A slow startup must keep polling and warn only once.'
    }
    $script:probeFails = $false
    & $pollStudio
    if ($script:waiting -or $script:openedUrls.Count -ne 1 -or $script:openedUrls[0] -ne $url) {
        throw 'A ready server must open Studio once after clearing startup waiting.'
    }
    & $pollStudio
    if ($script:openedUrls.Count -ne 1) { throw 'Further polls must not open duplicate browser tabs.' }
    $script:waiting = $true
    $script:probeFails = $true
    $script:server = [pscustomobject]@{ HasExited = $true; ExitCode = 1 }
    & $pollStudio
    if ($script:waiting -or $script:showCount -ne 2) {
        throw 'An exited server must stop startup polling and show its failure.'
    }
    $form = $actualForm
    $script:exitSteps = New-Object 'System.Collections.Generic.List[string]'
    function Stop-StudioServer { $script:exitSteps.Add('stop') }
    $exitApplication = { $script:exitSteps.Add('exit') }
    $closing = New-Object System.Windows.Forms.FormClosingEventArgs('UserClosing', $false)
    & $hideOnClose $form $closing
    if (-not $closing.Cancel -or $form.IsDisposed -or $form.Visible) {
        throw 'Closing the log window must hide it without disposing it.'
    }
    if ($script:exitSteps.Count -ne 0) { throw 'The X button must not stop the server.' }
    $quit.PerformClick()
    if (-not $script:exiting -or ($script:exitSteps -join ',') -ne 'stop,exit') {
        throw 'Tray Exit must stop the server before exiting the log viewer.'
    }
    $closing = New-Object System.Windows.Forms.FormClosingEventArgs('ApplicationExitCall', $false)
    & $hideOnClose $form $closing
    if ($closing.Cancel) { throw 'Tray Exit must allow the application to close.' }
    $timer.Dispose()
    $tray.Dispose()
    $menu.Dispose()
    $form.Dispose()
    Write-Output 'Studio readiness, console-free startup, X-to-tray and Exit-stops-server checks passed.'
    exit
}

$mutex = New-Object System.Threading.Mutex($false, 'Local\CTF-WU-Studio-Logs')
$showRequest = New-Object System.Threading.EventWaitHandle($false, 'AutoReset', 'Local\CTF-WU-Studio-ShowLogs')
if (-not $mutex.WaitOne(0)) {
    [void]$showRequest.Set()
    $showRequest.Dispose()
    $mutex.Dispose()
    $form.Dispose()
    exit
}

try {
    $tray.Visible = $true
    $form.Show()
    [System.Windows.Forms.Application]::DoEvents()
    if (Test-StudioReady) {
        $script:waiting = $false
        Start-Process $url
        if (-not (Test-Path $logPath)) {
            $output.Text = 'Studio is already running without captured logs. Restart that server using Studio.bat to capture logs.'
        }
    } else {
        New-Item -ItemType Directory -Path (Split-Path $logPath) -Force -ErrorAction Stop | Out-Null
        Remove-Item -LiteralPath (Join-Path $root '.cache\studio\server.stop') -ErrorAction SilentlyContinue
        $script:server = [System.Diagnostics.Process]::Start((New-StudioServerProcessInfo))
    }
    $timer.Start()
    [System.Windows.Forms.Application]::Run()
} catch {
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'CTF-WU Studio') | Out-Null
} finally {
    $timer.Dispose()
    $tray.Visible = $false
    $tray.Dispose()
    $menu.Dispose()
    $form.Dispose()
    $mutex.ReleaseMutex()
    $mutex.Dispose()
    $showRequest.Dispose()
}
