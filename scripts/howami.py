#!/usr/bin/env python3
"""howami - 로컬 퍼스트 데일리 자기진단 저장소 계층.

이 스크립트는 진단 대화를 하지 않는다. 대화는 AI 에이전트가 SKILL.md를 따라
진행하고, 이 스크립트는 오직 읽기와 쓰기만 담당한다.

  context   최근 기록 요약을 JSON으로 출력 (에이전트가 대화 전에 호출)
  save      오늘 기록을 md 원본으로 쓰고 DB에 반영
  stats     누적 점수의 패턴을 SQL로 집계해 출력
  query     DB에 읽기 전용 SQL을 던진다
  sync      md 원본과 DB를 맞춘다
  where     경로와 DB 상태 출력

**md가 원본이고 SQLite는 파생 인덱스다.** DB를 지워도 md만 있으면
`sync --rebuild` 한 번으로 완전히 복원된다. 반대는 성립하지 않는다.

데이터 루트는 환경변수 HOWAMI_HOME, 없으면 ~/howami 이다.
표준 라이브러리만 사용하며 네트워크에 접속하지 않는다.
"""

import argparse
import json
import os
import re
import sqlite3
import sys
from datetime import date, datetime, timedelta

SCHEMA_VERSION = 1
WEEKDAY_KO = ["월", "화", "수", "목", "금", "토", "일"]
WEEKDAY_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


# --------------------------------------------------------------------------
# 경로
# --------------------------------------------------------------------------

def home_dir():
    raw = os.environ.get("HOWAMI_HOME") or os.path.join(os.path.expanduser("~"), "howami")
    return os.path.abspath(os.path.expanduser(raw))


def data_dir():
    return os.path.join(home_dir(), "data")


def db_path():
    return os.path.join(home_dir(), "howami.db")


def entry_path(day):
    return os.path.join(data_dir(), "%s.md" % day)


def ensure_dirs():
    for path in (data_dir(), os.path.join(home_dir(), "insights")):
        os.makedirs(path, exist_ok=True)


# --------------------------------------------------------------------------
# md 원본 읽기
# --------------------------------------------------------------------------

FM_RE = re.compile(r"\A---\n(.*?)\n---\n?(.*)\Z", re.S)
DAY_RE = re.compile(r"\A\d{4}-\d{2}-\d{2}\Z")


def parse_entry(text):
    """일별 기록 md에서 frontmatter와 본문을 뽑아낸다.

    frontmatter의 값은 전부 JSON 리터럴로 쓴다. 사람이 손으로 고쳐서 JSON으로
    못 읽는 값이 되면 따옴표만 벗겨 문자열로 넘긴다.
    """
    match = FM_RE.match(text)
    if not match:
        return {}, text
    meta = {}
    for line in match.group(1).split("\n"):
        if not line.strip() or line.lstrip().startswith("#") or ":" not in line:
            continue
        key, _, value = line.partition(":")
        value = value.strip()
        try:
            meta[key.strip()] = json.loads(value)
        except ValueError:
            meta[key.strip()] = value.strip("'\"")
    return meta, match.group(2)


def read_entry_file(day):
    path = entry_path(day)
    with open(path, encoding="utf-8") as handle:
        meta, body = parse_entry(handle.read())

    scores = meta.get("scores")
    if not isinstance(scores, dict):
        scores = {}
    clean_scores = {}
    for key, value in scores.items():
        if isinstance(value, bool):
            continue
        if isinstance(value, int) and 1 <= value <= 5:
            clean_scores[str(key)] = value

    flags = meta.get("flags")
    if not isinstance(flags, list):
        flags = []

    methods = meta.get("methods")
    if not isinstance(methods, list):
        methods = []

    done = meta.get("prev_prescription_done")
    if not isinstance(done, bool):
        done = None

    prescription = meta.get("prescription")
    if not isinstance(prescription, str) or not prescription.strip():
        prescription = None

    return {
        "date": day,
        "scores": clean_scores,
        "flags": [str(f) for f in flags],
        "methods": [str(m) for m in methods],
        "prescription": prescription,
        "prev_prescription_done": done,
        "body": body.strip(),
        "path": path,
    }


def scan_files():
    """data/ 의 md 파일을 {날짜: (mtime, size)} 로 훑는다."""
    found = {}
    if not os.path.isdir(data_dir()):
        return found
    for name in sorted(os.listdir(data_dir())):
        if not name.endswith(".md") or not DAY_RE.match(name[:-3]):
            continue
        path = os.path.join(data_dir(), name)
        stat = os.stat(path)
        found[name[:-3]] = (round(stat.st_mtime, 3), stat.st_size)
    return found


def weekday_num(day):
    return datetime.strptime(day, "%Y-%m-%d").weekday()


# --------------------------------------------------------------------------
# SQLite - 파생 인덱스
# --------------------------------------------------------------------------

SCHEMA_SQL = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS entries (
    date                   TEXT PRIMARY KEY,     -- YYYY-MM-DD
    weekday                INTEGER NOT NULL,     -- 0=월 .. 6=일
    prescription           TEXT,
    prev_prescription_done INTEGER,              -- 0 / 1 / NULL
    body                   TEXT,
    source_path            TEXT NOT NULL,
    source_mtime           REAL NOT NULL,
    source_size            INTEGER NOT NULL,
    synced_at              TEXT NOT NULL
);

-- 점수는 세로로 쌓는다. 질문 세트를 바꿔도 테이블 스키마는 그대로다.
CREATE TABLE IF NOT EXISTS scores (
    date  TEXT NOT NULL REFERENCES entries(date) ON DELETE CASCADE,
    key   TEXT NOT NULL,
    value INTEGER NOT NULL CHECK (value BETWEEN 1 AND 5),
    PRIMARY KEY (date, key)
);

CREATE TABLE IF NOT EXISTS flags (
    date TEXT NOT NULL REFERENCES entries(date) ON DELETE CASCADE,
    flag TEXT NOT NULL,
    PRIMARY KEY (date, flag)
);

-- 그날 진단에 참고한 기법. id는 questions/methods.yaml 카탈로그를 따른다.
CREATE TABLE IF NOT EXISTS methods (
    date   TEXT NOT NULL REFERENCES entries(date) ON DELETE CASCADE,
    method TEXT NOT NULL,
    PRIMARY KEY (date, method)
);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scores_key_date ON scores(key, date);
CREATE INDEX IF NOT EXISTS idx_entries_weekday ON entries(weekday);
CREATE INDEX IF NOT EXISTS idx_flags_flag ON flags(flag);
CREATE INDEX IF NOT EXISTS idx_methods_method ON methods(method);
"""


def connect(readonly=False):
    ensure_dirs()
    conn = sqlite3.connect(db_path())
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA_SQL)
    conn.execute(
        "INSERT INTO meta(key, value) VALUES('schema_version', ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (str(SCHEMA_VERSION),),
    )
    conn.commit()
    if readonly:
        conn.execute("PRAGMA query_only = ON")
    return conn


def upsert_entry(conn, entry, stat):
    mtime, size = stat
    conn.execute(
        "INSERT INTO entries(date, weekday, prescription, prev_prescription_done,"
        " body, source_path, source_mtime, source_size, synced_at)"
        " VALUES(?,?,?,?,?,?,?,?,?)"
        " ON CONFLICT(date) DO UPDATE SET"
        "  weekday=excluded.weekday, prescription=excluded.prescription,"
        "  prev_prescription_done=excluded.prev_prescription_done, body=excluded.body,"
        "  source_path=excluded.source_path, source_mtime=excluded.source_mtime,"
        "  source_size=excluded.source_size, synced_at=excluded.synced_at",
        (
            entry["date"],
            weekday_num(entry["date"]),
            entry["prescription"],
            None if entry["prev_prescription_done"] is None else int(entry["prev_prescription_done"]),
            entry["body"],
            entry["path"],
            mtime,
            size,
            datetime.now().isoformat(timespec="seconds"),
        ),
    )
    conn.execute("DELETE FROM scores WHERE date = ?", (entry["date"],))
    conn.executemany(
        "INSERT INTO scores(date, key, value) VALUES(?,?,?)",
        [(entry["date"], k, v) for k, v in sorted(entry["scores"].items())],
    )
    conn.execute("DELETE FROM flags WHERE date = ?", (entry["date"],))
    conn.executemany(
        "INSERT INTO flags(date, flag) VALUES(?,?)",
        [(entry["date"], f) for f in sorted(set(entry["flags"]))],
    )
    conn.execute("DELETE FROM methods WHERE date = ?", (entry["date"],))
    conn.executemany(
        "INSERT INTO methods(date, method) VALUES(?,?)",
        [(entry["date"], m) for m in sorted(set(entry["methods"]))],
    )


def sync(conn, rebuild=False):
    """md 원본을 정본으로 삼아 DB를 맞춘다.

    파일의 mtime과 크기가 DB에 적힌 것과 같으면 건너뛴다. 손으로 md를 고쳤거나
    다른 기기에서 받아온 파일은 여기서 자동으로 반영된다.
    """
    if rebuild:
        conn.executescript("DELETE FROM methods; DELETE FROM flags; DELETE FROM scores; DELETE FROM entries;")

    on_disk = scan_files()
    known = {
        row["date"]: (row["source_mtime"], row["source_size"])
        for row in conn.execute("SELECT date, source_mtime, source_size FROM entries")
    }

    added, updated, failed = [], [], []
    for day, stat in on_disk.items():
        if known.get(day) == stat:
            continue
        try:
            entry = read_entry_file(day)
        except (OSError, UnicodeDecodeError) as exc:
            failed.append({"date": day, "error": str(exc)})
            continue
        upsert_entry(conn, entry, stat)
        (updated if day in known else added).append(day)

    removed = sorted(set(known) - set(on_disk))
    for day in removed:
        conn.execute("DELETE FROM entries WHERE date = ?", (day,))

    conn.commit()
    return {"added": sorted(added), "updated": sorted(updated),
            "removed": removed, "failed": failed}


# --------------------------------------------------------------------------
# 조회 헬퍼
# --------------------------------------------------------------------------

def entry_rows(conn, limit=None, until=None):
    sql = ("SELECT date, weekday, prescription, prev_prescription_done"
           " FROM entries")
    params = []
    if until:
        sql += " WHERE date <= ?"
        params.append(until)
    sql += " ORDER BY date DESC"
    if limit:
        sql += " LIMIT ?"
        params.append(limit)
    rows = list(conn.execute(sql, params))[::-1]
    return [dict(r) for r in rows]


def attach_details(conn, rows):
    if not rows:
        return rows
    days = [r["date"] for r in rows]
    marks = ",".join("?" * len(days))
    scores = {}
    for r in conn.execute("SELECT date, key, value FROM scores WHERE date IN (%s)" % marks, days):
        scores.setdefault(r["date"], {})[r["key"]] = r["value"]
    flags = {}
    for r in conn.execute("SELECT date, flag FROM flags WHERE date IN (%s)" % marks, days):
        flags.setdefault(r["date"], []).append(r["flag"])
    methods = {}
    for r in conn.execute("SELECT date, method FROM methods WHERE date IN (%s)" % marks, days):
        methods.setdefault(r["date"], []).append(r["method"])
    for row in rows:
        row["weekday_label"] = WEEKDAY_KO[row["weekday"]]
        row["scores"] = scores.get(row["date"], {})
        row["flags"] = flags.get(row["date"], [])
        row["methods"] = methods.get(row["date"], [])
        done = row.pop("prev_prescription_done")
        row["prev_prescription_done"] = None if done is None else bool(done)
    return rows


# --------------------------------------------------------------------------
# context
# --------------------------------------------------------------------------

DROP_THRESHOLD = 2  # 기준선보다 이만큼 떨어지면 급락으로 본다


def cmd_context(args):
    conn = connect()
    synced = sync(conn)
    today = args.date or date.today().isoformat()

    history = attach_details(conn, entry_rows(conn, limit=args.days, until=today))
    prior = [h for h in history if h["date"] != today]

    baseline = {}
    for row in conn.execute(
        "SELECT key, ROUND(AVG(value), 2) AS mean FROM scores"
        " WHERE date < ? AND date >= ? GROUP BY key",
        (today, (datetime.strptime(today, "%Y-%m-%d") - timedelta(days=7)).date().isoformat()),
    ):
        baseline[row["key"]] = row["mean"]

    total = conn.execute("SELECT COUNT(*) AS n FROM entries").fetchone()["n"]
    exists = conn.execute("SELECT 1 FROM entries WHERE date = ?", (today,)).fetchone() is not None
    last = prior[-1] if prior else None

    return emit({
        "home": home_dir(),
        "db": db_path(),
        "today": today,
        "today_entry_exists": exists,
        "streak_days": streak(conn, today),
        "total_entries": total,
        "last_entry": last,
        "open_prescription": (last or {}).get("prescription"),
        "baseline_7d": baseline,
        "drop_threshold": DROP_THRESHOLD,
        "history": history,
        "synced": summarize_sync(synced),
    })


def streak(conn, today):
    """오늘 또는 어제부터 거꾸로 며칠 연속으로 기록했는지 센다."""
    have = {r["date"] for r in conn.execute(
        "SELECT date FROM entries WHERE date <= ? ORDER BY date DESC LIMIT 400", (today,))}
    cursor = datetime.strptime(today, "%Y-%m-%d").date()
    if cursor.isoformat() not in have:
        cursor -= timedelta(days=1)
    count = 0
    while cursor.isoformat() in have:
        count += 1
        cursor -= timedelta(days=1)
    return count


def summarize_sync(result):
    changed = {k: v for k, v in result.items() if v}
    return changed or None


# --------------------------------------------------------------------------
# save
# --------------------------------------------------------------------------

def cmd_save(args):
    ensure_dirs()
    raw = args.json
    if raw in (None, "-"):
        raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except ValueError as exc:
        return fail("payload가 올바른 JSON이 아닙니다: %s" % exc)

    day = payload.get("date") or date.today().isoformat()
    if not DAY_RE.match(str(day)):
        return fail("date는 YYYY-MM-DD 형식이어야 합니다: %r" % day)

    scores = payload.get("scores") or {}
    if not isinstance(scores, dict):
        return fail("scores는 객체여야 합니다")
    for key, value in scores.items():
        if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 5:
            return fail("scores.%s는 1~5 사이 정수여야 합니다: %r" % (key, value))

    path = entry_path(day)
    if os.path.exists(path) and not args.force:
        return fail("%s 기록이 이미 있습니다. 덮어쓰려면 --force를 주세요." % day)

    meta = {
        "date": day,
        "scores": scores,
        "flags": payload.get("flags") or [],
        "methods": payload.get("methods") or [],
        "prescription": payload.get("prescription"),
        "prev_prescription_done": payload.get("prev_prescription_done"),
    }
    lines = ["---"]
    for key, value in meta.items():
        lines.append("%s: %s" % (key, json.dumps(value, ensure_ascii=False)))
    lines += ["---", "", payload.get("body", "").rstrip(), ""]

    with open(path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))

    conn = connect()
    sync(conn)
    total = conn.execute("SELECT COUNT(*) AS n FROM entries").fetchone()["n"]
    return emit({"ok": True, "path": path, "date": day, "db": db_path(), "total_entries": total})


# --------------------------------------------------------------------------
# stats
# --------------------------------------------------------------------------

def cmd_stats(args):
    conn = connect()
    sync(conn)

    where, params = "", []
    if args.days:
        cutoff = (date.today() - timedelta(days=args.days - 1)).isoformat()
        where, params = " WHERE date >= ?", [cutoff]

    span = conn.execute(
        "SELECT MIN(date) AS a, MAX(date) AS b, COUNT(*) AS n FROM entries" + where, params
    ).fetchone()
    if not span["n"]:
        return emit({"entries": 0, "note": "아직 기록이 없습니다."})

    summary = {}
    for row in conn.execute(
        "SELECT key, COUNT(*) AS n, ROUND(AVG(value), 2) AS mean,"
        " MIN(value) AS lo, MAX(value) AS hi FROM scores"
        " WHERE date >= ? GROUP BY key ORDER BY key",
        [span["a"]],
    ):
        summary[row["key"]] = {
            "n": row["n"], "mean": row["mean"], "min": row["lo"], "max": row["hi"],
            "series": [], "by_weekday": [],
        }

    for row in conn.execute(
        "SELECT key, date, value FROM scores WHERE date >= ? ORDER BY key, date", [span["a"]]
    ):
        summary[row["key"]]["series"].append({"date": row["date"], "v": row["value"]})

    for row in conn.execute(
        "SELECT s.key AS key, e.weekday AS wd, COUNT(*) AS n, ROUND(AVG(s.value), 2) AS mean"
        " FROM scores s JOIN entries e ON e.date = s.date"
        " WHERE s.date >= ? GROUP BY s.key, e.weekday ORDER BY s.key, e.weekday",
        [span["a"]],
    ):
        summary[row["key"]]["by_weekday"].append({
            "weekday": row["wd"], "ko": WEEKDAY_KO[row["wd"]], "en": WEEKDAY_EN[row["wd"]],
            "n": row["n"], "mean": row["mean"],
        })

    for key in summary:
        summary[key]["latest"] = summary[key]["series"][-1]["v"]

    follow = conn.execute(
        "SELECT COUNT(*) AS n, SUM(prev_prescription_done) AS done FROM entries"
        " WHERE date >= ? AND prev_prescription_done IS NOT NULL", [span["a"]]
    ).fetchone()

    flags = [dict(r) for r in conn.execute(
        "SELECT flag, COUNT(*) AS n FROM flags WHERE date >= ?"
        " GROUP BY flag ORDER BY n DESC, flag", [span["a"]])]

    methods = [dict(r) for r in conn.execute(
        "SELECT method, COUNT(*) AS n, MAX(date) AS last_used FROM methods WHERE date >= ?"
        " GROUP BY method ORDER BY n DESC, method", [span["a"]])]

    prescriptions = [dict(r) for r in conn.execute(
        "SELECT date, prescription FROM entries"
        " WHERE date >= ? AND prescription IS NOT NULL ORDER BY date DESC LIMIT 14", [span["a"]])]

    return emit({
        "range": {"from": span["a"], "to": span["b"]},
        "entries": span["n"],
        "scores": summary,
        "flags": flags,
        "methods": methods,
        "prescription_follow_through": {"n": follow["n"], "done": follow["done"] or 0},
        "recent_prescriptions": prescriptions[::-1],
    })


# --------------------------------------------------------------------------
# query - 읽기 전용 SQL
# --------------------------------------------------------------------------

FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|alter|create|replace|attach|detach|vacuum|pragma|reindex)\b",
    re.I,
)


def cmd_query(args):
    sql = (args.sql or sys.stdin.read()).strip().rstrip(";").strip()
    if not sql:
        return fail("SQL이 비어 있습니다")
    if not re.match(r"\A(select|with)\b", sql, re.I):
        return fail("SELECT 또는 WITH로 시작하는 조회만 허용합니다")
    if ";" in sql:
        return fail("한 번에 한 문장만 실행합니다")
    if FORBIDDEN.search(sql):
        return fail("쓰기·스키마 변경 키워드는 허용하지 않습니다. md가 원본이므로 DB는 읽기만 합니다.")

    conn = connect()
    sync(conn)
    conn.execute("PRAGMA query_only = ON")
    try:
        rows = conn.execute(sql).fetchmany(args.limit)
    except sqlite3.Error as exc:
        return fail("SQL 오류: %s" % exc)
    return emit({"rows": [dict(r) for r in rows], "count": len(rows), "limit": args.limit})


# --------------------------------------------------------------------------

def cmd_sync(args):
    conn = connect()
    result = sync(conn, rebuild=args.rebuild)
    total = conn.execute("SELECT COUNT(*) AS n FROM entries").fetchone()["n"]
    result["ok"] = not result["failed"]
    result["total_entries"] = total
    result["db"] = db_path()
    return emit(result)


def cmd_where(args):
    conn = connect()
    total = conn.execute("SELECT COUNT(*) AS n FROM entries").fetchone()["n"]
    return emit({
        "home": home_dir(),
        "data": data_dir(),
        "db": db_path(),
        "db_exists": os.path.exists(db_path()),
        "md_files": len(scan_files()),
        "db_entries": total,
        "schema_version": SCHEMA_VERSION,
    })


def emit(obj):
    json.dump(obj, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


def fail(message):
    json.dump({"ok": False, "error": message}, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 1


def main(argv=None):
    parser = argparse.ArgumentParser(prog="howami", description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="cmd")

    p = sub.add_parser("context", help="최근 기록 요약을 출력합니다")
    p.add_argument("--days", type=int, default=14)
    p.add_argument("--date", help="오늘로 간주할 날짜 (YYYY-MM-DD)")
    p.set_defaults(func=cmd_context)

    p = sub.add_parser("save", help="오늘 기록을 저장합니다")
    p.add_argument("--json", help="기록 payload. '-' 또는 생략하면 stdin에서 읽습니다")
    p.add_argument("--force", action="store_true", help="같은 날짜 기록을 덮어씁니다")
    p.set_defaults(func=cmd_save)

    p = sub.add_parser("stats", help="누적 점수 패턴을 출력합니다")
    p.add_argument("--days", type=int, default=0, help="최근 N일만 (0이면 전체)")
    p.set_defaults(func=cmd_stats)

    p = sub.add_parser("query", help="DB에 읽기 전용 SQL을 던집니다")
    p.add_argument("--sql", help="SELECT 또는 WITH 문. 생략하면 stdin에서 읽습니다")
    p.add_argument("--limit", type=int, default=200)
    p.set_defaults(func=cmd_query)

    p = sub.add_parser("sync", help="md 원본과 DB를 맞춥니다")
    p.add_argument("--rebuild", action="store_true", help="DB를 비우고 md에서 전부 다시 읽습니다")
    p.set_defaults(func=cmd_sync)

    p = sub.add_parser("where", help="경로와 DB 상태를 출력합니다")
    p.set_defaults(func=cmd_where)

    args = parser.parse_args(argv)
    if not getattr(args, "func", None):
        parser.print_help()
        return 0
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
