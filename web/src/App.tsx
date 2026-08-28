import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { Context, Methods as MethodsData, Questions, Stats, Struggles as StrugglesData } from "./types";
import { ErrorBox } from "./components/ui";
import { Today } from "./components/Today";
import { Trends } from "./components/Trends";
import { Records } from "./components/Records";
import { Methods } from "./components/Methods";
import { Struggles } from "./components/Struggles";
import { Settings } from "./components/Settings";
import { fmtDate } from "./lib/format";

type Tab = "today" | "trends" | "records" | "methods" | "struggles" | "settings";
const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "오늘" },
  { id: "trends", label: "흐름" },
  { id: "records", label: "기록" },
  { id: "methods", label: "기법" },
  { id: "struggles", label: "어려움" },
  { id: "settings", label: "설정" },
];

function tabFromHash(): Tab {
  const h = location.hash.replace(/^#/, "").split("/")[0];
  return (TABS.some((t) => t.id === h) ? h : "today") as Tab;
}

type Theme = "system" | "light" | "dark";
function readTheme(): Theme {
  try {
    const t = localStorage.getItem("howami.theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch { return "system"; }
}

export default function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [days, setDays] = useState<number>(() => {
    try { return Number(localStorage.getItem("howami.days") ?? 30) || 30; } catch { return 30; }
  });
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [ctx, setCtx] = useState<Context | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [allDays, setAllDays] = useState<Context | null>(null);
  const [questions, setQuestions] = useState<Questions | null>(null);
  const [methods, setMethods] = useState<MethodsData | null>(null);
  const [struggles, setStruggles] = useState<StrugglesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusMethod, setFocusMethod] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", theme);
    try { theme === "system" ? localStorage.removeItem("howami.theme") : localStorage.setItem("howami.theme", theme); } catch {}
  }, [theme]);

  useEffect(() => {
    try { localStorage.setItem("howami.days", String(days)); } catch {}
  }, [days]);

  // 질문 세트와 기법 카탈로그도 매번 같이 읽는다. 로컬 파일이라 비용이 거의 없고,
  // 서버가 늦게 떠서 첫 요청이 실패했을 때 창을 다시 열면 자연히 복구되게 하기 위해서다.
  const load = useCallback(() => {
    setError(null);
    api.context(14).then(setCtx).catch((e) => setError(String(e.message ?? e)));
    api.stats(days).then(setStats).catch((e) => setError(String(e.message ?? e)));
    api.questions().then(setQuestions).catch((e) => setError(String(e.message ?? e)));
    api.methods().then(setMethods).catch((e) => setError(String(e.message ?? e)));
    api.struggles().then(setStruggles).catch((e) => setError(String(e.message ?? e)));
    api.context(3650, 5000).then(setAllDays).catch(() => {});
  }, [days]);

  useEffect(() => { load(); }, [load]);

  // 창에 다시 돌아오면 새로 읽는다. 세션을 저장하고 브라우저로 넘어오는 흐름을 위해서다.
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const go = (t: Tab) => { location.hash = t; setTab(t); };
  const openMethod = (id: string) => { setFocusMethod(id); go("methods"); };

  return (
    <div className="app">
      <header className="topbar">
        <div className="wordmark">
          <h1>howami</h1>
        </div>
        <div className="topbar-right">
          {ctx && (
            <>
              <span>{fmtDate(ctx.today)}</span>
              <span className="sep">|</span>
              <span>연속 <b className="num">{ctx.streak_days}</b>일</span>
              <span className="sep">|</span>
              <span className="num" title={ctx.home}>{ctx.total_days}일 · {ctx.total_entries}세션</span>
              <span className="sep">|</span>
            </>
          )}
          <button type="button" className="theme-btn" onClick={() => setTheme(theme === "system" ? "dark" : theme === "dark" ? "light" : "system")}
            title="테마 바꾸기">
            {theme === "system" ? "테마: 시스템" : theme === "dark" ? "테마: 어둡게" : "테마: 밝게"}
          </button>
        </div>
      </header>

      <nav className="tabs" role="tablist" aria-label="화면">
        {TABS.map((t) => (
          <button key={t.id} role="tab" type="button" className="tab" aria-selected={tab === t.id} onClick={() => go(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {error && <ErrorBox error={error} />}

      {tab === "today" && (ctx
        ? <Today ctx={ctx} questions={questions} methods={methods} onOpenMethod={openMethod} />
        : !error && <div className="muted">불러오는 중…</div>)}

      {tab === "trends" && (stats
        ? <Trends stats={stats} days={days} onDays={setDays} questions={questions} methods={methods} onOpenMethod={openMethod} />
        : !error && <div className="muted">불러오는 중…</div>)}

      {tab === "records" && ((allDays ?? ctx)
        ? <Records days={(allDays ?? ctx)!.days} questions={questions} methods={methods} onOpenMethod={openMethod} />
        : !error && <div className="muted">불러오는 중…</div>)}

      {tab === "methods" && (methods
        ? <Methods data={methods} stats={stats} focusId={focusMethod} />
        : !error && <div className="muted">불러오는 중…</div>)}

      {tab === "struggles" && (struggles
        ? <Struggles data={struggles} questions={questions} />
        : !error && <div className="muted">불러오는 중…</div>)}

      {tab === "settings" && <Settings />}

      <footer className="faint tiny" style={{ marginTop: 40, borderTop: "1px solid var(--rule)", paddingTop: 12 }}>
        이 화면은 내 PC 의 <code className="num">{ctx?.home ?? "~/howami"}</code> 만 읽습니다. 바깥으로 보내는 것은 없습니다.
        {" "}기록은 Claude Code 에서 <code className="num">/howami</code> 로 남깁니다.
      </footer>
    </div>
  );
}
