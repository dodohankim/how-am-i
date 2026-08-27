import { useEffect, useMemo, useState } from "react";
import type { Method, Methods as MethodsData, Stats } from "../types";
import { Card } from "./ui";
import { EVIDENCE_LABEL, SOURCE_LABEL, STAGE_LABEL, STAGE_ORDER, fmtDate } from "../lib/format";

export function Methods({ data, stats, focusId }: { data: MethodsData; stats: Stats | null; focusId: string | null }) {
  const [q, setQ] = useState("");
  const [onlyUsed, setOnlyUsed] = useState(false);
  const usage = useMemo(() => new Map((stats?.methods ?? []).map((m) => [m.method, m])), [stats]);

  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(`method-${focusId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.animate?.([{ boxShadow: "0 0 0 3px var(--accent)" }, { boxShadow: "var(--shadow)" }], { duration: 1600 });
    }
  }, [focusId]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.methods.filter((m) => {
      if (onlyUsed && !usage.has(m.id)) return false;
      if (!term) return true;
      const hay = [m.id, m.name.ko, m.name.en, m.summary.ko, m.effect.ko, m.origin, m.use_when].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(term);
    });
  }, [data, q, onlyUsed, usage]);

  const groups = STAGE_ORDER
    .map((stage) => ({ stage, items: filtered.filter((m) => (m.stage ?? "other") === stage) }))
    .filter((g) => g.items.length);
  const rest = filtered.filter((m) => !STAGE_ORDER.includes(m.stage ?? "other"));
  if (rest.length) groups.push({ stage: "other", items: rest });

  return (
    <>
      <div className="methods-toolbar">
        <input className="search" type="search" placeholder="기법 이름, 출처, 효과로 찾기" value={q} onChange={(e) => setQ(e.target.value)} aria-label="기법 검색" />
        <label className="small muted" style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={onlyUsed} onChange={(e) => setOnlyUsed(e.target.checked)} />
          내 기록에 쓰인 것만
        </label>
        <span className="faint small">{filtered.length} / {data.methods.length}</span>
      </div>

      <p className="muted small" style={{ margin: "0 0 4px" }}>
        진단 대화는 이 기법들을 순서대로 밟는다. 각 기록의 <code className="num">methods</code> 에 그날 실제로 쓴 것이 남고,
        여기서는 그 기법이 어디서 왔고 무엇을 기대할 수 있는지, 더 읽을 곳은 어디인지 정리했다.
      </p>

      {groups.map((g) => (
        <div className="stage-group" key={g.stage}>
          <h2>{STAGE_LABEL[g.stage] ?? g.stage} <span className="n">{g.items.length}</span></h2>
          <div className="grid" style={{ gap: 12 }}>
            {g.items.map((m) => <MethodCard key={m.id} m={m} use={usage.get(m.id)} />)}
          </div>
        </div>
      ))}

      {!groups.length && <Card><div className="muted">검색 결과가 없어요.</div></Card>}

      <div className="disclaimer">
        <strong>howami 는 의료 기기나 심리 치료 도구가 아닙니다.</strong> 위의 기법들은 임상 절차와 연구에서 이름을 빌려
        일상 언어로 옮긴 것이며, 치료를 대신하지 않습니다. 낮은 점수가 2주 이상 이어지거나 위기 신호가 느껴진다면
        전문가와 상담하세요. 한국에서는 자살예방 상담전화 <b className="num">109</b> 로 24시간 연결됩니다.
        {data.general_links.length > 0 && (
          <div className="links" style={{ marginTop: 12 }}>
            <h4>공통 출처</h4>
            <ul>{data.general_links.map((l) => <LinkItem key={l.url} label={l.label} url={l.url} source={l.source} />)}</ul>
          </div>
        )}
      </div>
    </>
  );
}

function MethodCard({ m, use }: { m: Method; use?: { n: number; last_used: string } }) {
  const ev = m.evidence ?? "";
  return (
    <div className="card" id={`method-${m.id}`} style={{ scrollMarginTop: 16 }}>
      <div className="method">
        <div>
          <h3>
            {m.name.ko ?? m.id}
            {m.name.en && <span className="en">{m.name.en}</span>}
            {ev && <span className={`badge ${ev}`} title={evidenceHelp(ev)}>{EVIDENCE_LABEL[ev] ?? ev}</span>}
            {use && <span className="usage">· {use.n}회 · 마지막 {fmtDate(use.last_used)}</span>}
          </h3>
          {m.summary.ko && <p className="summary">{m.summary.ko}</p>}
          {m.effect.ko && (
            <div className="effect">
              <div className="k">이 기법을 쓰면</div>
              <div>{m.effect.ko}</div>
            </div>
          )}
          <dl className="kv">
            {m.origin && <><dt>어디서</dt><dd>{m.origin}</dd></>}
            {m.use_when && <><dt>언제</dt><dd>{m.use_when}</dd></>}
            {m.say_it_as?.ko && <><dt>기록엔</dt><dd className="faint">"{m.say_it_as.ko}"</dd></>}
          </dl>
        </div>
        <div className="links">
          <h4>더 읽기</h4>
          {m.links.length ? (
            <ul>{m.links.map((l) => <LinkItem key={l.url} label={l.label} url={l.url} source={l.source} />)}</ul>
          ) : <div className="faint small">등록된 출처가 없어요. <code className="num">questions/references.yaml</code> 에 추가할 수 있어요.</div>}
        </div>
      </div>
    </div>
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

function evidenceHelp(ev: string): string {
  switch (ev) {
    case "clinical": return "임상 연구에서 반복 검증된 개입 절차를 일상 언어로 옮긴 것";
    case "applied": return "심리학 밖(경영·철학)에서 왔지만 널리 검증된 절차";
    case "local": return "howami 가 쌓은 개인 기록에서만 성립하는 관찰";
    default: return ev;
  }
}
