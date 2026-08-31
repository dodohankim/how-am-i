import { useEffect, useState } from "react";
import { api } from "../api";
import type { Day, DayRollup, Methods, Questions } from "../types";
import { Card, Empty, ErrorBox } from "./ui";
import { ChatButton, SessionBody } from "./Chat";
import { KIND_LABEL, SLOT_LABEL, fmtDate, fmtNum, labelOf } from "../lib/format";

export function Records({ days, questions, methods, onOpenMethod }: {
  days: DayRollup[];
  questions: Questions | null;
  methods: Methods | null;
  onOpenMethod: (id: string) => void;
}) {
  const list = [...days].reverse();
  const [selected, setSelected] = useState<string | null>(list[0]?.date ?? null);
  const [day, setDay] = useState<Day | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState<Record<string, string>>({});
  const stateKeys = questions?.states.map((q) => q.key) ?? ["energy", "mood", "sleep", "execution"];
  const methodName = (id: string) => methods?.methods.find((m) => m.id === id)?.name.ko ?? id;

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    setError(null);
    api.day(selected).then((d) => alive && setDay(d)).catch((e) => alive && setError(String(e.message ?? e)));
    return () => { alive = false; };
  }, [selected]);

  if (!list.length) {
    return <Card><Empty title="아직 기록이 없어요">첫 세션을 남기면 여기에 날짜별로 쌓여요.</Empty></Card>;
  }

  async function toggleRaw(id: string) {
    if (showRaw[id] !== undefined) {
      setShowRaw((s) => { const c = { ...s }; delete c[id]; return c; });
      return;
    }
    try {
      const e = await api.entry(id);
      setShowRaw((s) => ({ ...s, [id]: e.raw }));
    } catch (err: any) {
      setError(String(err.message ?? err));
    }
  }

  return (
    <div className="records">
      <Card className="day-list">
        {list.map((d) => (
          <button type="button" key={d.date} className="day-item" aria-current={d.date === selected}
            onClick={() => setSelected(d.date)}>
            <span>
              <span className="d">{fmtDate(d.date)}</span>
              <span className="faint tiny"> · {d.sessions}회</span>
            </span>
            <span className="mini" aria-hidden="true">
              {stateKeys.map((k) => {
                const v = d.scores[k];
                return <i key={k} className={v !== undefined ? "on" : ""} style={{ height: v !== undefined ? 4 + (v / 5) * 12 : 4, opacity: v !== undefined ? 0.35 + (v / 5) * 0.65 : 1 }} />;
              })}
            </span>
          </button>
        ))}
      </Card>

      <div>
        {error && <ErrorBox error={error} />}
        {day && day.entries && (
          <Card title={`${fmtDate(day.date)} · 세션 ${day.sessions}개`}
            hint={day.rollup && Object.keys(day.rollup.scores).length ? stateKeys.map((k) => `${labelOf(k, questions?.states)} ${fmtNum(day.rollup!.scores[k])}`).join(" · ") : undefined}>
            <div className="session-list">
              {day.entries.map((s) => (
                <div className="session" key={s.id}>
                  <div className="session-head">
                    <span className="time">{s.time ?? "시각 없음"}</span>
                    <span className="chip">{KIND_LABEL[s.kind]}{s.slot && ` · ${SLOT_LABEL[s.slot]}`}</span>
                    {stateKeys.filter((k) => s.scores[k] !== undefined).map((k) => (
                      <span className="chip" key={k}>{labelOf(k, questions?.states)} <b className="num">{s.scores[k]}</b></span>
                    ))}
                    <span style={{ marginLeft: "auto" }}>
                      <ChatButton body={s.body} title={`${fmtDate(s.date)} ${s.time ?? ""}`} />
                    </span>
                    <button type="button" className="raw-toggle" onClick={() => toggleRaw(s.id)}>
                      {showRaw[s.id] !== undefined ? "본문 보기" : "원본 md"}
                    </button>
                  </div>
                  {s.domains.length > 0 && (
                    <div className="chips" style={{ marginBottom: 8 }}>
                      {s.domains.map((d) => (
                        <span className="chip" key={d.key} title={d.note ?? ""}>
                          {labelOf(d.key, questions?.domains)} <b className="num">{d.score ?? "–"}</b>
                          {d.note && <span className="faint"> · {d.note}</span>}
                        </span>
                      ))}
                    </div>
                  )}
                  {s.prescription && <p className="prescription" style={{ fontSize: 15 }}>{s.prescription}</p>}
                  {s.methods.length > 0 && (
                    <div className="chips" style={{ marginBottom: 8 }}>
                      {s.methods.map((m) => (
                        <button type="button" key={m} className="chip accent" style={{ cursor: "pointer" }} onClick={() => onOpenMethod(m)}>
                          {methodName(m)}
                        </button>
                      ))}
                    </div>
                  )}
                  {showRaw[s.id] !== undefined
                    ? <pre className="raw">{showRaw[s.id]}</pre>
                    : s.body ? <SessionBody body={s.body} /> : <div className="faint small">본문 없음</div>}
                </div>
              ))}
            </div>
          </Card>
        )}
        {day && !day.entries && <Card><Empty title={day.note ?? "그날 기록이 없어요"} /></Card>}
        {!day && !error && <Card><div className="muted small">불러오는 중…</div></Card>}
      </div>
    </div>
  );
}
