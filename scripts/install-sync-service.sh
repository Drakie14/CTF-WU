#!/usr/bin/env bash
# Cài systemd user service `blog-sync` chạy scripts/sync-watch.mjs nền trong WSL (cần systemd=true trong /etc/wsl.conf).
# Gỡ: systemctl --user disable --now blog-sync && rm ~/.config/systemd/user/blog-sync.service
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
node="$(command -v node)"
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/blog-sync.service <<EOF
[Unit]
Description=Tự đồng bộ Blog CTF sau khi Studio web publish

[Service]
WorkingDirectory=$root
Environment=GIT_TERMINAL_PROMPT=0
Environment=PATH=$(dirname "$node"):/usr/local/bin:/usr/bin:/bin
ExecStart=$node $root/scripts/sync-watch.mjs
Restart=always
RestartSec=30

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now blog-sync
loginctl enable-linger "$USER"
systemctl --user status blog-sync --no-pager | head -5
