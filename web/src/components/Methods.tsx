import { useEffect, useMemo, useState } from "react";
import type { Method, MethodLink, Methods as MethodsData, Stats } from "../types";
import { Card } from "./ui";
import { STAGE_ORDER, evidenceLabel, fmtDate, sourceLabel, stageLabel } from "../lib/format";
import { useI18n } from "../lib/i18n";

export function Methods({ data, stats, focusId }: { data: MethodsData; stats: Stats | null; focusId: string | null }) {
  const { lang, t } = useI18n();
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
      const hay = [m.id, m.name.ko, m.name.en, m.summary.ko, m.summary.en, m.effect.ko, m.effect.en,
        m.origin, m.origin_en, m.use_when, m.use_when_en].filter(Boolean).join(" ").toLowerCase();
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
        <input className="search" type="search" placeholder={t("기법 이름, 출처, 효과로 찾기", "Search by name, origin, or effect")}
          value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("기법 검색", "Search techniques")} />
        <label className="small muted" style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={onlyUsed} onChange={(e) => setOnlyUsed(e.target.checked)} />
          {t("내 기록에 쓰인 것만", "Only ones in my records")}
        </label>
        <span className="faint small">{filtered.length} / {data.methods.length}</span>
      </div>

      <p className="muted small" style={{ margin: "0 0 4px" }}>
        {lang === "en"
          ? <>Conversations walk these techniques in order. What was actually used goes into each record's <code className="num">methods</code>;
            this page collects where each one comes from, what to expect from it, and where to read more.</>
          : <>진단 대화는 이 기법들을 순서대로 밟는다. 각 기록의 <code className="num">methods</code> 에 그날 실제로 쓴 것이 남고,
            여기서는 그 기법이 어디서 왔고 무엇을 기대할 수 있는지, 더 읽을 곳은 어디인지 정리했다.</>}
      </p>

      {groups.map((g) => (
        <div className="stage-group" key={g.stage}>
          <h2>{stageLabel(lang, g.stage)} <span className="n">{g.items.length}</span></h2>
          <div className="grid" style={{ gap: 12 }}>
            {g.items.map((m) => <MethodCard key={m.id} m={m} use={usage.get(m.id)} />)}
          </div>
        </div>
      ))}

      {!groups.length && <Card><div className="muted">{t("검색 결과가 없어요.", "No results.")}</div></Card>}

      <div className="disclaimer">
        {lang === "en"
          ? <><strong>how-am-i is not a medical device or a psychotherapy tool.</strong> These techniques borrow their names from clinical
            procedures and research, rewritten into everyday language; they don't replace treatment. If low scores persist for two
            weeks or more, or anything feels like a crisis, see a professional — a local crisis line is at{" "}
            <a href="https://findahelpline.com" target="_blank" rel="noopener noreferrer">findahelpline.com</a>; in South Korea,
            dial <b className="num">109</b> (24/7).</>
          : <><strong>how-am-i 는 의료 기기나 심리 치료 도구가 아닙니다.</strong> 위의 기법들은 임상 절차와 연구에서 이름을 빌려
            일상 언어로 옮긴 것이며, 치료를 대신하지 않습니다. 낮은 점수가 2주 이상 이어지거나 위기 신호가 느껴진다면
            전문가와 상담하세요. 한국에서는 자살예방 상담전화 <b className="num">109</b> 로 24시간 연결됩니다.</>}
        {data.general_links.length > 0 && (
          <div className="links" style={{ marginTop: 12 }}>
            <h4>{t("공통 출처", "Shared sources")}</h4>
            <ul>{data.general_links.map((l) => <LinkItem key={l.url} link={l} />)}</ul>
          </div>
        )}
      </div>
    </>
  );
}

function MethodCard({ m, use }: { m: Method; use?: { n: number; last_used: string } }) {
  const { lang, t, pick, alt } = useI18n();
  const ev = m.evidence ?? "";
  const origin = alt(m.origin, m.origin_en);
  const useWhen = alt(m.use_when, m.use_when_en);
  return (
    <div className="card" id={`method-${m.id}`} style={{ scrollMarginTop: 16 }}>
      <div className="method">
        <div>
          <h3>
            {pick(m.name) || m.id}
            {lang === "ko" && m.name.en && <span className="en">{m.name.en}</span>}
            {ev && <span className={`badge ${ev}`} title={evidenceHelp(ev, lang)}>{evidenceLabel(lang, ev)}</span>}
            {use && (
              <span className="usage">
                {lang === "en" ? <>· {use.n}x · last {fmtDate(use.last_used, lang)}</> : <>· {use.n}회 · 마지막 {fmtDate(use.last_used, lang)}</>}
              </span>
            )}
          </h3>
          {pick(m.summary) && <p className="summary">{pick(m.summary)}</p>}
          {pick(m.effect) && (
            <div className="effect">
              <div className="k">{t("이 기법을 쓰면", "What to expect")}</div>
              <div>{pick(m.effect)}</div>
            </div>
          )}
          <dl className="kv">
            {origin && <><dt>{t("어디서", "From")}</dt><dd>{origin}</dd></>}
            {useWhen && <><dt>{t("언제", "When")}</dt><dd>{useWhen}</dd></>}
            {pick(m.say_it_as) && <><dt>{t("기록엔", "On record")}</dt><dd className="faint">"{pick(m.say_it_as)}"</dd></>}
          </dl>
        </div>
        <div className="links">
          <h4>{t("더 읽기", "Read more")}</h4>
          {m.links.length ? (
            <ul>{m.links.map((l) => <LinkItem key={l.url} link={l} />)}</ul>
          ) : (
            <div className="faint small">
              {lang === "en"
                ? <>No sources yet. Add them in <code className="num">questions/references.yaml</code>.</>
                : <>등록된 출처가 없어요. <code className="num">questions/references.yaml</code> 에 추가할 수 있어요.</>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function LinkItem({ link }: { link: MethodLink }) {
  const { lang, alt } = useI18n();
  const s = link.source ?? "other";
  return (
    <li>
      <span className={`src ${s}`}>{sourceLabel(lang, s)}</span>
      <a href={link.url} target="_blank" rel="noopener noreferrer">{alt(link.label, link.label_en)}</a>
    </li>
  );
}

function evidenceHelp(ev: string, lang: "ko" | "en"): string {
  const KO: Record<string, string> = {
    clinical: "임상 연구에서 반복 검증된 개입 절차를 일상 언어로 옮긴 것",
    applied: "심리학 밖(경영·철학)에서 왔지만 널리 검증된 절차",
    local: "how-am-i 가 쌓은 개인 기록에서만 성립하는 관찰",
  };
  const EN: Record<string, string> = {
    clinical: "An intervention repeatedly validated in clinical research, rewritten into everyday language",
    applied: "From outside psychology (management, philosophy) but widely validated",
    local: "An observation that only holds within your own how-am-i records",
  };
  return (lang === "en" ? EN : KO)[ev] ?? ev;
}
