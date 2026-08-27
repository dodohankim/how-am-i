#!/usr/bin/env bash
# howami를 Claude Code 스킬로 설치한다.
# 레포 디렉토리를 ~/.claude/skills/howami 로 심볼릭 링크하므로,
# git pull 만 하면 스킬도 함께 갱신된다.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="${HOME}/.claude/skills/howami"
HOWAMI_HOME="${HOWAMI_HOME:-${HOME}/howami}"

mkdir -p "${HOME}/.claude/skills"

if [ -L "${SKILL_DIR}" ]; then
  current="$(readlink "${SKILL_DIR}")"
  if [ "${current}" = "${REPO_DIR}" ]; then
    echo "이미 설치되어 있습니다: ${SKILL_DIR} -> ${REPO_DIR}"
  else
    echo "기존 링크를 갱신합니다: ${current} -> ${REPO_DIR}"
    ln -sfn "${REPO_DIR}" "${SKILL_DIR}"
  fi
elif [ -e "${SKILL_DIR}" ]; then
  echo "오류: ${SKILL_DIR} 가 이미 있고 심볼릭 링크가 아닙니다." >&2
  echo "      직접 확인한 뒤 옮기거나 지우고 다시 실행하세요." >&2
  exit 1
else
  ln -s "${REPO_DIR}" "${SKILL_DIR}"
  echo "설치했습니다: ${SKILL_DIR} -> ${REPO_DIR}"
fi

mkdir -p "${HOWAMI_HOME}/data" "${HOWAMI_HOME}/insights"
echo "데이터 위치: ${HOWAMI_HOME}"
echo
echo "다음 단계:"
echo "  1) Claude Code를 재시작합니다"
echo "  2) /howami 를 입력하거나 '오늘 나 어때' 라고 말합니다"
