#!/usr/bin/env bash
# howami 개발용: 파이썬 API 서버(핫리로드)와 vite 화면 서버를 한 번에 띄운다.
#
#   ./dev.sh          # http://127.0.0.1:5173 (화면) + http://127.0.0.1:7788 (API)
#   ./dev.sh --open   # 브라우저까지 연다
#
# Ctrl+C 한 번이면 둘 다 종료된다.
#   - scripts/*.py 를 고치면 파이썬 서버가 스스로 다시 시작한다 (serve.py --reload)
#   - web/src 를 고치면 vite 가 브라우저를 바로 갱신한다
# 빌드된 화면을 파이썬 서버 하나로만 보려면 `python3 scripts/serve.py --open` 을 쓴다.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_PORT="${HOWAMI_WEB_PORT:-7788}"
WEB_PORT="${HOWAMI_DEV_PORT:-5173}"
OPEN=0
for arg in "$@"; do
  case "$arg" in
    --open) OPEN=1 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "모르는 옵션: $arg" >&2; exit 1 ;;
  esac
done

if [ ! -d "${ROOT}/web/node_modules" ]; then
  echo "web/node_modules 가 없어 npm install 을 먼저 실행합니다."
  (cd "${ROOT}/web" && npm install)
fi

PIDS=()
cleanup() {
  trap - INT TERM EXIT
  echo
  echo "종료합니다."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "API 서버:  http://127.0.0.1:${API_PORT}  (scripts/*.py 핫리로드)"
echo "화면 서버: http://127.0.0.1:${WEB_PORT}  (web/src 즉시 반영)"
echo "종료: Ctrl+C"
echo

# 파이썬 API 서버 (핫리로드)
( cd "${ROOT}" && exec python3 -u scripts/serve.py --port "${API_PORT}" --reload ) &
PIDS+=($!)

# vite 화면 서버. /api 는 API_PORT 로 프록시한다 (web/vite.config.ts 의 HOWAMI_API).
VITE_ARGS=(--port "${WEB_PORT}" --strictPort)
[ "${OPEN}" = 1 ] && VITE_ARGS+=(--open)
( cd "${ROOT}/web" && HOWAMI_API="http://127.0.0.1:${API_PORT}" exec ./node_modules/.bin/vite "${VITE_ARGS[@]}" ) &
PIDS+=($!)

wait
