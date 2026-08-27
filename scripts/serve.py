#!/usr/bin/env python3
"""howami 로컬 웹 화면 서버.

내 PC 안에서만 도는 작은 HTTP 서버다. 127.0.0.1 에만 바인딩하며, 바깥으로는
어떤 요청도 보내지 않는다. 데이터 읽기는 전부 같은 디렉토리의 howami.py 에
위임하고, 이 파일은 그 결과를 JSON 으로 내주고 web/dist 의 정적 파일을 서빙만 한다.

  python3 scripts/serve.py            # http://127.0.0.1:7788
  python3 scripts/serve.py --open     # 브라우저까지 연다
  python3 scripts/serve.py --port 9000
  python3 scripts/serve.py --reload   # scripts/*.py 가 바뀌면 스스로 다시 시작한다 (개발용)
                                      # 서버와 화면을 같이 띄우려면 루트의 ./dev.sh

API (전부 읽기 전용)
  GET /api/context?days=14      howami.py context 와 같다 (하루 롤업·기준선·열린 처방)
  GET /api/stats?days=30        howami.py stats 와 같다 (0 이면 전체)
  GET /api/day/YYYY-MM-DD       howami.py day 와 같다 (그날 세션 전부, 본문 포함)
  GET /api/entries/<세션 id>     세션 md 원본 텍스트와 파싱 결과 (id 는 YYYY-MM-DD 또는 YYYY-MM-DD--HHMM)
  GET /api/questions            questions/core.<lang>.yaml 의 생활 영역(domains)과 상태 축(state_scan)
  GET /api/methods              questions/methods.yaml 의 기법 목록에 questions/references.yaml 의
                                기대 효과·외부 출처 링크를 합친 것
  GET /api/settings             데이터 위치(루트·md 폴더·DB 파일)와 파일 수·용량, 환경변수, 서버 정보

쓰기 성격의 API 는 하나뿐이다.
  POST /api/open  {"target": "home" | "data" | "db" | "insights"}
                                해당 폴더를 OS 파일 탐색기(Finder 등)로 연다. 미리 정한 네 곳만 열 수 있고,
                                임의 경로는 받지 않는다. 파일을 고치거나 지우지는 않는다.

표준 라이브러리만 사용한다. YAML 은 이 프로젝트가 쓰는 단순한 형태만 읽는
전용 파서로 처리한다.
"""

import argparse
import json
import mimetypes
import os
import re
import subprocess
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
HOWAMI_PY = os.path.join(HERE, "howami.py")
QUESTIONS_DIR = os.path.join(ROOT, "questions")
DIST_DIR = os.path.join(ROOT, "web", "dist")

sys.path.insert(0, HERE)
import howami  # noqa: E402  (같은 디렉토리의 저장소 계층)

DAY_RE = re.compile(r"\A\d{4}-\d{2}-\d{2}\Z")
ID_RE = re.compile(r"\A\d{4}-\d{2}-\d{2}(?:--[0-2]\d[0-5]\d)?\Z")
DEFAULT_PORT = 7788


# --------------------------------------------------------------------------
# howami.py 호출
# --------------------------------------------------------------------------

def run_howami(*argv):
    """howami.py 서브커맨드를 실행해 JSON 을 돌려준다. 실패하면 오류 객체를 돌려준다."""
    proc = subprocess.run(
        [sys.executable, HOWAMI_PY, *argv],
        capture_output=True, text=True, env=os.environ.copy(),
    )
    out = proc.stdout.strip()
    try:
        return json.loads(out) if out else {"ok": False, "error": proc.stderr.strip() or "빈 응답"}
    except ValueError:
        return {"ok": False, "error": (proc.stderr.strip() or out)[:2000]}


# --------------------------------------------------------------------------
# questions/*.yaml 읽기 (이 프로젝트의 단순한 YAML 형태만 지원)
# --------------------------------------------------------------------------

def _unquote(value):
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return value


def _inline_map(value):
    """`{ ko: 개방형 질문, en: Open question }` 같은 한 줄 맵을 읽는다."""
    body = value.strip()
    if not (body.startswith("{") and body.endswith("}")):
        return None
    result = {}
    for part in body[1:-1].split(","):
        if ":" not in part:
            continue
        key, _, val = part.partition(":")
        result[key.strip()] = _unquote(val)
    return result


def load_questions(lang):
    """질문 세트에서 점수를 매기는 항목만 뽑는다.

    v2: `domains:` (생활 영역) 과 `state_scan:` (상태 축), `domain_scan.anchors`
    v1: `scan:` 하나 (상태 축으로 취급)
    """
    path = os.path.join(QUESTIONS_DIR, "core.%s.yaml" % lang)
    if not os.path.exists(path):
        path = os.path.join(QUESTIONS_DIR, "core.ko.yaml")
        lang = "ko"
    groups = {"domains": [], "state_scan": [], "scan": []}
    domain_anchors = {}
    section, current, sub = None, None, None
    with open(path, encoding="utf-8") as handle:
        for raw in handle:
            line = raw.rstrip("\n")
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            indent = len(line) - len(line.lstrip())
            if indent == 0:
                section = stripped[:-1] if stripped.endswith(":") else None
                current, sub = None, None
                continue
            if section == "domain_scan":
                if indent == 2:
                    sub = stripped.rstrip(":") if stripped.endswith(":") else None
                elif sub == "anchors" and indent > 2:
                    key, _, val = stripped.partition(":")
                    if key.strip().isdigit():
                        domain_anchors[key.strip()] = _unquote(val)
                continue
            if section not in groups:
                continue
            if stripped.startswith("- key:"):
                current = {"key": _unquote(stripped[len("- key:"):]), "anchors": {}}
                groups[section].append(current)
                sub = None
                continue
            if current is None:
                continue
            key, _, val = stripped.partition(":")
            key = key.strip()
            if key == "anchors":
                sub = "anchors"
            elif sub == "anchors" and key.isdigit():
                current["anchors"][key] = _unquote(val)
            elif key in ("label", "question", "when", "probe_hint"):
                current[key] = _unquote(val)
                sub = None
            elif key == "default":
                current["default"] = _unquote(val).lower() == "true"
                sub = None
    states = groups["state_scan"] or groups["scan"]
    return {"lang": lang, "domains": groups["domains"], "domain_anchors": domain_anchors,
            "states": states}


def load_methods():
    path = os.path.join(QUESTIONS_DIR, "methods.yaml")
    items, current, block = [], None, None
    with open(path, encoding="utf-8") as handle:
        for raw in handle:
            line = raw.rstrip("\n")
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            indent = len(line) - len(line.lstrip())
            if stripped.startswith("- id:"):
                current = {"id": _unquote(stripped[len("- id:"):]), "name": {}, "summary": {}}
                items.append(current)
                block = None
                continue
            if current is None or indent < 4:
                continue
            key, _, val = stripped.partition(":")
            key = key.strip()
            if indent == 4:
                block = None
                if key == "name":
                    current["name"] = _inline_map(val) or {}
                elif key in ("summary", "say_it_as"):
                    if val.strip():
                        current[key] = _inline_map(val) or {}
                    else:
                        block = key
                        current.setdefault(key, {})
                elif key in ("stage", "origin", "evidence", "use_when"):
                    current[key] = _unquote(val)
            elif block and indent > 4 and key in ("ko", "en"):
                current[block][key] = _unquote(val)
    return {"methods": items}


def load_references():
    """questions/references.yaml 을 읽는다. general 목록과 id별 effect·links 만 다룬다."""
    path = os.path.join(QUESTIONS_DIR, "references.yaml")
    result = {"general": [], "references": {}}
    if not os.path.exists(path):
        return result
    section, current_id, current, block = None, None, None, None
    with open(path, encoding="utf-8") as handle:
        for raw in handle:
            line = raw.rstrip("\n")
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            indent = len(line) - len(line.lstrip())
            if indent == 0:
                section = stripped.rstrip(":") if stripped.endswith(":") else None
                current_id, current, block = None, None, None
                continue
            if section == "general":
                if stripped.startswith("- "):
                    result["general"].append({})
                    stripped = stripped[2:]
                key, _, val = stripped.partition(":")
                if result["general"]:
                    result["general"][-1][key.strip()] = _unquote(val)
            elif section == "references":
                if indent == 2 and stripped.endswith(":"):
                    current_id = stripped[:-1]
                    current = {"effect": {}, "links": []}
                    result["references"][current_id] = current
                    block = None
                elif current is None:
                    continue
                elif indent == 4:
                    key = stripped.rstrip(":")
                    block = key if key in ("effect", "links") else None
                elif block == "effect" and indent > 4:
                    key, _, val = stripped.partition(":")
                    current["effect"][key.strip()] = _unquote(val)
                elif block == "links" and stripped.startswith("- "):
                    item = _inline_map(stripped[2:])
                    if item and item.get("url"):
                        current["links"].append(item)
    return result


def load_methods_with_references():
    data = load_methods()
    refs = load_references()
    for item in data["methods"]:
        extra = refs["references"].get(item["id"], {})
        item["effect"] = extra.get("effect", {})
        item["links"] = extra.get("links", [])
    data["general_links"] = refs["general"]
    return data


# --------------------------------------------------------------------------
# 설정 화면용 정보와 폴더 열기
# --------------------------------------------------------------------------

def _dir_summary(path, suffix=None):
    """폴더 안 파일 수와 총 바이트. 없으면 exists=False."""
    if not os.path.isdir(path):
        return {"path": path, "exists": False, "files": 0, "bytes": 0}
    files, total = 0, 0
    for name in os.listdir(path):
        if suffix and not name.endswith(suffix):
            continue
        full = os.path.join(path, name)
        if os.path.isfile(full):
            files += 1
            total += os.path.getsize(full)
    return {"path": path, "exists": True, "files": files, "bytes": total}


def open_targets():
    """POST /api/open 이 열 수 있는 곳. 여기 없는 경로는 열지 않는다."""
    return {
        "home": howami.home_dir(),
        "data": howami.data_dir(),
        "insights": os.path.join(howami.home_dir(), "insights"),
        "db": howami.db_path(),
    }


def load_settings(port):
    where = run_howami("where")
    home = howami.home_dir()
    db = howami.db_path()
    db_info = {"path": db, "exists": os.path.isfile(db),
               "bytes": os.path.getsize(db) if os.path.isfile(db) else 0}
    return {
        "home": home,
        "home_env": os.environ.get("HOWAMI_HOME") or None,
        "data": _dir_summary(howami.data_dir(), ".md"),
        "insights": _dir_summary(os.path.join(home, "insights"), ".md"),
        "db": db_info,
        "db_entries": where.get("db_entries"),
        "db_days": where.get("db_days"),
        "schema_version": where.get("schema_version"),
        "project_root": ROOT,
        "questions_dir": QUESTIONS_DIR,
        "server": {"url": "http://127.0.0.1:%d" % port, "port": port,
                   "python": sys.version.split()[0], "platform": sys.platform},
        "can_open": sys.platform in ("darwin", "win32") or bool(_which("xdg-open")),
    }


def _which(name):
    for folder in os.environ.get("PATH", "").split(os.pathsep):
        full = os.path.join(folder, name)
        if os.path.isfile(full) and os.access(full, os.X_OK):
            return full
    return None


def open_in_file_manager(target):
    """target 키에 해당하는 폴더를 OS 파일 탐색기로 연다. 파일(db)이면 그 파일이 있는 폴더를 열어 선택한다."""
    targets = open_targets()
    if target not in targets:
        return {"ok": False, "error": "열 수 있는 대상은 %s 뿐입니다" % ", ".join(sorted(targets))}
    path = targets[target]
    if not os.path.exists(path):
        return {"ok": False, "error": "아직 없습니다: %s (첫 기록을 남기면 생깁니다)" % path}
    is_file = os.path.isfile(path)
    if sys.platform == "darwin":
        cmd = ["open", "-R", path] if is_file else ["open", path]
    elif sys.platform == "win32":
        cmd = ["explorer", "/select,", path] if is_file else ["explorer", path]
    else:
        opener = _which("xdg-open")
        if not opener:
            return {"ok": False, "error": "xdg-open 이 없어 폴더를 열 수 없습니다. 경로를 복사해 직접 여세요."}
        cmd = [opener, os.path.dirname(path) if is_file else path]
    try:
        subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError as exc:
        return {"ok": False, "error": "폴더를 열지 못했습니다: %s" % exc}
    return {"ok": True, "opened": path}


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    server_version = "howami-web/0.1"

    def log_message(self, fmt, *args):  # 조용히
        if os.environ.get("HOWAMI_WEB_DEBUG"):
            super().log_message(fmt, *args)

    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        query = {k: v[-1] for k, v in parse_qs(url.query).items()}
        path = url.path

        if path.startswith("/api/"):
            return self.handle_api(path, query)
        return self.serve_static(path)

    def do_POST(self):
        url = urlparse(self.path)
        if url.path != "/api/open":
            return self.send_json({"ok": False, "error": "없는 API 입니다: %s" % url.path}, 404)
        # 브라우저의 다른 사이트에서 이 로컬 서버로 요청을 흘려보내는 것을 막는다.
        origin = self.headers.get("Origin") or ""
        host = self.headers.get("Host") or ""
        if origin and urlparse(origin).netloc not in (host, "127.0.0.1:5173", "localhost:5173"):
            return self.send_json({"ok": False, "error": "허용되지 않은 출처입니다"}, 403)
        try:
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length) or b"{}") if length else {}
        except (ValueError, TypeError):
            return self.send_json({"ok": False, "error": "본문이 JSON 이 아닙니다"}, 400)
        result = open_in_file_manager(str(body.get("target", "")))
        return self.send_json(result, 200 if result.get("ok") else 400)

    def handle_api(self, path, query):
        try:
            if path == "/api/context":
                days = _int(query.get("days"), 14, 1, 3650)
                limit = _int(query.get("limit"), 30, 1, 1000)
                return self.send_json(run_howami("context", "--days", str(days), "--limit", str(limit), "--full"))
            if path.startswith("/api/day/"):
                day = path[len("/api/day/"):]
                if not DAY_RE.match(day):
                    return self.send_json({"ok": False, "error": "날짜 형식은 YYYY-MM-DD 입니다"}, 400)
                return self.send_json(run_howami("day", "--date", day))
            if path == "/api/stats":
                days = _int(query.get("days"), 30, 0, 3650)
                return self.send_json(run_howami("stats", "--days", str(days)))
            if path == "/api/where":
                return self.send_json(run_howami("where"))
            if path == "/api/settings":
                return self.send_json(load_settings(self.server.server_address[1]))
            if path == "/api/questions":
                return self.send_json(load_questions(query.get("lang", "ko")))
            if path == "/api/methods":
                return self.send_json(load_methods_with_references())
            if path.startswith("/api/entries/"):
                entry_id = path[len("/api/entries/"):]
                if not ID_RE.match(entry_id):
                    return self.send_json({"ok": False, "error": "세션 id 형식은 YYYY-MM-DD 또는 YYYY-MM-DD--HHMM 입니다"}, 400)
                file_path = howami.entry_path(entry_id)
                if not os.path.exists(file_path):
                    return self.send_json({"ok": False, "error": "%s 기록이 없습니다" % entry_id}, 404)
                entry = howami.read_entry_file(entry_id)
                with open(file_path, encoding="utf-8") as handle:
                    entry["raw"] = handle.read()
                return self.send_json(entry)
            return self.send_json({"ok": False, "error": "없는 API 입니다: %s" % path}, 404)
        except Exception as exc:  # 화면이 빈 채로 멈추지 않도록 오류를 그대로 보여준다
            return self.send_json({"ok": False, "error": "%s: %s" % (type(exc).__name__, exc)}, 500)

    def serve_static(self, path):
        if not os.path.isdir(DIST_DIR):
            body = (
                "<!doctype html><meta charset='utf-8'>"
                "<title>howami</title>"
                "<body style='font-family:system-ui;padding:2rem;line-height:1.7'>"
                "<h1>화면이 아직 빌드되지 않았습니다</h1>"
                "<p>API 는 동작 중입니다. 화면을 보려면 다음 중 하나를 실행하세요.</p>"
                "<pre>cd web &amp;&amp; npm install &amp;&amp; npm run build   # 그 뒤 이 페이지 새로고침\n"
                "cd web &amp;&amp; npm install &amp;&amp; npm run dev     # 개발 모드: http://127.0.0.1:5173</pre>"
                "<p><a href='/api/context'>/api/context</a> · <a href='/api/stats'>/api/stats</a></p>"
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        rel = os.path.normpath(path.lstrip("/")) if path not in ("", "/") else "index.html"
        full = os.path.join(DIST_DIR, rel)
        if not full.startswith(DIST_DIR) or not os.path.isfile(full):
            full = os.path.join(DIST_DIR, "index.html")  # SPA fallback
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        with open(full, "rb") as handle:
            body = handle.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        if rel.startswith("assets/"):
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        else:
            self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


# --------------------------------------------------------------------------
# 핫리로드 (--reload)
# --------------------------------------------------------------------------

def _watched_files():
    """감시할 파일: scripts/ 안의 .py 전부. questions/*.yaml 은 요청마다 새로 읽으므로 감시할 필요가 없다."""
    return sorted(
        os.path.join(HERE, name) for name in os.listdir(HERE) if name.endswith(".py")
    )


def _mtimes():
    result = {}
    for path in _watched_files():
        try:
            result[path] = os.stat(path).st_mtime
        except OSError:
            pass
    return result


def start_reloader(interval=0.7):
    """백그라운드에서 파일 수정 시각을 살피다가 바뀌면 현재 프로세스를 같은 인자로 다시 실행한다.

    os.execv 로 프로세스 자체가 교체되므로 pid 와 터미널은 그대로고, 열어 둔 소켓은
    (파이썬 소켓은 exec 시 상속되지 않으므로) 닫힌 뒤 새 프로세스가 다시 바인딩한다.
    --open 은 처음 한 번만 뜻이 있으니 재실행 인자에서 뺀다.
    """
    before = _mtimes()

    def loop():
        while True:
            time.sleep(interval)
            now = _mtimes()
            changed = [p for p in now if now[p] != before.get(p)] + [p for p in before if p not in now]
            if not changed:
                continue
            names = ", ".join(os.path.basename(p) for p in changed)
            print("바뀜: %s → 다시 시작합니다" % names, flush=True)
            argv = [a for a in sys.argv if a != "--open"]
            env = dict(os.environ, PYTHONUNBUFFERED="1")  # 재실행 뒤에도 로그가 바로 보이게
            os.execve(sys.executable, [sys.executable, *argv], env)

    thread = threading.Thread(target=loop, name="howami-reload", daemon=True)
    thread.start()


def _int(value, default, lo, hi):
    try:
        return max(lo, min(hi, int(value)))
    except (TypeError, ValueError):
        return default


def main(argv=None):
    parser = argparse.ArgumentParser(description="howami 로컬 웹 화면")
    parser.add_argument("--port", type=int, default=int(os.environ.get("HOWAMI_WEB_PORT", DEFAULT_PORT)))
    parser.add_argument("--open", action="store_true", help="시작하면서 브라우저를 연다")
    parser.add_argument("--reload", action="store_true", help="scripts/*.py 가 바뀌면 스스로 다시 시작한다 (개발용)")
    args = parser.parse_args(argv)

    mimetypes.add_type("application/javascript", ".js")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    url = "http://127.0.0.1:%d" % args.port
    print("howami 웹 화면: %s" % url)
    print("데이터 위치:    %s" % howami.home_dir())
    if not os.path.isdir(DIST_DIR):
        print("안내: web/dist 가 없습니다. `cd web && npm install && npm run build` 후 새로고침하세요.")
    if args.reload:
        start_reloader()
        print("핫리로드:      scripts/*.py 를 감시 중")
    print("종료: Ctrl+C")
    if args.open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n종료합니다.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
