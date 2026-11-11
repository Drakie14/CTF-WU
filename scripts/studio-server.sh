#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")/.."
project_root="$(pwd -P)"
pid_file="$project_root/.cache/studio/server.pid"

case "${1:-start}" in
  start)
    mkdir -p .cache/studio
    [[ -f .cache/studio/server.stop ]] && exit 0
    exec setsid --wait bash -c 'echo "$$" > "$1"; [[ -f .cache/studio/server.stop ]] && exit 0; exec npm run dev -- --port 4321' bash "$pid_file"
    ;;
  stop)
    mkdir -p .cache/studio
    touch .cache/studio/server.stop
    # Stop the whole npm/Astro group, including a server still starting up.
    if [[ -f "$pid_file" ]]; then
      read -r server_pid < "$pid_file" || server_pid=''
      if [[ "$server_pid" =~ ^[0-9]+$ ]] &&
        [[ "$(readlink -f "/proc/$server_pid/cwd" || true)" == "$project_root" ]] &&
        [[ "$(ps -o pgid= -p "$server_pid" | tr -d ' ')" == "$server_pid" ]]; then
        kill -TERM -- "-$server_pid" 2>/dev/null || true
      fi
      rm -f "$pid_file"
    fi
    # Also support a Studio server started by an older launcher.
    for server_pid in $(fuser 4321/tcp 2>/dev/null || true); do
      if [[ "$(readlink -f "/proc/$server_pid/cwd" || true)" == "$project_root" ]]; then
        kill -TERM "$server_pid" 2>/dev/null || true
      fi
    done
    ;;
  *) exit 2 ;;
esac
