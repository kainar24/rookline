#!/bin/bash
# Starts Rookline in the background (no Terminal window needed) and opens it in the browser.
# Used by Rookline.app; safe to run again: an already running server is reused.
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.volta/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
PORT=5188
URL="http://localhost:$PORT/"
LOG="${TMPDIR:-/tmp}/rookline-server.log"

if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display alert "Rookline" message "Нужен Node.js (nodejs.org), версия 20 или новее."'; exit 1
fi
if [ ! -d node_modules ]; then npm install >>"$LOG" 2>&1 || { osascript -e 'display alert "Rookline" message "Не удалось установить зависимости. Подробности: '"$LOG"'"'; exit 1; }; fi
if [ ! -f dist/index.html ] || [ -n "$(find src index.html public -newer dist/index.html -print -quit)" ]; then
  npm run build >>"$LOG" 2>&1 || { osascript -e 'display alert "Rookline" message "Ошибка сборки. Подробности: '"$LOG"'"'; exit 1; }
fi
# Already running? vite preview serves dist/ from disk, so the fresh build above is picked up.
if curl -fs "$URL" 2>/dev/null | grep -q "Rookline"; then
  [ -z "$NO_OPEN" ] && open "$URL"; exit 0
fi
# Start detached so closing any window never stops it.
nohup node node_modules/vite/bin/vite.js preview --port $PORT --strictPort >>"$LOG" 2>&1 < /dev/null &
disown
for i in $(seq 1 50); do curl -fs "$URL" >/dev/null 2>&1 && break; sleep 0.2; done
[ -z "$NO_OPEN" ] && open "$URL"
exit 0
