using System;
using System.Diagnostics;
using System.IO;

internal static class StudioBootstrap
{
    [STAThread]
    private static void Main()
    {
        string root = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, @"..\.."));
        Process.Start(new ProcessStartInfo
        {
            FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe"),
            Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -STA -File \"" + Path.Combine(root, @"scripts\studio-launcher.ps1") + "\"",
            WorkingDirectory = root,
            UseShellExecute = false,
            CreateNoWindow = true
        });
    }
}
