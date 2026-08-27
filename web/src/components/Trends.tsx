import type { KeyStats, Methods, Questions, Slot, Stats } from "../types";
import { Card, Empty, RangePicker, Section } from "./ui";
import { Sparkline } from "./Sparkline";
import { SLOT_LABEL, WEEKDAY_KO, addDays, fmtNum, labelOf, rampStep, seriesVar, todayIso } from "../lib/format";

const RANGES = [
  { label: "14일", value: 14 },
  { label: "30일", value: 30 },
  { label: "90일", value: 90 },
  { label: "전체", value: 0 },
];

export function Trends({ stats, days, onDays, questions, methods, onOpenMethod }: {
  stats: Stats;
  days: number;
  onDays: (d: number) => void;
  questions: Questions | null;
  methods: Methods | null;
  onOpenMethod: (id: string) => void;
}) {
  const picker = <RangePicker value={days} onChange={onDays} options={RANGES} />;

  if (!stats.entries || !stats.range) {
    return (
      <>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>{picker}</div>
        <Card><Empty title="이 기간에는 기록이 없어요">기간을 넓혀 보거나, 오늘 첫 기록을 남겨 보세요.</Empty></Card>
      </>
    );
  }

  const to = todayIso();
  const from = days > 0 ? addDays(to, -(days - 1)) : stats.range.from;
  const stateKeys = orderKeys(Object.keys(stats.scores ?? {}), questions?.states.map((q) => q.key) ?? []);
  const domainKeys = orderKeys(Object.keys(stats.domains ?? {}), questions?.domains.map((q) => q.key) ?? []);
  const follow = stats.prescription_follow_through ?? { n: 0, done: 0 };
  const methodName = (id: string) => methods?.methods.find((m) => m.id === id)?.name.ko ?? id;
  const SLOT_ORDER: Slot[] = ["morning", "day", "evening", "night"];
  const slots = SLOT_ORDER.filter((s) => (stats.by_slot ?? []).some((r) => r.slot === s));

  return (
    <>
      <div className="section" style={{ marginTop: 0 }}>
        <div className="section-head">
          <h2>하루를 관통하는 축</h2>
          <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span className="hint">{stats.days}일 · 세션 {stats.entries}개 · 하루 평균 {fmtNum(stats.sessions_per_day, 1)}회</span>
            {picker}
          </span>
        </div>
        <div className="grid cols-4">
          {stateKeys.map((key) => (
            <Card key={key}>
              <Sparkline name={labelOf(key, questions?.states)} color={seriesVar(key)}
                series={stats.scores![key].series} from={from} to={to} mean={stats.scores![key].mean} />
            </Card>
          ))}
        </div>
      </div>

      {domainKeys.length > 0 && (
        <Section title="생활 영역" hint="점수를 매긴 날만 표시">
          <div className="grid cols-3">
            {domainKeys.map((key) => (
              <Card key={key}>
                <Sparkline name={labelOf(key, questions?.domains)} color={seriesVar(key)}
                  series={stats.domains![key].series} from={from} to={to} mean={stats.domains![key].mean} />
              </Card>
            ))}
          </div>
        </Section>
      )}

      <Section title="요일별 평균" hint="진할수록 높다 · 칸 위에 올리면 기록 수">
        <Card>
          <div style={{ overflowX: "auto" }}>
            <WeekdayHeat
              rows={[
                ...stateKeys.map((k) => ({ key: k, label: labelOf(k, questions?.states), s: stats.scores![k] })),
                ...domainKeys.map((k) => ({ key: k, label: labelOf(k, questions?.domains), s: stats.domains![k] })),
              ]}
            />
          </div>
          <div className="heat-legend">
            <span>1</span>
            {[100, 200, 300, 400, 500, 600, 700].map((s) => <i key={s} style={{ background: `var(--seq-${s})` }} />)}
            <span>5</span>
          </div>
        </Card>
      </Section>

      <div className="grid cols-3" style={{ marginTop: 24 }}>
        <Card title="처방 실행률" hint="확인한 것 중">
          <div className="stat-tile">
            <div className="big">{follow.n ? `${Math.round((follow.done / follow.n) * 100)}%` : "–"}</div>
            <div className="cap">{follow.n ? `${follow.n}번 확인, ${follow.done}번 실행` : "아직 확인한 처방이 없어요"}</div>
          </div>
          {(stats.recent_prescriptions?.length ?? 0) > 0 && (
            <ul className="small muted" style={{ margin: "12px 0 0", paddingLeft: 18 }}>
              {stats.recent_prescriptions!.slice(-5).reverse().map((p) => (
                <li key={p.id}><span className="num faint">{p.date.slice(5)}</span> {p.prescription}</li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="자주 쓴 기법" hint="누르면 설명">
          {stats.methods?.length ? (
            <div className="bars">
              {stats.methods.slice(0, 8).map((m) => {
                const max = stats.methods![0].n;
                return (
                  <div className="bar-row" key={m.method}>
                    <button type="button" className="chip accent" style={{ cursor: "pointer", justifySelf: "start", maxWidth: "100%" }}
                      onClick={() => onOpenMethod(m.method)} title={m.method}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{methodName(m.method)}</span>
                    </button>
                    <div className="track"><div className="fill" style={{ width: `${(m.n / max) * 100}%` }} /></div>
                    <span className="n">{m.n}</span>
                  </div>
                );
              })}
            </div>
          ) : <div className="muted small">기록된 기법이 없어요.</div>}
        </Card>

        <Card title={slots.length > 1 ? "시간대별 평균" : "신호"} hint={slots.length > 1 ? "하루에 여러 번 쓸 때 의미가 생겨요" : "자동 감지된 것"}>
          {slots.length > 1 ? (
            <div style={{ overflowX: "auto" }}>
              <table className="heat">
                <thead><tr><th className="row"></th>{slots.map((s) => <th key={s}>{SLOT_LABEL[s]}</th>)}</tr></thead>
                <tbody>
                  {stateKeys.map((k) => (
                    <tr key={k}>
                      <th className="row">{labelOf(k, questions?.states)}</th>
                      {slots.map((s) => {
                        const r = stats.by_slot!.find((x) => x.slot === s && x.key === k);
                        return <HeatCell key={s} v={r?.mean ?? null} n={r?.n ?? 0} />;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : stats.flags?.length ? (
            <div className="chips">
              {stats.flags.map((f) => <span className="chip" key={f.flag}>{f.flag} <b className="num">{f.n}</b></span>)}
            </div>
          ) : <div className="muted small">이 기간에는 급락이나 낮은 점수 신호가 없었어요.</div>}
        </Card>
      </div>
    </>
  );
}

function orderKeys(keys: string[], preferred: string[]): string[] {
  return [...keys].sort((a, b) => {
    const ia = preferred.indexOf(a), ib = preferred.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function WeekdayHeat({ rows }: { rows: { key: string; label: string; s: KeyStats }[] }) {
  return (
    <table className="heat">
      <thead>
        <tr>
          <th className="row"></th>
          {WEEKDAY_KO.map((w) => <th key={w}>{w}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <th className="row">{r.label}</th>
            {WEEKDAY_KO.map((_, wd) => {
              const cell = r.s.by_weekday.find((b) => b.weekday === wd);
              return <HeatCell key={wd} v={cell?.mean ?? null} n={cell?.n ?? 0} />;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HeatCell({ v, n }: { v: number | null; n: number }) {
  if (v === null) return <td className="empty" title="기록 없음">·</td>;
  const step = rampStep(v);
  const dark = step >= 400;
  return (
    <td title={`${n}개 세션 평균`} style={{ background: `var(--seq-${step})`, color: dark ? "#ffffff" : "var(--ink)" }}>
      {fmtNum(v)}
    </td>
  );
}
