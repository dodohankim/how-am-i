# 일별 기록 스키마 (v1)

`$HOWAMI_HOME/data/YYYY-MM-DD.md` 한 파일이 하루다.

**md가 원본이고 SQLite(`$HOWAMI_HOME/howami.db`)는 파생 인덱스다.**
DB를 지워도 md만 있으면 완전히 복원되지만, 반대는 성립하지 않는다.

```bash
python3 scripts/howami.py sync            # 바뀐 md만 반영
python3 scripts/howami.py sync --rebuild  # DB를 비우고 md에서 전부 다시 읽기
```

`context` / `stats` / `query`는 실행 전에 자동으로 동기화한다.
md를 에디터로 고치거나 다른 기기에서 git으로 받아와도 다음 호출에 반영된다.
판단 기준은 파일의 mtime과 크기다.

## 파일 형태

```markdown
---
date: "2026-08-27"
scores: {"energy": 2, "mood": 3, "sleep": 4, "execution": 3, "social": 4}
flags: ["energy_drop"]
methods: ["baseline_delta", "trigger_mapping", "five_whys", "control_dichotomy", "implementation_intention"]
prescription: "회의 10분 전에 아젠다 훑기"
prev_prescription_done: true
---

## 탐지
- 트리거: 오후 기획 회의
- 생각: "준비 없이 들어갔다"
- 감정: 자책, 조급함
- 왜 체인: 준비 부족 → 일정이 당겨진 걸 몰랐다 → 캘린더를 아침에 안 봤다
- 근본 원인: 아침 캘린더 확인 습관이 없다
- 통제 가능성: 가능

## 처방
- 회의 10분 전에 아젠다 훑기 (내일 오후 2시 회의부터)

## 참고한 기법
- 기준선 비교 → 트리거 특정 → 5 Whys(3단계) → 통제 이분법 → 실행 의도
```

## frontmatter 필드

| 필드 | 타입 | 필수 | 설명 |
|---|---|:--:|---|
| `date` | `"YYYY-MM-DD"` | ✓ | 파일명과 같아야 한다 |
| `scores` | 객체 | ✓ | 키는 질문 세트의 `scan[].key`, 값은 **1~5 정수**. 건너뛴 항목은 키를 뺀다 |
| `flags` | 문자열 배열 | | 자동 감지된 신호 (`energy_drop`, `mood_low`) |
| `methods` | 문자열 배열 | | 그날 참고한 진단 기법 id. 카탈로그는 `questions/methods.yaml` |
| `prescription` | 문자열/null | | 내일 바꿀 행동 하나 |
| `prev_prescription_done` | 불리언/null | | 어제 처방을 실행했는지. 모르면 null |

값은 전부 JSON 리터럴로 쓴다. 표준 라이브러리만으로 읽기 위한 제약이고,
덕분에 YAML 의존성 없이 어떤 언어에서도 읽힌다.

범위를 벗어난 점수나 형식이 깨진 값은 동기화 때 조용히 버려진다.
md를 손으로 고치더라도 나머지 필드는 그대로 살아남는다.

`scores`의 키는 고정이 아니다. 질문 세트를 바꾸면 키도 따라 바뀌고,
통계는 그 시점에 존재하는 키만 집계한다.

## 본문

정해진 형식은 없다. 다만 `## 탐지` / `## 처방` / `## 참고한 기법` 세 섹션을 쓰면
나중에 읽기 쉽다. 탐지를 건너뛴 날(전부 괜찮았던 날)은 본문이 한 줄이어도 된다.

## SQLite 스키마

```sql
entries(date PK, weekday, prescription, prev_prescription_done,
        body, source_path, source_mtime, source_size, synced_at)
scores (date FK, key, value)      -- 세로로 쌓는다. 질문 세트가 바뀌어도 스키마는 그대로
flags  (date FK, flag)
methods(date FK, method)
meta   (key PK, value)            -- schema_version
```

`weekday`는 0=월요일인 정수다. 언어에 따라 이름이 달라지므로 DB에는 숫자만 넣고,
표시용 이름은 출력 단계에서 붙인다.

점수를 가로 컬럼(`energy`, `mood`, …)이 아니라 세로로 쌓은 이유는, 질문 세트를
바꾸거나 확장팩을 얹을 때 **테이블 스키마를 건드리지 않기 위해서**다.
새 항목이 생기면 새 `key`가 들어올 뿐이다.

`ON DELETE CASCADE`가 걸려 있어 `entries`에서 하루를 지우면 딸린 점수·플래그·기법도
함께 지워진다. 동기화는 md에서 사라진 날짜를 이 방식으로 정리한다.

## 조회

```bash
python3 scripts/howami.py query --sql "
  SELECT e.weekday, ROUND(AVG(s.value),2) AS mean
  FROM scores s JOIN entries e ON e.date = s.date
  WHERE s.key = 'energy' GROUP BY e.weekday ORDER BY mean"
```

`SELECT`와 `WITH`만 통과한다. 쓰기·스키마 변경·여러 문장은 거부한다.
DB는 언제든 버릴 수 있는 캐시여야 하므로, 원본을 우회해 DB에 직접 쓰는 길을 막았다.
