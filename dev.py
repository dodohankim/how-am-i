#!/usr/bin/env python3
"""howami 개발용: 파이썬 API 서버(핫리로드)와 vite 화면 서버를 한 번에 띄운다.

  python3 dev.py            # http://127.0.0.1:5173 (화면) + http://127.0.0.1:7788 (API)
  python3 dev.py --open     # 브라우저까지 연다
  ./dev.sh / dev.cmd        # 같은 것 (macOS·Linux / Windows 래퍼)

Ctrl+C 한 번이면 둘 다 종료된다.
  - scripts/*.py 를 고치면 파이썬 서버가 다시 뜬다 (scripts/serve.py 의 supervise)
  - web/src 를 고치면 vite 가 브라우저를 바로 갱신한다
빌드된 화면을 파이썬 서버 하나로만 보려면 `python3 scripts/serve.py --open`.

포트: HOWAMI_WEB_PORT (API, 기본 7788), HOWAMI_DEV_PORT (화면, 기본 5173)
macOS · Linux · Windows 공통. Node.js 18 이상이 필요하다.
"""

import argparse
import os
import shutil
import subprocess
import sys
import threading
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(ROOT, "scripts")
WEB = os.path.join(ROOT, "web")

sys.path.insert(0, SCRIPTS)
import serve  # noqa: E402


def main(argv=None):
    parser = argparse.ArgumentParser(description="howami 개발 서버 (API + 화면)")
    parser.add_argument("--open", action="store_true", help="브라우저까지 연다")
    parser.add_argument("--api-port", type=int, default=int(os.environ.get("HOWAMI_WEB_PORT", serve.DEFAULT_PORT)))
    parser.add_argument("--web-port", type=int, default=int(os.environ.get("HOWAMI_DEV_PORT", 5173)))
    args = parser.parse_args(argv)
    serve._utf8_stdout()
    serve.handle_sigterm_as_interrupt()

    node = shutil.which("node")
    npm = shutil.which("npm")
    if not node or not npm:
        print("Node.js 를 찾지 못했습니다. https://nodejs.org 에서 18 이상을 설치한 뒤 다시 실행하세요.", file=sys.stderr)
        return 1

    if not os.path.isdir(os.path.join(WEB, "node_modules")):
        print("web/node_modules 가 없어 npm install 을 먼저 실행합니다.")
        subprocess.check_call([npm, "install"], cwd=WEB)

    # vite 는 .cmd 래퍼(Windows) 대신 node 로 직접 띄운다. 종료할 때 껍데기만 죽고 본체가 남는 일이 없다.
    vite_js = os.path.join(WEB, "node_modules", "vite", "bin", "vite.js")
    if not os.path.isfile(vite_js):
        print("web/node_modules/vite 가 없습니다. `cd web && npm install` 을 실행하세요.", file=sys.stderr)
        return 1

    api_url = "http://127.0.0.1:%d" % args.api_port
    print("API 서버:  %s  (scripts/*.py 핫리로드)" % api_url)
    print("화면 서버: http://127.0.0.1:%d  (web/src 즉시 반영)" % args.web_port)
    print("종료: Ctrl+C")
    print()

    stop = threading.Event()
    api_argv = [sys.executable, os.path.join(SCRIPTS, "serve.py"), "--port", str(args.api_port)]
    api_thread = threading.Thread(
        target=serve.supervise, args=(api_argv, serve.child_env(), stop), kwargs={"label": "api"},
        name="howami-api", daemon=True,
    )
    api_thread.start()

    vite_argv = [node, vite_js, "--port", str(args.web_port), "--strictPort"]
    if args.open:
        vite_argv.append("--open")
    vite = subprocess.Popen(vite_argv, cwd=WEB, env=serve.child_env({"HOWAMI_API": api_url}))

    code = 0
    try:
        while api_thread.is_alive() and vite.poll() is None:
            time.sleep(0.5)
        if vite.poll() is not None and vite.returncode not in (0, None):
            print("vite 가 종료됐습니다 (코드 %s)." % vite.returncode, file=sys.stderr)
            code = 1
    except KeyboardInterrupt:
        pass
    finally:
        print("\n종료합니다.")
        stop.set()
        serve.stop_process(vite)
        api_thread.join(10)
    return code


if __name__ == "__main__":
    sys.exit(main())
