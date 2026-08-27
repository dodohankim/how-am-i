#!/usr/bin/env bash
# macOS · Linux 래퍼. 본체는 dev.py 다. (Windows 는 dev.cmd)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if command -v python3 >/dev/null 2>&1; then PY=python3; else PY=python; fi
exec "$PY" "${ROOT}/dev.py" "$@"
