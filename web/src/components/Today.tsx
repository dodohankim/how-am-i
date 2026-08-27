import type { Context, Methods, Questions, Session } from "../types";
import { Card, Empty, Section } from "./ui";
import { Ladder } from "./Ladder";
import { Markdown } from "./Markdown";
import { KIND_LABEL, SLOT_LABEL, fmtDate, fmtNum, labelOf, seriesVar } from "../lib/format";

export function Today({ ctx, questions, methods, onOpenMethod }: {
  ctx: Context;
  questions: Questions | null;
  methods: Methods | null;
  onOpenMethod: (id: string) => void;
}) {
  const sessions = ctx.today_sessions;
  // 사다리와 영역은 오늘 마지막 세션을 기준으로 그린다. 체크인보다 세션을 우선한다.
  const primary: Session | null =
    [...sessions].reverse().find((s) => s.kind === "session") ?? sessions[sessions.length - 1] ?? null;

  const stateKeys = questions?.states.map((q) => q.key) ?? ["energy", "mood", "sleep", "execution"];
  const domainOrder = questions?.domains.map((q) => q.key) ?? [];
  const methodName = (id: string) => methods?.methods.find((m) => m.id === id)?.name.ko ?? id;

  if (!sessions.length) {
    return (
      <>
        <Card>
          <Empty title={`${fmtDate(ctx.today)}, 아직 오늘 기록이 없어요`}>
            <div>Claude Code 에서 <code>/howami</code> 라고 말하면 5분 안에 끝나요.</div>
            {ctx.last_entry && (
              <div className="small" style={{ marginTop: 10 }}>
                마지막 기록: {fmtDate(ctx.last_entry.date)} {ctx.last_entry.time ?? ""}
                {ctx.streak_days > 0 && ` · 연속 ${ctx.streak_days}일`}
              </div>
            )}
          </Empty>
        </Card>
        {ctx.open_prescription && <PrescriptionCard ctx={ctx} primary={null} />}
      </>
    );
  }

  return (
    <>
      <div className="grid today-top">
        <Card
          title="하루를 관통하는 축"
          hint={primary ? `${primary.time ?? ""} ${KIND_LABEL[primary.kind]} 기준 · ◀ 는 최근 7일 평균` : undefined}
        >
          <div className="ladders">
            {stateKeys.map((key) => (
              <Ladder
                key={key}
                label={labelOf(key, questions?.states)}
                value={primary?.scores[key] ?? null}
                baseline={ctx.baseline_7d[key] ?? null}
                color={seriesVar(key)}
                dropThreshold={ctx.drop_threshold}
              />
            ))}
          </div>
        </Card>
        <PrescriptionCard ctx={ctx} primary={primary} />
      </div>

      {primary && primary.domains.length > 0 && (
        <Section title="생활 영역" hint="점수 옆은 그날 남긴 한 줄">
          <Card>
            <div className="domain-rows">
              {[...primary.domains]
                .sort((a, b) => domainOrder.indexOf(a.key) - domainOrder.indexOf(b.key))
                .map((d) => {
                  const base = ctx.domain_baseline_7d[d.key];
                  return (
                    <div className="domain-row" key={d.key}>
                      <span className="label">{labelOf(d.key, questions?.domains)}</span>
                      <span className="strip" aria-label={`${d.score ?? "점수 없음"}점`}>
                        {[1, 2, 3, 4, 5].map((n) => <i key={n} className={d.score !== null && n <= d.score ? "on" : ""} />)}
                        <span className="strip-num">
                          {d.score ?? "–"}
                          {base != null && <span className="faint"> / {fmtNum(base)}</span>}
                        </span>
                      </span>
                      <span className="note" title={d.note ?? ""}>{d.note ?? <span className="faint">—</span>}</span>
                    </div>
                  );
                })}
            </div>
            <div className="tiny faint" style={{ marginTop: 10 }}>점수 뒤의 회색 숫자는 최근 7일 평균이에요.</div>
          </Card>
        </Section>
      )}

      <Section title={`오늘의 세션 ${sessions.length}개`} hint="시간순">
        <Card>
          <div className="session-list">
            {sessions.map((s) => (
              <div className="session" key={s.id}>
                <div className="session-head">
                  <span className="time">{s.time ?? "시각 없음"}</span>
                  <span className="chip">{KIND_LABEL[s.kind]}{s.slot && ` · ${SLOT_LABEL[s.slot]}`}</span>
                  {s.flags.map((f) => <span className="chip" key={f}>{f}</span>)}
                  {s.prev_prescription_done !== null && (
                    <span className={`badge ${s.prev_prescription_done ? "done" : "undone"}`}>
                      {s.prev_prescription_done ? "✓ 지난 처방 했음" : "✗ 지난 처방 못 했음"}
                    </span>
                  )}
                </div>
                {s.methods.length > 0 && (
                  <div className="chips" style={{ marginBottom: 8 }}>
                    {s.methods.map((m) => (
                      <button type="button" key={m} className="chip accent" onClick={() => onOpenMethod(m)}
                        title="기법 설명 보기" style={{ cursor: "pointer" }}>
                        {methodName(m)}
                      </button>
                    ))}
                  </div>
                )}
                {s.body ? <Markdown text={s.body} /> : <div className="faint small">본문 없음</div>}
              </div>
            ))}
          </div>
        </Card>
      </Section>
    </>
  );
}

function PrescriptionCard({ ctx, primary }: { ctx: Context; primary: Session | null }) {
  const op = ctx.open_prescription;
  return (
    <Card title="다음 한 걸음" hint={op ? (op.same_day ? "오늘 정한 것" : `${fmtDate(op.from.slice(0, 10))}에 정한 것`) : undefined}>
      {op ? (
        <>
          <p className="prescription">{op.text}</p>
          <div className="small muted">
            {op.same_day
              ? "내일 세션을 시작하면 이걸 했는지 먼저 물어봐요."
              : "아직 열려 있어요. 오늘 세션을 시작하면 먼저 확인해요."}
          </div>
        </>
      ) : (
        <div className="muted">정해둔 다음 한 걸음이 없어요.</div>
      )}
      {primary?.prev_prescription_done !== null && primary?.prev_prescription_done !== undefined && (
        <div style={{ marginTop: 12 }}>
          <span className={`badge ${primary.prev_prescription_done ? "done" : "undone"}`}>
            {primary.prev_prescription_done ? "✓ 지난 처방을 실행했어요" : "✗ 지난 처방은 못 했어요"}
          </span>
        </div>
      )}
      <div className="tiny faint" style={{ marginTop: 14 }}>
        연속 {ctx.streak_days}일 · 기록한 날 {ctx.total_days}일 · 세션 {ctx.total_entries}개
      </div>
    </Card>
  );
}
