import { useMemo, useState } from "react";
import type { Methods, Questions, StruggleGroup, StruggleHelp, StruggleItem, Struggles as StrugglesData } from "../types";
import { Card } from "./ui";
import { SOURCE_LABEL, STRENGTH_LABEL, labelOf, seriesVar } from "../lib/format";

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
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const total = data.groups.reduce((n, g) => n + g.items.length, 0);
  const methodName = (id: string) => methods?.methods.find((m) => m.id === id)?.name.ko;

  const groups = useMemo(() => {
    if (!term) return data.groups;
    return data.groups
      .map((g) => ({
        ...g,
        items: g.items.filter((it) => {
          const hay = [it.id, it.region, it.name.ko, it.name.en, it.summary, it.figure, it.variation,
            ...it.domains.map((d) => labelOf(d, questions?.domains)),
            ...it.states.map((s) => labelOf(s, questions?.states)),
            ...it.helps.flatMap((h) => [h.name.ko, h.name.en, h.process, h.evidence])]
            .filter(Boolean).join(" ").toLowerCase();
          return hay.includes(term);
        }),
      }))
      .filter((g) => g.items.length);
  }, [data, term, questions]);
  const shown = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <>
      <div className="methods-toolbar">
        <input className="search" type="search" placeholder="어려움 이름, 지역, 수치, 도움이 된 과정, 하루 지도 영역으로 찾기" value={q}
          onChange={(e) => setQ(e.target.value)} aria-label="어려움 검색" />
        <span className="faint small">{shown} / {total}</span>
      </div>

      {data.intro.ko && <p className="struggle-intro">{data.intro.ko}</p>}
      {data.helps_note && <p className="muted small struggle-note">{data.helps_note}</p>}
      <div className="struggle-meta">
        <span>대상은 전 세계 성인</span>
        {data.sources_reviewed && <><span className="sep">|</span><span>출처 <b className="num">{data.sources_reviewed}</b>건 검토</span></>}
        {data.updated && <><span className="sep">|</span><span className="num">{data.updated}</span></>}
        <span className="sep">|</span>
        <span>원본 <code className="num">questions/struggles.yaml</code></span>
      </div>

      {groups.map((g) => (
        <div className="stage-group" key={g.id}>
          <h2>
            {g.title.ko ?? g.id}
            {g.title.en && <span className="en faint small" style={{ fontWeight: 400 }}>{g.title.en}</span>}
            <span className="n">{g.items.length}</span>
          </h2>
          {g.note && !term && <p className="muted small struggle-note">{g.note}</p>}
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

      {!groups.length && <Card><div className="muted">검색 결과가 없어요.</div></Card>}

      {!term && data.patterns.length > 0 && (
        <div className="stage-group patterns">
          <h2>눈에 띄는 패턴</h2>
          <Card>
            <ol>{data.patterns.map((p, i) => <li key={i}>{p}</li>)}</ol>
          </Card>
        </div>
      )}

      <div className="disclaimer">
        <strong>이 목록은 진단표도 처방전도 아닙니다.</strong> "무엇이 흔한가"와 "연구에서 무엇이 도움이 됐나"를 알기 위한 지도일 뿐이며,
        여기 있는 이름이 내 상태에 붙는다고 해서 진단이 되는 것도, 여기 있는 과정이 나에게도 같은 효과를 낸다는 보장도 아닙니다.
        효과 크기는 집단 평균이고, 대기자 명단 대비 수치는 부풀려지기 쉽습니다. howami 는 의료 기기나 심리 치료 도구가 아닙니다.
        낮은 점수가 2주 이상 이어지거나 위기 신호가 느껴진다면 전문가나 거주 지역의 위기 상담 전화에 연결하세요.
        한국에서는 자살예방 상담전화 <b className="num">109</b> 로 24시간 연결됩니다.
      </div>
    </>
  );
}

function StruggleCard({ item, questions, methodName, onOpenMethod }: {
  item: StruggleItem; questions: Questions | null; methodName: (id: string) => string | undefined; onOpenMethod: (id: string) => void;
}) {
  return (
    <div className="card struggle-card" id={`struggle-${item.id}`}>
      <div className="method">
        <div>
          <h3>
            {item.name.ko ?? item.id}
            {item.name.en && <span className="en">{item.name.en}</span>}
          </h3>
          {item.summary && <p className="summary">{item.summary}</p>}
          {item.figure && (
            <div className="figure">
              <div className="k">얼마나 흔한가</div>
              <div>{item.figure}</div>
            </div>
          )}
          <dl className="kv">
            {item.variation && <><dt>지역 편차</dt><dd>{item.variation}</dd></>}
            {(item.domains.length > 0 || item.states.length > 0) && (
              <>
                <dt>하루 지도</dt>
                <dd>
                  <div className="chips">
                    {item.domains.map((d) => (
                      <span key={d} className="chip" title="이 어려움이 드러나기 쉬운 생활 영역">
                        <i className="dot" style={{ background: "var(--series-domain)" }} />{labelOf(d, questions?.domains)}
                      </span>
                    ))}
                    {item.states.map((s) => (
                      <span key={s} className="chip state" title="이 어려움이 먼저 흔드는 상태 축">
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
          <h4>더 읽기</h4>
          {item.links.length
            ? <ul>{item.links.map((l) => <LinkItem key={l.url} label={l.label} url={l.url} source={l.source} />)}</ul>
            : <div className="faint small">등록된 출처가 없어요.</div>}
        </div>
      </div>
    </div>
  );
}

/** "이런 과정을 거치면 나아졌다" 블록. 과정 → 효과 → 단서 → 출처 순서로, 근거 등급 배지를 단다. */
function Helps({ helps, methodName, onOpenMethod }: {
  helps: StruggleHelp[]; methodName: (id: string) => string | undefined; onOpenMethod: (id: string) => void;
}) {
  return (
    <div className="helps">
      <div className="k">이런 과정을 거치면 나아졌다</div>
      {helps.map((h, i) => {
        const mname = h.method ? methodName(h.method) : undefined;
        return (
          <div className="help" key={i}>
            <div className="help-head">
              <b>{h.name.ko ?? h.method ?? "—"}</b>
              {h.name.en && <span className="en">{h.name.en}</span>}
              {h.strength && <span className={`badge ${h.strength}`} title={strengthHelp(h.strength)}>{STRENGTH_LABEL[h.strength] ?? h.strength}</span>}
              {h.method && mname && (
                <button type="button" className="chip accent help-method" onClick={() => onOpenMethod(h.method!)} title="기법 탭에서 이 절차 보기">
                  기법 · {mname}
                </button>
              )}
            </div>
            {h.process && <div className="help-process">{h.process}</div>}
            {h.evidence && <div className="help-line"><span className="lbl">효과</span><span>{h.evidence}</span></div>}
            {h.caveat && <div className="help-line faint"><span className="lbl">단서</span><span>{h.caveat}</span></div>}
            {h.links.length > 0 && (
              <ul className="help-links">
                {h.links.map((l) => <LinkItem key={l.url} label={l.label} url={l.url} source={l.source} />)}
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
  return (
    <Card>
      <div className="struggle-table-wrap">
        <table className="struggle-table">
          <thead>
            <tr><th>지역</th><th>이름</th><th>어떤 것인가</th><th>근거</th><th>그곳에서 통한 것</th><th>더 읽기</th></tr>
          </thead>
          <tbody>
            {group.items.map((it) => (
              <tr key={it.id} id={`struggle-${it.id}`}>
                <td className="region">{it.region ?? "–"}</td>
                <td className="name"><b>{it.name.ko ?? it.id}</b>{it.name.en && <span className="en">{it.name.en}</span>}</td>
                <td>{it.summary}</td>
                <td className="muted">{it.variation}</td>
                <td className="helps-cell">
                  {it.helps.length
                    ? it.helps.map((h, i) => {
                      const mname = h.method ? methodName(h.method) : undefined;
                      return (
                        <div className="help" key={i}>
                          <div className="help-head">
                            <b>{h.name.ko}</b>
                            {h.strength && <span className={`badge ${h.strength}`}>{STRENGTH_LABEL[h.strength] ?? h.strength}</span>}
                          </div>
                          {h.evidence && <div className="small muted">{h.evidence}</div>}
                          {h.method && mname && (
                            <button type="button" className="chip accent help-method" onClick={() => onOpenMethod(h.method!)}>기법 · {mname}</button>
                          )}
                          {h.links.length > 0 && (
                            <ul className="help-links">{h.links.map((l) => <LinkItem key={l.url} label={l.label} url={l.url} source={l.source} />)}</ul>
                          )}
                        </div>
                      );
                    })
                    : <span className="faint small">확인된 시험 없음</span>}
                </td>
                <td className="links">
                  <ul>{it.links.map((l) => <LinkItem key={l.url} label={l.label} url={l.url} source={l.source} />)}</ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function LinkItem({ label, url, source }: { label: string; url: string; source?: string }) {
  const s = source ?? "other";
  return (
    <li>
      <span className={`src ${s}`}>{SOURCE_LABEL[s] ?? s}</span>
      <a href={url} target="_blank" rel="noopener noreferrer">{label}</a>
    </li>
  );
}

function strengthHelp(s: string): string {
  switch (s) {
    case "strong": return "여러 RCT 나 메타분석에서 중간 이상 효과가 반복 확인됨";
    case "moderate": return "RCT 가 있으나 수가 적거나 효과가 작음";
    case "weak": return "작은 효과이거나 단일 소규모 시험";
    case "none": return "이 어려움을 직접 겨냥한 시험이 없음. 가장 가까운 근거만 적음";
    default: return s;
  }
}
