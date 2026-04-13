#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$SCRIPT_DIR"

cd "$APP_ROOT"

unset ELECTRON_RUN_AS_NODE

if [[ ! -d node_modules/electron ]]; then
  echo "Electron 依赖未安装，先执行 npm run install:mirror"
  exec zsh
fi

npm start
