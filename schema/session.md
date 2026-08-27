# 세션 기록 스키마 (v2)

`$HOWAMI_HOME/data/YYYY-MM-DD--HHMM.md` 한 파일이 **대화 한 번**이다.
하루에 몇 번을 기록하든 파일이 그만큼 생기고, 하루로 묶는 것은 조회의 몫이다.

```
data/
├── 2026-08-27--0940.md   # 아침 체크인
├── 2026-08-27--1830.md   # 퇴근길 체크인
└── 2026-08-27--2210.md   # 밤 세션 (하루 종합)
```

v1의 `YYYY-MM-DD.md`(시각 없는 파일)도 그대로 읽힌다. 시각이 `null`인 세션 하나로
취급되고, 정렬할 때 그날의 맨 앞에 온다. 굳이 이름을 바꿀 필요는 없다.

**md가 원본이고 SQLite(`$HOWAMI_HOME/howami.db`)는 파생 인덱스다.**
DB를 지워도 md만 있으면 완전히 복원되지만, 반대는 성립하지 않는다.

```bash
python3 scripts/howami.py sync            # 바뀐 md만 반영
python3 scripts/howami.py sync --rebuild  # DB를 비우고 md에서 전부 다시 읽기
```

`context` / `day` / `stats` / `query`는 실행 전에 자동으로 동기화한다.
md를 에디터로 고치거나 다른 기기에서 git으로 받아와도 다음 호출에 반영된다.
판단 기준은 파일의 mtime과 크기다.

스키마 버전이 올라가면 DB는 버려지고 md에서 다시 만들어진다. 원본이 md이므로
잃는 것이 없다.

## 파일 형태

```markdown
---
date: "2026-08-27"
time: "22:10"
kind: "session"
scores: {"energy": 2, "mood": 3, "sleep": 2, "execution": 3}
domains: [{"key": "family", "score": 4, "note": "저녁에 같이 산책"}, {"key": "work", "score": 2, "note": "기획 회의에서 준비 부족"}, {"key": "people", "score": null, "note": "오늘은 따로 만난 사람이 없었다"}]
flags: ["work_drop"]
methods: ["day_mapping", "domain_scan", "trigger_mapping", "five_whys", "summary_validation", "implementation_intention"]
prescription: "내일 아침 캘린더 3분 확인"
prev_prescription_done: false
---

## 하루 지도
- 아침: 가족과 등원 준비, 서로 재촉하다 짜증
- 낮: 기획 회의에서 준비 없이 들어감
- 밤: 혼자 30분 읽음

## 초점 — 일
- 트리거: 오후 기획 회의
- 생각: "준비 없이 들어갔다"
- 감정: 자책, 조급함
- 왜 체인: 준비 부족 → 일정이 당겨진 걸 몰랐다 → 캘린더를 아침에 안 봤다
- 근본 원인: 아침 캘린더 확인 습관이 없다
- 통제 가능성: 가능

## 확인받은 것
- 아침의 짜증이 낮까지 이어졌는지 물었더니, 그건 아니고 회의 건은 따로였다고 함

## 다음 걸음
- 내일 아침 캘린더 3분 확인 (일어나서 커피 내리는 동안)

## 참고한 기법
- 하루 지도 → 영역별 척도 → 트리거 특정 → 5 Whys(3단계) → 요약 검증 → 실행 의도
```

## frontmatter 필드

| 필드 | 타입 | 필수 | 설명 |
|---|---|:--:|---|
| `date` | `"YYYY-MM-DD"` | ✓ | 파일명의 앞부분과 같아야 한다 |
| `time` | `"HH:MM"` / null | | 파일명의 뒷부분과 같아야 한다. v1 기록은 null |
| `kind` | `"session"` / `"checkin"` | | 값이 없거나 이상하면 `session`으로 읽는다 |
| `scores` | 객체 | | 하루를 관통하는 축. 키는 질문 세트의 `state_scan[].key`, 값은 **1~5 정수** |
| `domains` | 배열 | | 생활 영역별 관점. `{key, score, note}` 형태 |
| `flags` | 문자열 배열 | | 자동 감지된 신호 (`work_drop`, `mood_low`) |
| `methods` | 문자열 배열 | | 그 세션에서 밟은 상담 기법 id. 카탈로그는 `questions/methods.yaml` |
| `prescription` | 문자열/null | | 다음번까지 바꿀 행동 하나 |
| `prev_prescription_done` | 불리언/null | | 지난번 처방을 실행했는지. 모르면 null |

값은 전부 JSON 리터럴로 쓴다. 표준 라이브러리만으로 읽기 위한 제약이고,
덕분에 YAML 의존성 없이 어떤 언어에서도 읽힌다.

범위를 벗어난 점수나 형식이 깨진 값은 동기화 때 조용히 버려진다.
md를 손으로 고치더라도 나머지 필드는 그대로 살아남는다.

### `domains` 항목

```json
{ "key": "work", "score": 2, "note": "기획 회의에서 준비 부족" }
```

| 필드 | 규칙 |
|---|---|
| `key` | 질문 세트 `domains[].key`. 없으면 그 항목은 버려진다 |
| `score` | 1~5 정수 또는 `null`. 물어봤지만 점수를 매기기 어려웠던 날은 null |
| `note` | 그 점수를 준 이유 한 줄. 사용자의 표현을 그대로 살린다 |

`score`와 `note`가 둘 다 비면 그 항목은 버려진다.
**아예 묻지 않은 영역은 항목 자체를 넣지 않는다.** "묻지 않았다"와 "물었는데 0이었다"는
나중에 패턴을 볼 때 전혀 다른 뜻이 되기 때문이다.

`scores`와 `domains`의 키는 고정이 아니다. 질문 세트를 바꾸면 키도 따라 바뀌고,
통계는 그 시점에 존재하는 키만 집계한다.

## 본문

정해진 형식은 없다. 다만 `## 하루 지도` / `## 초점` / `## 확인받은 것` /
`## 다음 걸음` / `## 참고한 기법` 을 쓰면 나중에 읽기 쉽다.
짧은 체크인은 본문이 두세 줄이어도 된다.

`## 확인받은 것`이 있는 이유는, 에이전트의 해석 중 **사용자가 고친 것**을 남기기
위해서다. 나중에 왜 그런 결론이 났는지 되짚을 때 이 줄이 가장 쓸모 있다.

## SQLite 스키마

```sql
entries(id PK, date, time, slot, weekday, kind, prescription,
        prev_prescription_done, body, source_path, source_mtime, source_size, synced_at)
scores (entry_id FK, key, value)            -- 하루를 관통하는 축
domains(entry_id FK, domain, score, note)   -- 생활 영역별 관점
flags  (entry_id FK, flag)
methods(entry_id FK, method)
meta   (key PK, value)                      -- schema_version
```

- `id`는 파일명에서 확장자를 뺀 것이다 (`2026-08-27--2210`).
- `weekday`는 0=월요일인 정수다. 언어에 따라 이름이 달라지므로 DB에는 숫자만 넣고,
  표시용 이름은 출력 단계에서 붙인다.
- `slot`은 시각에서 파생된 `morning`(~11시) / `day`(~17시) / `evening`(~22시) / `night`이다.
  하루 중 언제가 낮은지를 보려고 둔 컬럼이다.

점수를 가로 컬럼(`energy`, `mood`, …)이 아니라 세로로 쌓은 이유는, 질문 세트를
바꾸거나 확장팩을 얹을 때 **테이블 스키마를 건드리지 않기 위해서**다.
새 항목이 생기면 새 `key`가 들어올 뿐이다. `domains`도 같은 이유로 세로다.

`ON DELETE CASCADE`가 걸려 있어 `entries`에서 세션 하나를 지우면 딸린 점수·영역·
플래그·기법도 함께 지워진다. 동기화는 md에서 사라진 세션을 이 방식으로 정리한다.

## 조회

```bash
# 영역별 요일 평균 — 하루를 뭉뚱그렸으면 안 보였을 것
python3 scripts/howami.py query --sql "
  SELECT d.domain, e.weekday, ROUND(AVG(d.score),2) AS mean
  FROM domains d JOIN entries e ON e.id = d.entry_id
  WHERE d.score IS NOT NULL
  GROUP BY d.domain, e.weekday ORDER BY mean"

# 하루 안에서 기분이 어떻게 움직였나
python3 scripts/howami.py query --sql "
  SELECT e.date, e.time, s.value
  FROM scores s JOIN entries e ON e.id = s.entry_id
  WHERE s.key = 'mood' AND e.time IS NOT NULL
  ORDER BY e.date DESC, e.time"
```

`SELECT`와 `WITH`만 통과한다. 쓰기·스키마 변경·여러 문장은 거부한다.
DB는 언제든 버릴 수 있는 캐시여야 하므로, 원본을 우회해 DB에 직접 쓰는 길을 막았다.

하루치를 통으로 읽을 때는 SQL 대신 전용 명령이 있다.

```bash
python3 scripts/howami.py day --date 2026-08-27
```
