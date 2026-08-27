#!/usr/bin/env bash
# macOS · Linux 래퍼. 본체는 install.py 다. (Windows 는 install.cmd)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if command -v python3 >/dev/null 2>&1; then PY=python3; else PY=python; fi
exec "$PY" "${ROOT}/install.py" "$@"
