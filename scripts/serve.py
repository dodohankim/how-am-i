#!/usr/bin/env python3
"""howami 로컬 웹 화면 서버.

내 PC 안에서만 도는 작은 HTTP 서버다. 127.0.0.1 에만 바인딩하며, 바깥으로는
어떤 요청도 보내지 않는다. 데이터 읽기는 전부 같은 디렉토리의 howami.py 에
위임하고, 이 파일은 그 결과를 JSON 으로 내주고 web/dist 의 정적 파일을 서빙만 한다.

  python3 scripts/serve.py            # http://127.0.0.1:7788
  python3 scripts/serve.py --open     # 브라우저까지 연다
  python3 scripts/serve.py --port 9000

API (전부 읽기 전용)
  GET /api/context?days=14      howami.py context 와 같다 (하루 롤업·기준선·열린 처방)
  GET /api/stats?days=30        howami.py stats 와 같다 (0 이면 전체)
  GET /api/day/YYYY-MM-DD       howami.py day 와 같다 (그날 세션 전부, 본문 포함)
  GET /api/entries/<세션 id>     세션 md 원본 텍스트와 파싱 결과 (id 는 YYYY-MM-DD 또는 YYYY-MM-DD--HHMM)
  GET /api/questions            questions/core.<lang>.yaml 의 생활 영역(domains)과 상태 축(state_scan)
  GET /api/methods              questions/methods.yaml 의 기법 목록에 questions/references.yaml 의
                                기대 효과·외부 출처 링크를 합친 것

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


def _int(value, default, lo, hi):
    try:
        return max(lo, min(hi, int(value)))
    except (TypeError, ValueError):
        return default


def main(argv=None):
    parser = argparse.ArgumentParser(description="howami 로컬 웹 화면")
    parser.add_argument("--port", type=int, default=int(os.environ.get("HOWAMI_WEB_PORT", DEFAULT_PORT)))
    parser.add_argument("--open", action="store_true", help="시작하면서 브라우저를 연다")
    args = parser.parse_args(argv)

    mimetypes.add_type("application/javascript", ".js")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    url = "http://127.0.0.1:%d" % args.port
    print("howami 웹 화면: %s" % url)
    print("데이터 위치:    %s" % howami.home_dir())
    if not os.path.isdir(DIST_DIR):
        print("안내: web/dist 가 없습니다. `cd web && npm install && npm run build` 후 새로고침하세요.")
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
