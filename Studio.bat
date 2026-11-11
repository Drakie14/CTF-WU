@echo off
if not exist "%~dp0.cache\studio\Studio.exe" powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0scripts\install-studio-shortcut.ps1"
start "" "%~dp0.cache\studio\Studio.exe"
exit /b
