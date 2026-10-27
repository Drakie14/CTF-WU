@echo off
rem Double-click: start the WSL dev server if needed, then open the local Studio.
curl -s -o nul http://localhost:4321/ && goto open
start "CTF-WU Studio (dev server)" wsl.exe -e zsh -lic "cd /mnt/d/Hi*/Blog && npm run dev"
:wait
timeout /t 2 /nobreak >nul
curl -s -o nul http://localhost:4321/ || goto wait
:open
start "" http://localhost:4321/admin/studio
