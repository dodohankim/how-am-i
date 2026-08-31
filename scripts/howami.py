#!/usr/bin/env python3
"""howami - 로컬 퍼스트 자기진단 저장소 계층.

이 스크립트는 상담 대화를 하지 않는다. 대화는 AI 에이전트가 SKILL.md를 따라
진행하고, 이 스크립트는 오직 읽기와 쓰기만 담당한다.

  context   최근 기록 요약을 JSON으로 출력 (에이전트가 대화 전에 호출)
  save      세션 하나를 md 원본으로 쓰고 DB에 반영
  day       하루치 세션을 모아서 출력 (하루 종합을 볼 때)
  guard     사용자가 하지 않은 말이 기록에 섞였는지 검사 (save가 자동으로 호출)
  stats     누적 점수와 영역 패턴을 SQL로 집계해 출력
  works     걸음(다음 걸음)별 실행·도움 실적을 태그 단위로 모아 출력
  query     DB에 읽기 전용 SQL을 던진다
  sync      md 원본과 DB를 맞춘다
  where     경로와 DB 상태 출력

**기록의 단위는 하루가 아니라 세션이다.** 하루에 몇 번을 쓰든 각각 파일이 하나씩
생기고, 파일명이 `YYYY-MM-DD--HHMM.md`다. 하루 단위로 보는 것은 집계의 몫이다.
(v1의 `YYYY-MM-DD.md`도 시각 없는 세션으로 그대로 읽힌다.)

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
import time
from datetime import date, datetime, timedelta

SCHEMA_VERSION = 3
WEEKDAY_KO = ["월", "화", "수", "목", "금", "토", "일"]
WEEKDAY_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
KINDS = ("session", "checkin")


# --------------------------------------------------------------------------
# 경로와 세션 id
# --------------------------------------------------------------------------

def home_dir():
    raw = os.environ.get("HOWAMI_HOME") or os.path.join(os.path.expanduser("~"), "howami")
    return os.path.abspath(os.path.expanduser(raw))


def data_dir():
    return os.path.join(home_dir(), "data")


def db_path():
    return os.path.join(home_dir(), "howami.db")


def entry_path(entry_id):
    return os.path.join(data_dir(), "%s.md" % entry_id)


def ensure_dirs():
    for path in (data_dir(), os.path.join(home_dir(), "insights")):
        os.makedirs(path, exist_ok=True)


DAY_RE = re.compile(r"\A\d{4}-\d{2}-\d{2}\Z")
TIME_RE = re.compile(r"\A([01]\d|2[0-3]):?([0-5]\d)\Z")
# 세션 id는 날짜 + 선택적인 시각이다. 시각이 없는 id는 v1에서 넘어온 하루 단위 기록이다.
ID_RE = re.compile(r"\A(\d{4}-\d{2}-\d{2})(?:--([01]\d|2[0-3])([0-5]\d))?\Z")


def split_id(entry_id):
    """세션 id를 (날짜, 시각) 으로 가른다. 형식이 틀리면 (None, None)."""
    match = ID_RE.match(str(entry_id))
    if not match:
        return None, None
    day, hour, minute = match.groups()
    return day, ("%s:%s" % (hour, minute) if hour else None)


def make_id(day, hhmm):
    """날짜와 'HH:MM' 으로 세션 id를 만든다. 시각이 없으면 날짜만."""
    if not hhmm:
        return day
    match = TIME_RE.match(str(hhmm).strip())
    if not match:
        return None
    return "%s--%s%s" % (day, match.group(1), match.group(2))


def weekday_num(day):
    return datetime.strptime(day, "%Y-%m-%d").weekday()


def slot_of(hhmm):
    """시각을 아침·낮·저녁·밤으로 나눈다. 하루 안의 변화를 볼 때 쓴다."""
    if not hhmm:
        return None
    hour = int(hhmm[:2])
    if hour < 11:
        return "morning"
    if hour < 17:
        return "day"
    if hour < 22:
        return "evening"
    return "night"


# --------------------------------------------------------------------------
# md 원본 읽기
# --------------------------------------------------------------------------

FM_RE = re.compile(r"\A---\n(.*?)\n---\n?(.*)\Z", re.S)


def parse_entry(text):
    """기록 md에서 frontmatter와 본문을 뽑아낸다.

    frontmatter의 값은 전부 JSON 리터럴로 쓴다. 사람이 손으로 고쳐서 JSON으로
    못 읽는 값이 되면 따옴표만 벗겨 문자열로 넘긴다.
    """
    match = FM_RE.match(text)
    if not match:
        return {}, text
    meta = {}
    for line in match.group(1).split("\n"):
        line = line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, _, raw = line.partition(":")
        raw = raw.strip()
        try:
            meta[key.strip()] = json.loads(raw)
        except ValueError:
            meta[key.strip()] = raw.strip("\"'")
    return meta, match.group(2)


def clean_scores(raw):
    out = {}
    if not isinstance(raw, dict):
        return out
    for key, value in raw.items():
        if isinstance(value, bool):
            continue
        if isinstance(value, int) and 1 <= value <= 5:
            out[str(key)] = value
    return out


def clean_domains(raw):
    """영역 기록을 [{key, score, note}] 로 정리한다.

    점수 없이 메모만 남기는 것도 허용한다. 그 영역을 물었지만 점수를 매기기
    어려웠던 날이 실제로 있기 때문이다.
    """
    out = []
    if not isinstance(raw, list):
        return out
    seen = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        key = item.get("key") or item.get("domain")
        if not isinstance(key, str) or not key.strip() or key in seen:
            continue
        seen.add(key)
        score = item.get("score")
        if isinstance(score, bool) or not isinstance(score, int) or not 1 <= score <= 5:
            score = None
        note = item.get("note")
        note = note.strip() if isinstance(note, str) and note.strip() else None
        if score is None and note is None:
            continue
        out.append({"key": key.strip(), "score": score, "note": note})
    return out


def read_entry_file(entry_id):
    path = entry_path(entry_id)
    with open(path, encoding="utf-8") as handle:
        meta, body = parse_entry(handle.read())

    day, hhmm = split_id(entry_id)
    # frontmatter의 time이 파일명보다 자세할 일은 없지만, 파일명에 시각이 없는
    # v1 기록에 손으로 time을 적어 둔 경우는 살려 준다.
    if not hhmm:
        raw_time = meta.get("time")
        if isinstance(raw_time, str) and TIME_RE.match(raw_time.strip()):
            match = TIME_RE.match(raw_time.strip())
            hhmm = "%s:%s" % (match.group(1), match.group(2))

    kind = meta.get("kind")
    if kind not in KINDS:
        kind = "session"

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

    # 걸음이 없으면 태그와 영역도 의미가 없다.
    tag = meta.get("prescription_tag")
    if prescription is None or not isinstance(tag, str) or not tag.strip():
        tag = None
    else:
        tag = tag.strip()

    p_domain = meta.get("prescription_domain")
    if prescription is None or not isinstance(p_domain, str) or not p_domain.strip():
        p_domain = None
    else:
        p_domain = p_domain.strip()

    ref = meta.get("prev_prescription_ref")
    if not isinstance(ref, str) or not ID_RE.match(ref.strip()):
        ref = None
    else:
        ref = ref.strip()

    helped = meta.get("prev_prescription_helped")
    if not isinstance(helped, bool):
        helped = None

    return {
        "id": entry_id,
        "date": day,
        "time": hhmm,
        "kind": kind,
        "scores": clean_scores(meta.get("scores")),
        "domains": clean_domains(meta.get("domains")),
        "flags": [str(f) for f in flags],
        "methods": [str(m) for m in methods],
        "prescription": prescription,
        "prescription_tag": tag,
        "prescription_domain": p_domain,
        "prev_prescription_done": done,
        "prev_prescription_ref": ref,
        "prev_prescription_helped": helped,
        "body": body.strip(),
        "path": path,
    }


def scan_files():
    """data/ 의 md 파일을 {세션 id: (mtime, size)} 로 훑는다."""
    found = {}
    if not os.path.isdir(data_dir()):
        return found
    for name in sorted(os.listdir(data_dir())):
        if not name.endswith(".md") or not ID_RE.match(name[:-3]):
            continue
        path = os.path.join(data_dir(), name)
        stat = os.stat(path)
        found[name[:-3]] = (round(stat.st_mtime, 3), stat.st_size)
    return found


# --------------------------------------------------------------------------
# SQLite - md에서 파생된 조회용 인덱스
# --------------------------------------------------------------------------

SCHEMA_SQL = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 한 행이 세션 하나다. 하루에 여러 행이 있을 수 있다.
CREATE TABLE IF NOT EXISTS entries (
    id                     TEXT PRIMARY KEY,     -- YYYY-MM-DD--HHMM (v1은 YYYY-MM-DD)
    date                   TEXT NOT NULL,        -- YYYY-MM-DD
    time                   TEXT,                 -- HH:MM, v1 기록은 NULL
    slot                   TEXT,                 -- morning / day / evening / night
    weekday                INTEGER NOT NULL,     -- 0=월 .. 6=일
    kind                   TEXT NOT NULL,        -- session / checkin
    prescription           TEXT,
    prescription_tag       TEXT,                 -- 반복되는 걸음을 묶는 내부 슬러그
    prescription_domain    TEXT,                 -- 걸음이 겨냥한 생활 영역 key
    prev_prescription_done INTEGER,              -- 0 / 1 / NULL
    prev_prescription_ref  TEXT,                 -- done/helped 판정이 가리키는 세션 id
    prev_prescription_helped INTEGER,            -- 0 / 1 / NULL. 사용자의 답으로만 정한다
    body                   TEXT,
    source_path            TEXT NOT NULL,
    source_mtime           REAL NOT NULL,
    source_size            INTEGER NOT NULL,
    synced_at              TEXT NOT NULL
);

-- 하루 전체를 관통하는 축(에너지·기분·수면·실행). 세로로 쌓는다.
CREATE TABLE IF NOT EXISTS scores (
    entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    key      TEXT NOT NULL,
    value    INTEGER NOT NULL CHECK (value BETWEEN 1 AND 5),
    PRIMARY KEY (entry_id, key)
);

-- 생활 영역별 관점(가족·일·혼자 있는 시간 …). 점수 없이 메모만 있을 수 있다.
CREATE TABLE IF NOT EXISTS domains (
    entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    domain   TEXT NOT NULL,
    score    INTEGER CHECK (score IS NULL OR score BETWEEN 1 AND 5),
    note     TEXT,
    PRIMARY KEY (entry_id, domain)
);

CREATE TABLE IF NOT EXISTS flags (
    entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    flag     TEXT NOT NULL,
    PRIMARY KEY (entry_id, flag)
);

-- 그 세션에서 밟은 상담 기법. id는 questions/methods.yaml 카탈로그를 따른다.
CREATE TABLE IF NOT EXISTS methods (
    entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    method   TEXT NOT NULL,
    PRIMARY KEY (entry_id, method)
);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entries_date    ON entries(date);
CREATE INDEX IF NOT EXISTS idx_entries_weekday ON entries(weekday);
CREATE INDEX IF NOT EXISTS idx_scores_key      ON scores(key);
CREATE INDEX IF NOT EXISTS idx_domains_domain  ON domains(domain);
CREATE INDEX IF NOT EXISTS idx_flags_flag      ON flags(flag);
CREATE INDEX IF NOT EXISTS idx_methods_method  ON methods(method);
CREATE INDEX IF NOT EXISTS idx_entries_ptag    ON entries(prescription_tag);
CREATE INDEX IF NOT EXISTS idx_entries_pref    ON entries(prev_prescription_ref);
"""


def stale_schema():
    """이전 버전의 스키마로 만들어진 DB인지 본다."""
    if not os.path.exists(db_path()):
        return False
    try:
        probe = sqlite3.connect(db_path())
        row = probe.execute("SELECT value FROM meta WHERE key = 'schema_version'").fetchone()
        probe.close()
    except sqlite3.Error:
        return True
    return not row or str(row[0]) != str(SCHEMA_VERSION)


def connect(readonly=False):
    ensure_dirs()
    # md가 원본이므로, 스키마가 바뀌면 DB는 버리고 다시 만드는 것이 안전하다.
    # 다음 sync가 md 전부를 새 스키마로 읽어 들인다.
    if stale_schema():
        for suffix in ("", "-wal", "-shm"):
            try:
                os.remove(db_path() + suffix)
            except OSError:
                pass
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
        "INSERT INTO entries(id, date, time, slot, weekday, kind, prescription,"
        " prescription_tag, prescription_domain, prev_prescription_done,"
        " prev_prescription_ref, prev_prescription_helped,"
        " body, source_path, source_mtime, source_size, synced_at)"
        " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
        " ON CONFLICT(id) DO UPDATE SET"
        "  date=excluded.date, time=excluded.time, slot=excluded.slot,"
        "  weekday=excluded.weekday, kind=excluded.kind, prescription=excluded.prescription,"
        "  prescription_tag=excluded.prescription_tag,"
        "  prescription_domain=excluded.prescription_domain,"
        "  prev_prescription_done=excluded.prev_prescription_done,"
        "  prev_prescription_ref=excluded.prev_prescription_ref,"
        "  prev_prescription_helped=excluded.prev_prescription_helped, body=excluded.body,"
        "  source_path=excluded.source_path, source_mtime=excluded.source_mtime,"
        "  source_size=excluded.source_size, synced_at=excluded.synced_at",
        (
            entry["id"],
            entry["date"],
            entry["time"],
            slot_of(entry["time"]),
            weekday_num(entry["date"]),
            entry["kind"],
            entry["prescription"],
            entry["prescription_tag"],
            entry["prescription_domain"],
            None if entry["prev_prescription_done"] is None else int(entry["prev_prescription_done"]),
            entry["prev_prescription_ref"],
            None if entry["prev_prescription_helped"] is None else int(entry["prev_prescription_helped"]),
            entry["body"],
            entry["path"],
            mtime,
            size,
            datetime.now().isoformat(timespec="seconds"),
        ),
    )
    conn.execute("DELETE FROM scores WHERE entry_id = ?", (entry["id"],))
    conn.executemany(
        "INSERT INTO scores(entry_id, key, value) VALUES(?,?,?)",
        [(entry["id"], k, v) for k, v in sorted(entry["scores"].items())],
    )
    conn.execute("DELETE FROM domains WHERE entry_id = ?", (entry["id"],))
    conn.executemany(
        "INSERT INTO domains(entry_id, domain, score, note) VALUES(?,?,?,?)",
        [(entry["id"], d["key"], d["score"], d["note"]) for d in entry["domains"]],
    )
    conn.execute("DELETE FROM flags WHERE entry_id = ?", (entry["id"],))
    conn.executemany(
        "INSERT INTO flags(entry_id, flag) VALUES(?,?)",
        [(entry["id"], f) for f in sorted(set(entry["flags"]))],
    )
    conn.execute("DELETE FROM methods WHERE entry_id = ?", (entry["id"],))
    conn.executemany(
        "INSERT INTO methods(entry_id, method) VALUES(?,?)",
        [(entry["id"], m) for m in sorted(set(entry["methods"]))],
    )


def sync(conn, rebuild=False):
    """md 원본을 정본으로 삼아 DB를 맞춘다.

    파일의 mtime과 크기가 DB에 적힌 것과 같으면 건너뛴다. 손으로 md를 고쳤거나
    다른 기기에서 받아온 파일은 여기서 자동으로 반영된다.
    """
    if rebuild:
        conn.executescript(
            "DELETE FROM methods; DELETE FROM flags; DELETE FROM domains;"
            " DELETE FROM scores; DELETE FROM entries;"
        )

    on_disk = scan_files()
    known = {
        row["id"]: (row["source_mtime"], row["source_size"])
        for row in conn.execute("SELECT id, source_mtime, source_size FROM entries")
    }

    added, updated, failed = [], [], []
    for entry_id, stat in on_disk.items():
        if known.get(entry_id) == stat:
            continue
        try:
            entry = read_entry_file(entry_id)
        except (OSError, UnicodeDecodeError) as exc:
            failed.append({"id": entry_id, "error": str(exc)})
            continue
        upsert_entry(conn, entry, stat)
        (updated if entry_id in known else added).append(entry_id)

    removed = sorted(set(known) - set(on_disk))
    for entry_id in removed:
        conn.execute("DELETE FROM entries WHERE id = ?", (entry_id,))

    conn.commit()
    return {"added": sorted(added), "updated": sorted(updated),
            "removed": removed, "failed": failed}


# --------------------------------------------------------------------------
# 조회 헬퍼
# --------------------------------------------------------------------------

def entry_rows(conn, limit=None, until=None, since=None, day=None):
    sql = ("SELECT id, date, time, slot, kind, weekday, prescription,"
           " prescription_tag, prescription_domain, prev_prescription_done,"
           " prev_prescription_ref, prev_prescription_helped FROM entries")
    clauses, params = [], []
    if day:
        clauses.append("date = ?")
        params.append(day)
    if until:
        clauses.append("date <= ?")
        params.append(until)
    if since:
        clauses.append("date >= ?")
        params.append(since)
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    # 시각이 없는 v1 기록은 그날의 맨 앞에 둔다.
    sql += " ORDER BY date DESC, COALESCE(time, '00:00') DESC"
    if limit:
        sql += " LIMIT ?"
        params.append(limit)
    return [dict(r) for r in list(conn.execute(sql, params))[::-1]]


def attach_details(conn, rows, with_body=False):
    if not rows:
        return rows
    ids = [r["id"] for r in rows]
    marks = ",".join("?" * len(ids))

    scores = {}
    for r in conn.execute("SELECT entry_id, key, value FROM scores WHERE entry_id IN (%s)" % marks, ids):
        scores.setdefault(r["entry_id"], {})[r["key"]] = r["value"]
    domains = {}
    for r in conn.execute(
        "SELECT entry_id, domain, score, note FROM domains WHERE entry_id IN (%s)"
        " ORDER BY domain" % marks, ids
    ):
        domains.setdefault(r["entry_id"], []).append(
            {"key": r["domain"], "score": r["score"], "note": r["note"]})
    flags = {}
    for r in conn.execute("SELECT entry_id, flag FROM flags WHERE entry_id IN (%s)" % marks, ids):
        flags.setdefault(r["entry_id"], []).append(r["flag"])
    methods = {}
    for r in conn.execute("SELECT entry_id, method FROM methods WHERE entry_id IN (%s)" % marks, ids):
        methods.setdefault(r["entry_id"], []).append(r["method"])
    bodies = {}
    if with_body:
        for r in conn.execute("SELECT id, body FROM entries WHERE id IN (%s)" % marks, ids):
            bodies[r["id"]] = r["body"]

    for row in rows:
        row["weekday_label"] = WEEKDAY_KO[row["weekday"]]
        row["scores"] = scores.get(row["id"], {})
        row["domains"] = domains.get(row["id"], [])
        row["flags"] = flags.get(row["id"], [])
        row["methods"] = methods.get(row["id"], [])
        done = row.pop("prev_prescription_done")
        row["prev_prescription_done"] = None if done is None else bool(done)
        helped = row.pop("prev_prescription_helped")
        row["prev_prescription_helped"] = None if helped is None else bool(helped)
        if with_body:
            row["body"] = bodies.get(row["id"])
    return rows


def day_rollup(conn, since, until):
    """하루 단위로 접은 요약. 세션이 여럿이면 평균과 마지막 값을 함께 준다."""
    days = {}
    for row in conn.execute(
        "SELECT date, COUNT(*) AS sessions FROM entries"
        " WHERE date >= ? AND date <= ? GROUP BY date ORDER BY date", (since, until)
    ):
        days[row["date"]] = {"date": row["date"], "sessions": row["sessions"],
                             "weekday": weekday_num(row["date"]),
                             "scores": {}, "domains": {}}
    if not days:
        return []
    for row in conn.execute(
        "SELECT e.date AS date, s.key AS key, ROUND(AVG(s.value), 2) AS mean"
        " FROM scores s JOIN entries e ON e.id = s.entry_id"
        " WHERE e.date >= ? AND e.date <= ? GROUP BY e.date, s.key", (since, until)
    ):
        days[row["date"]]["scores"][row["key"]] = row["mean"]
    for row in conn.execute(
        "SELECT e.date AS date, d.domain AS domain, ROUND(AVG(d.score), 2) AS mean"
        " FROM domains d JOIN entries e ON e.id = d.entry_id"
        " WHERE e.date >= ? AND e.date <= ? AND d.score IS NOT NULL"
        " GROUP BY e.date, d.domain", (since, until)
    ):
        days[row["date"]]["domains"][row["domain"]] = row["mean"]
    for day in days.values():
        day["weekday_label"] = WEEKDAY_KO[day["weekday"]]
    return [days[k] for k in sorted(days)]


# --------------------------------------------------------------------------
# works - "나에게 통한 것"
#
# 걸음(prescription)을 태그 단위로 묶어 시도·실행·도움 실적을 센다.
# '도움'은 점수에서 추론하지 않는다. 다음 세션에서 사용자가 "해보니 어땠어요?"에
# 답한 것을 에이전트가 판정해 확인받은 값(prev_prescription_helped)만 센다.
# n=1 관찰이지 임상 근거가 아니므로, 보여줄 때는 비율이 아니라 횟수로 말한다.
# --------------------------------------------------------------------------

WORKS_MIN_ATTEMPTS = 2  # 시도가 이보다 적으면 아직 판정하지 않는다


def works_rows(conn):
    """태그별 실적. 창을 자르지 않는다 — 개인 근거는 전체 역사에서 나온다."""
    tags = {}
    for row in conn.execute(
        "SELECT prescription_tag AS tag, COUNT(*) AS attempts, MAX(date) AS last_set"
        " FROM entries WHERE prescription_tag IS NOT NULL GROUP BY prescription_tag"
    ):
        tags[row["tag"]] = {
            "tag": row["tag"], "attempts": row["attempts"], "last_set": row["last_set"],
            "done": 0, "helped_yes": 0, "helped_no": 0, "text": None, "domain": None,
        }
    if not tags:
        return []

    # 대표 문구와 영역은 가장 최근에 그 태그로 정한 걸음의 것을 쓴다.
    for row in conn.execute(
        "SELECT prescription_tag AS tag, prescription AS text,"
        " prescription_domain AS domain FROM entries"
        " WHERE prescription_tag IS NOT NULL"
        " ORDER BY date, COALESCE(time, '00:00')"
    ):
        tags[row["tag"]]["text"] = row["text"]
        if row["domain"]:
            tags[row["tag"]]["domain"] = row["domain"]

    # 판정은 그 걸음을 정한 세션(p)을 가리키는 다음 세션(f)에서 온다.
    for row in conn.execute(
        "SELECT p.prescription_tag AS tag,"
        " SUM(CASE WHEN f.prev_prescription_done = 1 THEN 1 ELSE 0 END) AS done,"
        " SUM(CASE WHEN f.prev_prescription_helped = 1 THEN 1 ELSE 0 END) AS yes,"
        " SUM(CASE WHEN f.prev_prescription_helped = 0 THEN 1 ELSE 0 END) AS no"
        " FROM entries f JOIN entries p ON p.id = f.prev_prescription_ref"
        " WHERE p.prescription_tag IS NOT NULL GROUP BY p.prescription_tag"
    ):
        tags[row["tag"]]["done"] = row["done"] or 0
        tags[row["tag"]]["helped_yes"] = row["yes"] or 0
        tags[row["tag"]]["helped_no"] = row["no"] or 0

    return sorted(tags.values(),
                  key=lambda t: (t["helped_yes"], t["done"], t["last_set"]),
                  reverse=True)


def works_groups(rows):
    """실적을 네 묶음으로 가른다.

    worked      도움됐다는 확인이 아니라는 확인보다 많다
    not_worked  아니라는 확인이 더 많다 — 다시 권하지 않을 목록
    undecided   시도는 쌓였는데 판정이 갈리거나 없다
    pending     시도가 WORKS_MIN_ATTEMPTS 미만 — 아직 판정하지 않는다
    """
    groups = {"worked": [], "not_worked": [], "undecided": [], "pending": []}
    for item in rows:
        if item["attempts"] < WORKS_MIN_ATTEMPTS:
            groups["pending"].append(item)
        elif item["helped_yes"] > item["helped_no"]:
            groups["worked"].append(item)
        elif item["helped_no"] > item["helped_yes"]:
            groups["not_worked"].append(item)
        else:
            groups["undecided"].append(item)
    return groups


def cmd_works(args):
    conn = connect()
    sync(conn)
    rows = works_rows(conn)
    groups = works_groups(rows)
    return emit({
        "note": "사용자가 '도움이 됐다'고 직접 확인한 답만 센 n=1 관찰입니다. "
                "임상 근거가 아니며, 사용자에게 말할 때는 비율 대신 횟수로 말합니다"
                " (예: \"세 번 중 세 번\").",
        "min_attempts": WORKS_MIN_ATTEMPTS,
        "worked": groups["worked"],
        "not_worked": groups["not_worked"],
        "undecided": groups["undecided"],
        "pending": groups["pending"],
    })


# --------------------------------------------------------------------------
# context
# --------------------------------------------------------------------------

DROP_THRESHOLD = 2  # 기준선보다 이만큼 떨어지면 급락으로 본다


def mean_map(conn, table, key_col, value_col, since, before):
    out = {}
    sql = ("SELECT %s AS k, ROUND(AVG(%s), 2) AS mean FROM %s t"
           " JOIN entries e ON e.id = t.entry_id"
           " WHERE e.date < ? AND e.date >= ? AND %s IS NOT NULL GROUP BY %s"
           % (key_col, value_col, table, value_col, key_col))
    for row in conn.execute(sql, (before, since)):
        out[row["k"]] = row["mean"]
    return out


def cmd_context(args):
    conn = connect()
    synced = sync(conn)
    today = args.date or date.today().isoformat()
    week_ago = (datetime.strptime(today, "%Y-%m-%d") - timedelta(days=7)).date().isoformat()

    today_sessions = attach_details(conn, entry_rows(conn, day=today), with_body=args.full)
    history = attach_details(conn, entry_rows(conn, limit=args.limit, until=today))
    prior = [h for h in history if h["date"] != today]

    last = prior[-1] if prior else None
    open_prescription = None
    if today_sessions and today_sessions[-1]["prescription"]:
        # 오늘 이미 세션이 있었으면 그때 정한 것이 아직 열려 있는 처방이다.
        open_prescription = open_prescription_of(today_sessions[-1], same_day=True)
    elif last and last["prescription"]:
        open_prescription = open_prescription_of(last, same_day=False)

    since = (datetime.strptime(today, "%Y-%m-%d") - timedelta(days=args.days - 1)).date().isoformat()
    total = conn.execute("SELECT COUNT(*) AS n FROM entries").fetchone()["n"]

    all_works = works_rows(conn)
    groups = works_groups(all_works)
    total_days = conn.execute("SELECT COUNT(DISTINCT date) AS n FROM entries").fetchone()["n"]

    return emit({
        "home": home_dir(),
        "db": db_path(),
        "today": today,
        "now": datetime.now().strftime("%H:%M"),
        "sessions_today": len(today_sessions),
        "today_sessions": today_sessions,
        "streak_days": streak(conn, today),
        "total_entries": total,
        "total_days": total_days,
        "last_entry": last,
        "open_prescription": open_prescription,
        "baseline_7d": mean_map(conn, "scores", "t.key", "t.value", week_ago, today),
        "domain_baseline_7d": mean_map(conn, "domains", "t.domain", "t.score", week_ago, today),
        "drop_threshold": DROP_THRESHOLD,
        "works": {
            # top: 오늘의 초점과 맞으면 새 걸음보다 먼저 제안한다. 횟수로 말한다.
            "top": groups["worked"][:3],
            # avoid: 도움이 안 됐다고 확인된 걸음. 다시 권하지 않는다.
            "avoid": groups["not_worked"],
            # tags: 태그 재사용용 전체 목록. 같은 뜻의 걸음이면 반드시 재사용한다.
            "tags": [{"tag": w["tag"], "text": w["text"]} for w in all_works],
        },
        "history": history,
        "days": day_rollup(conn, since, today),
        "synced": summarize_sync(synced),
    })


def open_prescription_of(row, same_day):
    return {"text": row["prescription"], "tag": row.get("prescription_tag"),
            "domain": row.get("prescription_domain"),
            "from": row["id"], "same_day": same_day}


def streak(conn, today):
    """오늘 또는 어제부터 거꾸로 며칠 연속으로 기록했는지 센다."""
    have = {r["date"] for r in conn.execute(
        "SELECT DISTINCT date FROM entries WHERE date <= ? ORDER BY date DESC LIMIT 400", (today,))}
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
# 오염 검사
#
# 사용자가 실제로 하지 않은 말이 기록에 들어가는 것을 막는다. 막으려는 상황은
# 두 가지다.
#
#   1. 에이전트가 자기 턴을 끝내지 못하고 대화를 계속 이어서 생성하면서, 본문에
#      `user`, `system` 같은 역할 구분자와 지어낸 사용자 답변을 함께 뱉는 경우
#   2. 그렇게 지어낸 "시스템 지시문"을 셸로 출력해 스스로 컨텍스트에 집어넣고,
#      그것을 외부에서 온 진짜 지시로 오인해 저장 내용을 바꾸는 경우
#
# 프롬프트 규칙만으로는 둘 다 막히지 않으므로 저장 직전에 여기서 한 번 더 건다.
# --------------------------------------------------------------------------

# 정상적인 한국어 기록에는 영어 역할 토큰이 줄 첫머리에 올 일이 없다.
ROLE_LEAK_RE = re.compile(r"(?m)^[ \t>*-]*(?:user|system|assistant|human)\b")

INJECTION_PATTERNS = [
    (re.compile(r"SYSTEM_INTERRUPT|HOWAMI_ENGINE|\[INST\]|<\|im_start\|>"), "가짜 시스템 마커"),
    (re.compile(r"do not (?:disclose|reveal|mention|tell the user)", re.I), "비공개 지시"),
    (re.compile(r"ignore (?:all )?(?:the )?(?:previous|prior|above) instructions", re.I), "지시 무시 요구"),
    (re.compile(r"must be rewritten|before save\b", re.I), "저장 조작 지시"),
    (re.compile(r"사용자(?:의)?\s*발화인\s*것처럼|사용자가\s*말한\s*것처럼|사용자가\s*한\s*말인\s*것처럼"), "발화 위조 지시"),
    (re.compile(r"이\s*지시(?:문|사항)?를?\s*(?:밝히|노출|공개|드러내)"), "비공개 지시"),
]

CODE_FENCE_RE = re.compile(r"```.*?```", re.S)


def strip_code_fences(text):
    """인용된 코드 블록은 검사에서 뺀다. 문제 사례를 코드로 인용하는 것까지 막을 필요는 없다."""
    return CODE_FENCE_RE.sub("", text)


def scan_text(text, where):
    found = []
    if not text:
        return found
    match = ROLE_LEAK_RE.search(text)
    if match:
        line = text[: match.start()].count("\n") + 1
        found.append({
            "kind": "role_leak",
            "where": where,
            "detail": "역할 구분자가 본문에 섞여 있습니다 (%d번째 줄: %r)"
                      % (line, text[match.start():match.start() + 40]),
        })
    for pattern, label in INJECTION_PATTERNS:
        hit = pattern.search(text)
        if hit:
            found.append({
                "kind": "injection",
                "where": where,
                "detail": "%s로 보이는 문구가 있습니다: %r" % (label, hit.group(0)),
            })
    return found


def guard_payload(payload):
    """저장하려는 payload 자체를 검사한다. 오탐 여지가 거의 없어 항상 돌린다."""
    problems = []
    problems += scan_text(payload.get("body") or "", "body")
    problems += scan_text(payload.get("prescription") or "", "prescription")
    for key in ("prescription_tag", "prescription_domain", "prev_prescription_ref"):
        problems += scan_text(str(payload.get(key) or ""), key)
    for item in payload.get("domains") or []:
        if isinstance(item, dict):
            problems += scan_text(item.get("note") or "", "domains.%s" % item.get("key"))
    for key in ("flags", "methods"):
        for item in payload.get(key) or []:
            problems += scan_text(str(item), key)
    return problems


def transcript_dir():
    base = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(os.path.expanduser("~"), ".claude")
    slug = re.sub(r"[^A-Za-z0-9]", "-", os.path.abspath(os.getcwd()))
    return os.path.join(os.path.abspath(os.path.expanduser(base)), "projects", slug)


def latest_transcript(max_age_hours=12):
    directory = transcript_dir()
    if not os.path.isdir(directory):
        return None
    now = time.time()
    best = None
    for name in os.listdir(directory):
        if not name.endswith(".jsonl"):
            continue
        full = os.path.join(directory, name)
        try:
            stat = os.stat(full)
        except OSError:
            continue
        if now - stat.st_mtime > max_age_hours * 3600:
            continue
        if best is None or stat.st_mtime > best[0]:
            best = (stat.st_mtime, full)
    return best[1] if best else None


def scan_transcript(path):
    """이번 대화에서 에이전트가 턴 경계를 넘겼거나 스스로 지시문을 주입했는지 본다."""
    problems = []
    try:
        handle = open(path, encoding="utf-8", errors="replace")
    except OSError as exc:
        return [{"kind": "unreadable", "where": path, "detail": str(exc)}]
    with handle:
        for lineno, line in enumerate(handle, 1):
            try:
                record = json.loads(line)
            except ValueError:
                continue
            if record.get("type") != "assistant":
                continue
            content = (record.get("message") or {}).get("content")
            if not isinstance(content, list):
                continue
            for block in content:
                if not isinstance(block, dict):
                    continue
                if block.get("type") == "text":
                    problems += scan_text(
                        strip_code_fences(block.get("text") or ""),
                        "%s:%d" % (os.path.basename(path), lineno),
                    )
                elif block.get("type") == "tool_use":
                    command = (block.get("input") or {}).get("command")
                    if not isinstance(command, str) or "howami.py" in command:
                        continue
                    problems += scan_text(
                        command, "%s:%d (셸 명령)" % (os.path.basename(path), lineno)
                    )
    return problems


def guard_session():
    """대화 기록까지 훑는다. 기록을 못 찾으면 막지 않고 그 사실만 알린다."""
    path = latest_transcript()
    if not path:
        return [], None
    return scan_transcript(path), path


def cmd_guard(args):
    payload = {}
    if args.json:
        raw = sys.stdin.read() if args.json == "-" else args.json
        try:
            payload = json.loads(raw)
        except ValueError as exc:
            return fail("payload가 올바른 JSON이 아닙니다: %s" % exc)
    problems = guard_payload(payload)
    session_problems, path = guard_session()
    problems += session_problems
    return emit({
        "ok": not problems,
        "transcript": path,
        "problems": problems,
    })



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

    hhmm = payload.get("time") or datetime.now().strftime("%H:%M")
    entry_id = make_id(day, hhmm)
    if not entry_id:
        return fail("time은 HH:MM 형식이어야 합니다: %r" % hhmm)

    kind = payload.get("kind") or "session"
    if kind not in KINDS:
        return fail("kind는 %s 중 하나여야 합니다: %r" % (" 또는 ".join(KINDS), kind))

    scores = payload.get("scores") or {}
    if not isinstance(scores, dict):
        return fail("scores는 객체여야 합니다")
    for key, value in scores.items():
        if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 5:
            return fail("scores.%s는 1~5 사이 정수여야 합니다: %r" % (key, value))

    raw_domains = payload.get("domains") or []
    if not isinstance(raw_domains, list):
        return fail("domains는 [{\"key\":…, \"score\":…, \"note\":…}] 형태의 배열이어야 합니다")
    for item in raw_domains:
        if not isinstance(item, dict) or not item.get("key"):
            return fail("domains의 각 항목에는 key가 있어야 합니다: %r" % (item,))
        score = item.get("score")
        if score is not None and (isinstance(score, bool) or not isinstance(score, int)
                                  or not 1 <= score <= 5):
            return fail("domains[%s].score는 1~5 정수이거나 null이어야 합니다: %r"
                        % (item.get("key"), score))
    domains = clean_domains(raw_domains)

    prescription = payload.get("prescription")
    if prescription is not None and (not isinstance(prescription, str)):
        return fail("prescription은 문자열이거나 null이어야 합니다: %r" % (prescription,))

    tag = payload.get("prescription_tag")
    if tag is not None and (not isinstance(tag, str) or not tag.strip()):
        return fail("prescription_tag는 비어 있지 않은 문자열이거나 null이어야 합니다: %r" % (tag,))
    p_domain = payload.get("prescription_domain")
    if p_domain is not None and (not isinstance(p_domain, str) or not p_domain.strip()):
        return fail("prescription_domain은 비어 있지 않은 문자열이거나 null이어야 합니다: %r" % (p_domain,))
    if prescription is None or not prescription.strip():
        # 걸음이 없으면 태그와 영역도 의미가 없다
        tag = p_domain = None

    ref = payload.get("prev_prescription_ref")
    if ref is not None and (not isinstance(ref, str) or not ID_RE.match(ref.strip())):
        return fail("prev_prescription_ref는 세션 id(YYYY-MM-DD 또는 YYYY-MM-DD--HHMM) 형식이어야 합니다: %r" % (ref,))

    helped = payload.get("prev_prescription_helped")
    if helped is not None and not isinstance(helped, bool):
        return fail("prev_prescription_helped는 true/false/null이어야 합니다: %r" % (helped,))

    problems = guard_payload(payload)
    transcript = None
    if not problems:
        session_problems, transcript = guard_session()
        problems += session_problems
    if problems and not args.allow_tainted:
        json.dump({
            "ok": False,
            "error": "사용자가 하지 않은 말이 섞였을 수 있어 저장을 멈췄습니다. "
                     "아래 항목을 사용자에게 그대로 보여주고, 사용자가 직접 확인해 "
                     "허락했을 때만 --allow-tainted로 다시 저장하세요.",
            "transcript": transcript,
            "problems": problems,
        }, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return 1

    path = entry_path(entry_id)
    if os.path.exists(path) and not args.force:
        return fail("%s 기록이 이미 있습니다. 같은 세션을 고치려는 것이면 --force를, "
                    "새 세션이면 time을 다르게 주세요." % entry_id)

    meta = {
        "date": day,
        "time": hhmm if TIME_RE.match(hhmm) else None,
        "kind": kind,
        "scores": scores,
        "domains": domains,
        "flags": payload.get("flags") or [],
        "methods": payload.get("methods") or [],
        "prescription": prescription,
        "prescription_tag": tag.strip() if tag else None,
        "prescription_domain": p_domain.strip() if p_domain else None,
        "prev_prescription_done": payload.get("prev_prescription_done"),
        "prev_prescription_ref": ref.strip() if ref else None,
        "prev_prescription_helped": helped,
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
    today_n = conn.execute("SELECT COUNT(*) AS n FROM entries WHERE date = ?", (day,)).fetchone()["n"]
    return emit({
        "ok": True,
        "id": entry_id,
        "path": path,
        "date": day,
        "time": hhmm,
        "kind": kind,
        "sessions_today": today_n,
        "db": db_path(),
        "total_entries": total,
        "guard": "bypassed" if problems else "passed",
    })


# --------------------------------------------------------------------------
# day - 하루치 세션을 모아서 본다
# --------------------------------------------------------------------------

def cmd_day(args):
    conn = connect()
    sync(conn)
    day = args.date or date.today().isoformat()
    if not DAY_RE.match(day):
        return fail("date는 YYYY-MM-DD 형식이어야 합니다: %r" % day)

    sessions = attach_details(conn, entry_rows(conn, day=day), with_body=True)
    if not sessions:
        return emit({"date": day, "sessions": 0,
                     "note": "그날 기록이 없습니다."})

    rollup = day_rollup(conn, day, day)
    return emit({
        "date": day,
        "weekday": WEEKDAY_KO[weekday_num(day)],
        "sessions": len(sessions),
        "rollup": rollup[0] if rollup else None,
        "entries": sessions,
    })


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
        "SELECT MIN(date) AS a, MAX(date) AS b, COUNT(*) AS n,"
        " COUNT(DISTINCT date) AS days FROM entries" + where, params
    ).fetchone()
    if not span["n"]:
        return emit({"entries": 0, "note": "아직 기록이 없습니다."})
    since = span["a"]

    scores = {}
    for row in conn.execute(
        "SELECT s.key AS key, COUNT(*) AS n, ROUND(AVG(s.value), 2) AS mean,"
        " MIN(s.value) AS lo, MAX(s.value) AS hi"
        " FROM scores s JOIN entries e ON e.id = s.entry_id"
        " WHERE e.date >= ? GROUP BY s.key ORDER BY s.key", [since],
    ):
        scores[row["key"]] = {"n": row["n"], "mean": row["mean"], "min": row["lo"],
                              "max": row["hi"], "series": [], "by_weekday": []}

    for row in conn.execute(
        "SELECT s.key AS key, e.date AS date, ROUND(AVG(s.value), 2) AS mean"
        " FROM scores s JOIN entries e ON e.id = s.entry_id"
        " WHERE e.date >= ? GROUP BY s.key, e.date ORDER BY s.key, e.date", [since],
    ):
        scores[row["key"]]["series"].append({"date": row["date"], "v": row["mean"]})

    for row in conn.execute(
        "SELECT s.key AS key, e.weekday AS wd, COUNT(*) AS n, ROUND(AVG(s.value), 2) AS mean"
        " FROM scores s JOIN entries e ON e.id = s.entry_id"
        " WHERE e.date >= ? GROUP BY s.key, e.weekday ORDER BY s.key, e.weekday", [since],
    ):
        scores[row["key"]]["by_weekday"].append({
            "weekday": row["wd"], "ko": WEEKDAY_KO[row["wd"]], "en": WEEKDAY_EN[row["wd"]],
            "n": row["n"], "mean": row["mean"]})

    for key in scores:
        if scores[key]["series"]:
            scores[key]["latest"] = scores[key]["series"][-1]["v"]

    # 생활 영역 — 하루를 여러 관점으로 본 결과가 여기 쌓인다.
    domains = {}
    for row in conn.execute(
        "SELECT d.domain AS domain, COUNT(*) AS n, COUNT(d.score) AS scored,"
        " ROUND(AVG(d.score), 2) AS mean, MIN(d.score) AS lo, MAX(d.score) AS hi"
        " FROM domains d JOIN entries e ON e.id = d.entry_id"
        " WHERE e.date >= ? GROUP BY d.domain ORDER BY mean", [since],
    ):
        domains[row["domain"]] = {"n": row["n"], "scored": row["scored"], "mean": row["mean"],
                                  "min": row["lo"], "max": row["hi"],
                                  "series": [], "by_weekday": []}

    for row in conn.execute(
        "SELECT d.domain AS domain, e.date AS date, ROUND(AVG(d.score), 2) AS mean"
        " FROM domains d JOIN entries e ON e.id = d.entry_id"
        " WHERE e.date >= ? AND d.score IS NOT NULL"
        " GROUP BY d.domain, e.date ORDER BY d.domain, e.date", [since],
    ):
        domains[row["domain"]]["series"].append({"date": row["date"], "v": row["mean"]})

    for row in conn.execute(
        "SELECT d.domain AS domain, e.weekday AS wd, COUNT(*) AS n, ROUND(AVG(d.score), 2) AS mean"
        " FROM domains d JOIN entries e ON e.id = d.entry_id"
        " WHERE e.date >= ? AND d.score IS NOT NULL"
        " GROUP BY d.domain, e.weekday ORDER BY d.domain, e.weekday", [since],
    ):
        domains[row["domain"]]["by_weekday"].append({
            "weekday": row["wd"], "ko": WEEKDAY_KO[row["wd"]], "en": WEEKDAY_EN[row["wd"]],
            "n": row["n"], "mean": row["mean"]})

    # 같은 축이 시간대에 따라 달라지는지. 하루에 여러 번 쓸 때 의미가 생긴다.
    by_slot = [dict(r) for r in conn.execute(
        "SELECT e.slot AS slot, s.key AS key, COUNT(*) AS n, ROUND(AVG(s.value), 2) AS mean"
        " FROM scores s JOIN entries e ON e.id = s.entry_id"
        " WHERE e.date >= ? AND e.slot IS NOT NULL"
        " GROUP BY e.slot, s.key ORDER BY s.key, e.slot", [since])]

    follow = conn.execute(
        "SELECT COUNT(*) AS n, SUM(prev_prescription_done) AS done FROM entries"
        " WHERE date >= ? AND prev_prescription_done IS NOT NULL", [since]).fetchone()

    flags = [dict(r) for r in conn.execute(
        "SELECT f.flag AS flag, COUNT(*) AS n FROM flags f JOIN entries e ON e.id = f.entry_id"
        " WHERE e.date >= ? GROUP BY f.flag ORDER BY n DESC, f.flag", [since])]

    methods = [dict(r) for r in conn.execute(
        "SELECT m.method AS method, COUNT(*) AS n, MAX(e.date) AS last_used"
        " FROM methods m JOIN entries e ON e.id = m.entry_id"
        " WHERE e.date >= ? GROUP BY m.method ORDER BY n DESC, m.method", [since])]

    prescriptions = [dict(r) for r in conn.execute(
        "SELECT id, date, time, prescription FROM entries"
        " WHERE date >= ? AND prescription IS NOT NULL"
        " ORDER BY date DESC, COALESCE(time,'00:00') DESC LIMIT 14", [since])]

    works_top = works_groups(works_rows(conn))["worked"][:3]

    return emit({
        "range": {"from": span["a"], "to": span["b"]},
        "entries": span["n"],
        "days": span["days"],
        "sessions_per_day": round(span["n"] / span["days"], 2) if span["days"] else 0,
        "scores": scores,
        "domains": domains,
        "by_slot": by_slot,
        "flags": flags,
        "methods": methods,
        "prescription_follow_through": {"n": follow["n"], "done": follow["done"] or 0},
        "works_top": works_top,
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
    days = conn.execute("SELECT COUNT(DISTINCT date) AS n FROM entries").fetchone()["n"]
    return emit({
        "home": home_dir(),
        "data": data_dir(),
        "db": db_path(),
        "db_exists": os.path.exists(db_path()),
        "md_files": len(scan_files()),
        "db_entries": total,
        "db_days": days,
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
    p.add_argument("--days", type=int, default=14, help="하루 단위 롤업을 볼 기간")
    p.add_argument("--limit", type=int, default=20, help="세션 단위로 되짚을 개수")
    p.add_argument("--date", help="오늘로 간주할 날짜 (YYYY-MM-DD)")
    p.add_argument("--full", action="store_true", help="오늘 세션의 본문까지 함께 출력합니다")
    p.set_defaults(func=cmd_context)

    p = sub.add_parser("save", help="세션 하나를 저장합니다")
    p.add_argument("--json", help="기록 payload. '-' 또는 생략하면 stdin에서 읽습니다")
    p.add_argument("--force", action="store_true", help="같은 시각의 세션을 덮어씁니다")
    p.add_argument("--allow-tainted", action="store_true",
                   help="오염 검사 결과를 사용자가 직접 확인하고 허락했을 때만 씁니다")
    p.set_defaults(func=cmd_save)

    p = sub.add_parser("day", help="하루치 세션을 모아서 출력합니다")
    p.add_argument("--date", help="볼 날짜 (YYYY-MM-DD). 생략하면 오늘")
    p.set_defaults(func=cmd_day)

    p = sub.add_parser("stats", help="누적 점수와 영역 패턴을 출력합니다")
    p.add_argument("--days", type=int, default=0, help="최근 N일만 (0이면 전체)")
    p.set_defaults(func=cmd_stats)

    p = sub.add_parser("works", help="걸음별 실행·도움 실적을 태그 단위로 출력합니다")
    p.set_defaults(func=cmd_works)

    p = sub.add_parser("query", help="DB에 읽기 전용 SQL을 던집니다")
    p.add_argument("--sql", help="SELECT 또는 WITH 문. 생략하면 stdin에서 읽습니다")
    p.add_argument("--limit", type=int, default=200)
    p.set_defaults(func=cmd_query)

    p = sub.add_parser("sync", help="md 원본과 DB를 맞춥니다")
    p.add_argument("--rebuild", action="store_true", help="DB를 비우고 md에서 전부 다시 읽습니다")
    p.set_defaults(func=cmd_sync)

    p = sub.add_parser("guard", help="사용자가 하지 않은 말이 섞였는지 검사합니다")
    p.add_argument("--json", help="검사할 payload. '-'이면 stdin에서 읽습니다")
    p.set_defaults(func=cmd_guard)

    p = sub.add_parser("where", help="경로와 DB 상태를 출력합니다")
    p.set_defaults(func=cmd_where)

    args = parser.parse_args(argv)
    if not getattr(args, "func", None):
        parser.print_help()
        return 0
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
