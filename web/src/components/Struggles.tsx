import { useMemo, useState } from "react";
import type { Lang, Methods, Questions, StruggleGroup, StruggleHelp, StruggleItem, Struggles as StrugglesData } from "../types";
import { Card } from "./ui";
import { LinkItem } from "./Methods";
import { labelOf, seriesVar, strengthLabel } from "../lib/format";
import { useI18n } from "../lib/i18n";

/**
 * 어려움 지도. questions/struggles.yaml 을 그대로 보여준다.
 * 전 세계 성인이 흔히 겪는 정신적 어려움을 세 묶음(어디서나 · 지역별 이름 · 상담 현장)으로 펼치고,
 * 각 항목이 하루 지도의 어느 영역·상태 축에서 드러나는지 칩으로 잇고,
 * 임상시험에서 도움이 된 과정(helps)을 "이런 과정을 거치면 나아졌다"로 붙인다.
 * helps 의 method 가 기법 탭의 id 와 맞으면 그 기법으로 건너뛸 수 있다.
 */
export function Struggles({ data, questions, methods, onOpenMethod }: {
  data: StrugglesData;
  questions: Questions | null;
  methods: Methods | null;
  onOpenMethod: (id: string) => void;
}) {
  const { lang, t, pick, alt } = useI18n();
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const total = data.groups.reduce((n, g) => n + g.items.length, 0);
  const methodName = (id: string) => {
    const m = methods?.methods.find((x) => x.id === id);
    return m ? pick(m.name) || undefined : undefined;
  };

  const groups = useMemo(() => {
    if (!term) return data.groups;
    return data.groups
      .map((g) => ({
        ...g,
        items: g.items.filter((it) => {
          const hay = [it.id, it.region, it.name.ko, it.name.en, it.summary, it.summary_en, it.figure, it.figure_en,
            it.variation, it.variation_en,
            ...it.domains.map((d) => labelOf(d, questions?.domains)),
            ...it.states.map((s) => labelOf(s, questions?.states)),
            ...it.helps.flatMap((h) => [h.name.ko, h.name.en, h.process, h.process_en, h.evidence, h.evidence_en])]
            .filter(Boolean).join(" ").toLowerCase();
          return hay.includes(term);
        }),
      }))
      .filter((g) => g.items.length);
  }, [data, term, questions]);
  const shown = groups.reduce((n, g) => n + g.items.length, 0);
  const patterns = lang === "en" && data.patterns_en?.length ? data.patterns_en : data.patterns;

  return (
    <>
      <div className="methods-toolbar">
        <input className="search" type="search"
          placeholder={t("어려움 이름, 지역, 수치, 도움이 된 과정, 하루 지도 영역으로 찾기", "Search by name, region, figure, what helped, or day-map area")}
          value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("어려움 검색", "Search struggles")} />
        <span className="faint small">{shown} / {total}</span>
      </div>

      {pick(data.intro) && <p className="struggle-intro">{pick(data.intro)}</p>}
      {alt(data.helps_note, data.helps_note_en) && <p className="muted small struggle-note">{alt(data.helps_note, data.helps_note_en)}</p>}
      <div className="struggle-meta">
        <span>{t("대상은 전 세계 성인", "About adults worldwide")}</span>
        {data.sources_reviewed && (
          <><span className="sep">|</span>
            <span>{lang === "en" ? <><b className="num">{data.sources_reviewed}</b> sources reviewed</> : <>출처 <b className="num">{data.sources_reviewed}</b>건 검토</>}</span></>
        )}
        {data.updated && <><span className="sep">|</span><span className="num">{data.updated}</span></>}
        <span className="sep">|</span>
        <span>{t("원본", "Source file")} <code className="num">questions/struggles.yaml</code></span>
      </div>

      {groups.map((g) => (
        <div className="stage-group" key={g.id}>
          <h2>
            {pick(g.title) || g.id}
            {lang === "ko" && g.title.en && <span className="en faint small" style={{ fontWeight: 400 }}>{g.title.en}</span>}
            <span className="n">{g.items.length}</span>
          </h2>
          {alt(g.note, g.note_en) && !term && <p className="muted small struggle-note">{alt(g.note, g.note_en)}</p>}
          {g.layout === "table"
            ? <RegionTable group={g} methodName={methodName} onOpenMethod={onOpenMethod} />
            : (
              <div className="grid" style={{ gap: 12 }}>
                {g.items.map((it) => (
                  <StruggleCard key={it.id} item={it} questions={questions} methodName={methodName} onOpenMethod={onOpenMethod} />
                ))}
              </div>
            )}
        </div>
      ))}

      {!groups.length && <Card><div className="muted">{t("검색 결과가 없어요.", "No results.")}</div></Card>}

      {!term && patterns.length > 0 && (
        <div className="stage-group patterns">
          <h2>{t("눈에 띄는 패턴", "Patterns that stand out")}</h2>
          <Card>
            <ol>{patterns.map((p, i) => <li key={i}>{p}</li>)}</ol>
          </Card>
        </div>
      )}

      <div className="disclaimer">
        {lang === "en"
          ? <><strong>This list is not a diagnostic chart or a prescription.</strong> It is a map of what is common and what helped
            in research — a name here fitting your state is not a diagnosis, and a process here is not guaranteed to work the same
            for you. Effect sizes are group averages, and waitlist-controlled numbers tend to be inflated. how-am-i is not a medical
            device or a psychotherapy tool. If low scores persist for two weeks or more, or anything feels like a crisis, reach a
            professional or a local crisis line — see{" "}
            <a href="https://findahelpline.com" target="_blank" rel="noopener noreferrer">findahelpline.com</a>; in South Korea,
            dial <b className="num">109</b> (24/7).</>
          : <><strong>이 목록은 진단표도 처방전도 아닙니다.</strong> "무엇이 흔한가"와 "연구에서 무엇이 도움이 됐나"를 알기 위한 지도일 뿐이며,
            여기 있는 이름이 내 상태에 붙는다고 해서 진단이 되는 것도, 여기 있는 과정이 나에게도 같은 효과를 낸다는 보장도 아닙니다.
            효과 크기는 집단 평균이고, 대기자 명단 대비 수치는 부풀려지기 쉽습니다. how-am-i 는 의료 기기나 심리 치료 도구가 아닙니다.
            낮은 점수가 2주 이상 이어지거나 위기 신호가 느껴진다면 전문가나 거주 지역의 위기 상담 전화에 연결하세요.
            한국에서는 자살예방 상담전화 <b className="num">109</b> 로 24시간 연결됩니다.</>}
      </div>
    </>
  );
}

function StruggleCard({ item, questions, methodName, onOpenMethod }: {
  item: StruggleItem; questions: Questions | null; methodName: (id: string) => string | undefined; onOpenMethod: (id: string) => void;
}) {
  const { lang, t, pick, alt } = useI18n();
  const summary = alt(item.summary, item.summary_en);
  const figure = alt(item.figure, item.figure_en);
  const variation = alt(item.variation, item.variation_en);
  return (
    <div className="card struggle-card" id={`struggle-${item.id}`}>
      <div className="method">
        <div>
          <h3>
            {pick(item.name) || item.id}
            {lang === "ko" && item.name.en && <span className="en">{item.name.en}</span>}
          </h3>
          {summary && <p className="summary">{summary}</p>}
          {figure && (
            <div className="figure">
              <div className="k">{t("얼마나 흔한가", "How common")}</div>
              <div>{figure}</div>
            </div>
          )}
          <dl className="kv">
            {variation && <><dt>{t("지역 편차", "Regional variation")}</dt><dd>{variation}</dd></>}
            {(item.domains.length > 0 || item.states.length > 0) && (
              <>
                <dt>{t("하루 지도", "Day map")}</dt>
                <dd>
                  <div className="chips">
                    {item.domains.map((d) => (
                      <span key={d} className="chip" title={t("이 어려움이 드러나기 쉬운 생활 영역", "Life areas where this tends to show")}>
                        <i className="dot" style={{ background: "var(--series-domain)" }} />{labelOf(d, questions?.domains)}
                      </span>
                    ))}
                    {item.states.map((s) => (
                      <span key={s} className="chip state" title={t("이 어려움이 먼저 흔드는 상태 축", "State axes this tends to shake first")}>
                        <i className="dot" style={{ background: seriesVar(s) }} />{labelOf(s, questions?.states)}
                      </span>
                    ))}
                  </div>
                </dd>
              </>
            )}
          </dl>
          {item.helps.length > 0 && <Helps helps={item.helps} methodName={methodName} onOpenMethod={onOpenMethod} />}
        </div>
        <div className="links">
          <h4>{t("더 읽기", "Read more")}</h4>
          {item.links.length
            ? <ul>{item.links.map((l) => <LinkItem key={l.url} link={l} />)}</ul>
            : <div className="faint small">{t("등록된 출처가 없어요.", "No sources yet.")}</div>}
        </div>
      </div>
    </div>
  );
}

/** "이런 과정을 거치면 나아졌다" 블록. 과정 → 효과 → 단서 → 출처 순서로, 근거 등급 배지를 단다. */
function Helps({ helps, methodName, onOpenMethod }: {
  helps: StruggleHelp[]; methodName: (id: string) => string | undefined; onOpenMethod: (id: string) => void;
}) {
  const { lang, t, pick, alt } = useI18n();
  return (
    <div className="helps">
      <div className="k">{t("이런 과정을 거치면 나아졌다", "What helped in trials")}</div>
      {helps.map((h, i) => {
        const mname = h.method ? methodName(h.method) : undefined;
        return (
          <div className="help" key={i}>
            <div className="help-head">
              <b>{pick(h.name) || h.method || "—"}</b>
              {lang === "ko" && h.name.en && <span className="en">{h.name.en}</span>}
              {h.strength && <span className={`badge ${h.strength}`} title={strengthHelp(h.strength, lang)}>{strengthLabel(lang, h.strength)}</span>}
              {h.method && mname && (
                <button type="button" className="chip accent help-method" onClick={() => onOpenMethod(h.method!)}
                  title={t("기법 탭에서 이 절차 보기", "See this procedure in the Techniques tab")}>
                  {t("기법", "Technique")} · {mname}
                </button>
              )}
            </div>
            {alt(h.process, h.process_en) && <div className="help-process">{alt(h.process, h.process_en)}</div>}
            {alt(h.evidence, h.evidence_en) && <div className="help-line"><span className="lbl">{t("효과", "Effect")}</span><span>{alt(h.evidence, h.evidence_en)}</span></div>}
            {alt(h.caveat, h.caveat_en) && <div className="help-line faint"><span className="lbl">{t("단서", "Caveat")}</span><span>{alt(h.caveat, h.caveat_en)}</span></div>}
            {h.links.length > 0 && (
              <ul className="help-links">
                {h.links.map((l) => <LinkItem key={l.url} link={l} />)}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RegionTable({ group, methodName, onOpenMethod }: {
  group: StruggleGroup; methodName: (id: string) => string | undefined; onOpenMethod: (id: string) => void;
}) {
  const { lang, t, pick, alt } = useI18n();
  return (
    <Card>
      <div className="struggle-table-wrap">
        <table className="struggle-table">
          <thead>
            <tr>
              <th>{t("지역", "Region")}</th><th>{t("이름", "Name")}</th><th>{t("어떤 것인가", "What it is")}</th>
              <th>{t("근거", "Evidence")}</th><th>{t("그곳에서 통한 것", "What worked there")}</th><th>{t("더 읽기", "Read more")}</th>
            </tr>
          </thead>
          <tbody>
            {group.items.map((it) => (
              <tr key={it.id} id={`struggle-${it.id}`}>
                <td className="region">{it.region ?? "–"}</td>
                <td className="name"><b>{pick(it.name) || it.id}</b>{lang === "ko" && it.name.en && <span className="en">{it.name.en}</span>}</td>
                <td>{alt(it.summary, it.summary_en)}</td>
                <td className="muted">{alt(it.variation, it.variation_en)}</td>
                <td className="helps-cell">
                  {it.helps.length
                    ? it.helps.map((h, i) => {
                      const mname = h.method ? methodName(h.method) : undefined;
                      return (
                        <div className="help" key={i}>
                          <div className="help-head">
                            <b>{pick(h.name)}</b>
                            {h.strength && <span className={`badge ${h.strength}`}>{strengthLabel(lang, h.strength)}</span>}
                          </div>
                          {alt(h.evidence, h.evidence_en) && <div className="small muted">{alt(h.evidence, h.evidence_en)}</div>}
                          {h.method && mname && (
                            <button type="button" className="chip accent help-method" onClick={() => onOpenMethod(h.method!)}>{t("기법", "Technique")} · {mname}</button>
                          )}
                          {h.links.length > 0 && (
                            <ul className="help-links">{h.links.map((l) => <LinkItem key={l.url} link={l} />)}</ul>
                          )}
                        </div>
                      );
                    })
                    : <span className="faint small">{t("확인된 시험 없음", "No confirmed trials")}</span>}
                </td>
                <td className="links">
                  <ul>{it.links.map((l) => <LinkItem key={l.url} link={l} />)}</ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function strengthHelp(s: string, lang: Lang): string {
  const KO: Record<string, string> = {
    strong: "여러 RCT 나 메타분석에서 중간 이상 효과가 반복 확인됨",
    moderate: "RCT 가 있으나 수가 적거나 효과가 작음",
    weak: "작은 효과이거나 단일 소규모 시험",
    none: "이 어려움을 직접 겨냥한 시험이 없음. 가장 가까운 근거만 적음",
  };
  const EN: Record<string, string> = {
    strong: "A medium or larger effect confirmed repeatedly across RCTs or meta-analyses",
    moderate: "RCTs exist but are few, or the effect is small",
    weak: "A small effect, or a single small trial",
    none: "No trial targets this directly; only the nearest evidence is listed",
  };
  return (lang === "en" ? EN : KO)[s] ?? s;
}
