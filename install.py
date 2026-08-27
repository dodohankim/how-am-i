#!/usr/bin/env python3
"""howami 를 Claude Code 스킬로 설치한다. macOS · Linux · Windows 공통.

레포 디렉토리를 ~/.claude/skills/howami 로 링크하므로, git pull 만 하면 스킬도 함께 갱신된다.
  - macOS · Linux: 심볼릭 링크
  - Windows: 심볼릭 링크를 시도하고, 권한(개발자 모드/관리자)이 없으면 정션(mklink /J)으로 만든다.
    정션은 관리자 권한 없이 만들 수 있고 Claude Code 가 읽기에는 차이가 없다.

  python3 install.py        (./install.sh, install.cmd 도 같은 것)

Claude 설정 디렉토리는 CLAUDE_CONFIG_DIR, 데이터 위치는 HOWAMI_HOME 환경변수를 따른다.
"""

import os
import stat
import subprocess
import sys

REPO_DIR = os.path.dirname(os.path.abspath(__file__))
CLAUDE_DIR = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(os.path.expanduser("~"), ".claude")
SKILL_DIR = os.path.join(CLAUDE_DIR, "skills", "howami")
HOWAMI_HOME = os.path.abspath(os.path.expanduser(
    os.environ.get("HOWAMI_HOME") or os.path.join(os.path.expanduser("~"), "howami")))


def is_link(path):
    """심볼릭 링크 또는 Windows 정션이면 True."""
    if os.path.islink(path):
        return True
    if sys.platform == "win32":
        try:
            attrs = os.lstat(path).st_file_attributes
            return bool(attrs & stat.FILE_ATTRIBUTE_REPARSE_POINT)
        except (OSError, AttributeError):
            return False
    return False


def remove_link(path):
    if sys.platform == "win32" and os.path.isdir(path):
        os.rmdir(path)  # 정션·디렉토리 심볼릭 링크는 rmdir 로 지운다. 안의 파일은 건드리지 않는다.
    else:
        os.unlink(path)


def make_link(target, link):
    try:
        os.symlink(target, link, target_is_directory=True)
        return "심볼릭 링크"
    except OSError as exc:
        if sys.platform != "win32":
            raise
        # Windows: 개발자 모드나 관리자 권한이 없으면 symlink 가 막힌다. 정션으로 대신한다.
        proc = subprocess.run(["cmd", "/c", "mklink", "/J", link, target], capture_output=True, text=True)
        if proc.returncode != 0:
            raise OSError("symlink 실패(%s) 뒤 mklink /J 도 실패했습니다: %s" % (exc, proc.stderr.strip() or proc.stdout.strip()))
        return "정션(junction)"


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except (ValueError, OSError):
                pass

    os.makedirs(os.path.dirname(SKILL_DIR), exist_ok=True)

    if os.path.lexists(SKILL_DIR):
        if not is_link(SKILL_DIR):
            print("오류: %s 가 이미 있고 링크가 아닙니다." % SKILL_DIR, file=sys.stderr)
            print("      직접 확인한 뒤 옮기거나 지우고 다시 실행하세요.", file=sys.stderr)
            return 1
        current = os.path.realpath(SKILL_DIR)
        if os.path.normcase(current) == os.path.normcase(os.path.realpath(REPO_DIR)):
            print("이미 설치되어 있습니다: %s -> %s" % (SKILL_DIR, REPO_DIR))
        else:
            print("기존 링크를 갱신합니다: %s -> %s" % (current, REPO_DIR))
            remove_link(SKILL_DIR)
            kind = make_link(REPO_DIR, SKILL_DIR)
            print("설치했습니다(%s): %s -> %s" % (kind, SKILL_DIR, REPO_DIR))
    else:
        kind = make_link(REPO_DIR, SKILL_DIR)
        print("설치했습니다(%s): %s -> %s" % (kind, SKILL_DIR, REPO_DIR))

    for sub in ("data", "insights"):
        os.makedirs(os.path.join(HOWAMI_HOME, sub), exist_ok=True)
    print("데이터 위치: %s" % HOWAMI_HOME)
    print()
    print("다음 단계:")
    print("  1) Claude Code를 재시작합니다")
    print("  2) /howami 를 입력하거나 '오늘 나 어때' 라고 말합니다")
    return 0


if __name__ == "__main__":
    sys.exit(main())
