import type { KeyStats, Lang, Methods, Questions, Slot, Stats, Works, WorksItem } from "../types";
import { Card, Empty, RangePicker, Section } from "./ui";
import { Sparkline } from "./Sparkline";
import { addDays, fmtNum, labelOf, rampStep, seriesVar, slotLabel, todayIso, weekdays } from "../lib/format";
import { useI18n } from "../lib/i18n";

export function Trends({ stats, days, onDays, questions, methods, onOpenMethod, works }: {
  stats: Stats;
  days: number;
  onDays: (d: number) => void;
  questions: Questions | null;
  methods: Methods | null;
  onOpenMethod: (id: string) => void;
  works: Works | null;
}) {
  const { lang, t, pick } = useI18n();
  const RANGES = [
    { label: t("14일", "14d"), value: 14 },
    { label: t("30일", "30d"), value: 30 },
    { label: t("90일", "90d"), value: 90 },
    { label: t("전체", "All"), value: 0 },
  ];
  const picker = <RangePicker value={days} onChange={onDays} options={RANGES} />;

  if (!stats.entries || !stats.range) {
    return (
      <>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>{picker}</div>
        <Card>
          <Empty title={t("이 기간에는 기록이 없어요", "No records in this range")}>
            {t("기간을 넓혀 보거나, 오늘 첫 기록을 남겨 보세요.", "Widen the range, or leave today's first record.")}
          </Empty>
        </Card>
      </>
    );
  }

  const to = todayIso();
  const from = days > 0 ? addDays(to, -(days - 1)) : stats.range.from;
  const stateKeys = orderKeys(Object.keys(stats.scores ?? {}), questions?.states.map((q) => q.key) ?? []);
  const domainKeys = orderKeys(Object.keys(stats.domains ?? {}), questions?.domains.map((q) => q.key) ?? []);
  const follow = stats.prescription_follow_through ?? { n: 0, done: 0 };
  const methodName = (id: string) => {
    const m = methods?.methods.find((x) => x.id === id);
    return m ? pick(m.name) || id : id;
  };
  const SLOT_ORDER: Slot[] = ["morning", "day", "evening", "night"];
  const slots = SLOT_ORDER.filter((s) => (stats.by_slot ?? []).some((r) => r.slot === s));

  return (
    <>
      <div className="section" style={{ marginTop: 0 }}>
        <div className="section-head">
          <h2>{t("하루를 관통하는 축", "Axes running through the day")}</h2>
          <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span className="hint">
              {lang === "en"
                ? `${stats.days} days · ${stats.entries} sessions · ${fmtNum(stats.sessions_per_day, 1)}/day`
                : `${stats.days}일 · 세션 ${stats.entries}개 · 하루 평균 ${fmtNum(stats.sessions_per_day, 1)}회`}
            </span>
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
        <Section title={t("생활 영역", "Life areas")} hint={t("점수를 매긴 날만 표시", "Only days with a score")}>
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

      <Section title={t("요일별 평균", "Averages by weekday")} hint={t("진할수록 높다 · 칸 위에 올리면 기록 수", "Darker is higher · hover a cell for the count")}>
        <Card>
          <div style={{ overflowX: "auto" }}>
            <WeekdayHeat
              lang={lang}
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
        <Card title={t("처방 실행률", "Follow-through")} hint={t("확인한 것 중", "Of steps checked")}>
          <div className="stat-tile">
            <div className="big">{follow.n ? `${Math.round((follow.done / follow.n) * 100)}%` : "–"}</div>
            <div className="cap">
              {follow.n
                ? t(`${follow.n}번 확인, ${follow.done}번 실행`, `${follow.n} checked, ${follow.done} done`)
                : t("아직 확인한 처방이 없어요", "No steps checked yet")}
            </div>
          </div>
          {(stats.recent_prescriptions?.length ?? 0) > 0 && (
            <ul className="small muted" style={{ margin: "12px 0 0", paddingLeft: 18 }}>
              {stats.recent_prescriptions!.slice(-5).reverse().map((p) => (
                <li key={p.id}><span className="num faint">{p.date.slice(5)}</span> {p.prescription}</li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t("자주 쓴 기법", "Most-used techniques")} hint={t("누르면 설명", "Click for details")}>
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
          ) : <div className="muted small">{t("기록된 기법이 없어요.", "No techniques recorded.")}</div>}
        </Card>

        <Card title={slots.length > 1 ? t("시간대별 평균", "Averages by time of day") : t("신호", "Signals")}
          hint={slots.length > 1 ? t("하루에 여러 번 쓸 때 의미가 생겨요", "Meaningful with several sessions a day") : t("자동 감지된 것", "Detected automatically")}>
          {slots.length > 1 ? (
            <div style={{ overflowX: "auto" }}>
              <table className="heat">
                <thead><tr><th className="row"></th>{slots.map((s) => <th key={s}>{slotLabel(lang, s)}</th>)}</tr></thead>
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
          ) : <div className="muted small">{t("이 기간에는 급락이나 낮은 점수 신호가 없었어요.", "No drops or low-score signals in this range.")}</div>}
        </Card>
      </div>

      <Section title={t("나에게 통한 것", "What worked for me")}
        hint={t("'도움이 됐다'고 직접 확인한 답만 세요 · 기간과 무관한 전체 기록", "Counts only what you yourself confirmed helped · all records, not range-bound")}>
        <div className="grid cols-2">
          <Card title={t("도움이 됐다고 확인한 걸음", "Steps you confirmed helped")}>
            {works?.worked?.length ? (
              <ul className="works-list">
                {works.worked.map((w) => <WorksRow key={w.tag} w={w} questions={questions} />)}
              </ul>
            ) : (
              <div className="muted small">
                {t("아직 없어요. 다음 걸음을 정하고, 다음 세션에서 \"해보니 어땠는지\" 답이 두 번 이상 쌓이면 여기에 모여요.",
                  "Nothing yet. Set next steps and answer \"how did it go\" in later sessions - after two or more attempts it collects here.")}
              </div>
            )}
            {(works?.undecided?.length ?? 0) > 0 && (
              <div className="muted small" style={{ marginTop: 10 }}>
                {t(`판정이 아직 갈리는 걸음 ${works!.undecided.length}개`,
                  `${works!.undecided.length} steps with mixed or missing verdicts`)}
              </div>
            )}
            {(works?.pending?.length ?? 0) > 0 && (
              <div className="muted small" style={{ marginTop: 4 }}>
                {t(`판정을 모으는 중인 걸음 ${works!.pending.length}개 (시도 1회)`,
                  `${works!.pending.length} steps still collecting (1 attempt)`)}
              </div>
            )}
          </Card>
          <Card title={t("도움이 안 됐다고 확인한 걸음", "Steps you confirmed didn't help")}
            hint={t("다시 권하지 않아요", "Not suggested again")}>
            {works?.not_worked?.length ? (
              <ul className="works-list">
                {works.not_worked.map((w) => <WorksRow key={w.tag} w={w} questions={questions} />)}
              </ul>
            ) : (
              <div className="muted small">{t("없어요.", "None.")}</div>
            )}
          </Card>
        </div>
      </Section>
    </>
  );
}

function WorksRow({ w, questions }: { w: WorksItem; questions: Questions | null }) {
  const { t } = useI18n();
  return (
    <li>
      <div>
        <span>{w.text ?? w.tag}</span>
        {w.domain && <span className="chip" style={{ marginLeft: 8 }}>{labelOf(w.domain, questions?.domains)}</span>}
      </div>
      <div className="muted small" style={{ marginTop: 2 }}>
        {t(`${w.attempts}번 정함 · ${w.done}번 실행 · ${w.helped_yes}번 도움`,
          `set ${w.attempts} · done ${w.done} · helped ${w.helped_yes}`)}
        {w.helped_no > 0 ? t(` · ${w.helped_no}번 아님`, ` · ${w.helped_no} not`) : ""}
        <span className="num faint" style={{ marginLeft: 8 }}>{w.last_set}</span>
      </div>
    </li>
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

function WeekdayHeat({ rows, lang }: { rows: { key: string; label: string; s: KeyStats }[]; lang: Lang }) {
  const wds = weekdays(lang);
  return (
    <table className="heat">
      <thead>
        <tr>
          <th className="row"></th>
          {wds.map((w) => <th key={w}>{w}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <th className="row">{r.label}</th>
            {wds.map((_, wd) => {
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
  const { t } = useI18n();
  if (v === null) return <td className="empty" title={t("기록 없음", "No record")}>·</td>;
  const step = rampStep(v);
  const dark = step >= 400;
  return (
    <td title={t(`${n}개 세션 평균`, `Average of ${n} sessions`)} style={{ background: `var(--seq-${step})`, color: dark ? "#ffffff" : "var(--ink)" }}>
      {fmtNum(v)}
    </td>
  );
}
