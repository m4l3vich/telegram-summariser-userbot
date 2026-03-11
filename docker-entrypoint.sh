#!/bin/sh
set -e

case "$1" in
  setup)
    exec pnpm setup:prod
    ;;
  *)
    exec pnpm start
    ;;
esac
