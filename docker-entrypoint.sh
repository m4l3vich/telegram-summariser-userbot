#!/bin/sh
set -e

DATA_DIR="${DATA_DIR:-/app/data}"
export DATA_DIR
mkdir -p "$DATA_DIR"

case "$1" in
  setup)
    exec pnpm setup:prod
    ;;
  *)
    if [ -f "$DATA_DIR/.env" ]; then
      export DOTENV_CONFIG_PATH="$DATA_DIR/.env"
    fi
    exec pnpm start
    ;;
esac
