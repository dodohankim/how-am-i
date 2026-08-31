import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { Context, Lang, Methods as MethodsData, Questions, Stats, Struggles as StrugglesData } from "./types";
import { ErrorBox } from "./components/ui";
import { Today } from "./components/Today";
import { Trends } from "./components/Trends";
import { Records } from "./components/Records";
import { Methods } from "./components/Methods";
import { Struggles } from "./components/Struggles";
import { Settings } from "./components/Settings";
import { fmtDate } from "./lib/format";
import { LangContext, initialLang, useI18n } from "./lib/i18n";

type Tab = "today" | "trends" | "records" | "methods" | "struggles" | "settings";
const TAB_IDS: Tab[] = ["today", "trends", "records", "methods", "struggles", "settings"];

function tabFromHash(): Tab {
  const h = location.hash.replace(/^#/, "").split("/")[0];
  return (TAB_IDS.some((t) => t === h) ? h : "today") as Tab;
}

type Theme = "system" | "light" | "dark";
function readTheme(): Theme {
  try {
    const t = localStorage.getItem("howami.theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch { return "system"; }
}

export default function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  useEffect(() => {
    try { localStorage.setItem("howami.lang", lang); } catch {}
    document.documentElement.lang = lang;
  }, [lang]);
  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <Shell />
    </LangContext.Provider>
  );
}

function Shell() {
  const { lang, setLang, t } = useI18n();
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

  const TABS: { id: Tab; label: string }[] = [
    { id: "today", label: t("오늘", "Today") },
    { id: "trends", label: t("흐름", "Trends") },
    { id: "records", label: t("기록", "Records") },
    { id: "methods", label: t("기법", "Techniques") },
    { id: "struggles", label: t("어려움", "Struggles") },
    { id: "settings", label: t("설정", "Settings") },
  ];

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
    api.questions(lang).then(setQuestions).catch((e) => setError(String(e.message ?? e)));
    api.methods().then(setMethods).catch((e) => setError(String(e.message ?? e)));
    api.struggles().then(setStruggles).catch((e) => setError(String(e.message ?? e)));
    api.context(3650, 5000).then(setAllDays).catch(() => {});
  }, [days, lang]);

  useEffect(() => { load(); }, [load]);

  // 창에 다시 돌아오면 새로 읽는다. 세션을 저장하고 브라우저로 넘어오는 흐름을 위해서다.
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const go = (tb: Tab) => { location.hash = tb; setTab(tb); };
  const openMethod = (id: string) => { setFocusMethod(id); go("methods"); };
  const loading = <div className="muted">{t("불러오는 중…", "Loading…")}</div>;

  return (
    <div className="app">
      <header className="topbar">
        <div className="wordmark">
          <h1>howami</h1>
        </div>
        <div className="topbar-right">
          {ctx && (
            <>
              <span>{fmtDate(ctx.today, lang)}</span>
              <span className="sep">|</span>
              <span>
                {lang === "en"
                  ? <><b className="num">{ctx.streak_days}</b>-day streak</>
                  : <>연속 <b className="num">{ctx.streak_days}</b>일</>}
              </span>
              <span className="sep">|</span>
              <span className="num" title={ctx.home}>
                {lang === "en"
                  ? `${ctx.total_days} days · ${ctx.total_entries} sessions`
                  : `${ctx.total_days}일 · ${ctx.total_entries}세션`}
              </span>
              <span className="sep">|</span>
            </>
          )}
          <button type="button" className="theme-btn" onClick={() => setLang(lang === "ko" ? "en" : "ko")}
            title={t("Switch to English", "한국어로 바꾸기")} aria-label={t("언어 바꾸기", "Switch language")}>
            {lang === "ko" ? "EN" : "한국어"}
          </button>
          <button type="button" className="theme-btn" onClick={() => setTheme(theme === "system" ? "dark" : theme === "dark" ? "light" : "system")}
            title={t("테마 바꾸기", "Switch theme")}>
            {theme === "system" ? t("테마: 시스템", "Theme: system") : theme === "dark" ? t("테마: 어둡게", "Theme: dark") : t("테마: 밝게", "Theme: light")}
          </button>
        </div>
      </header>

      <nav className="tabs" role="tablist" aria-label={t("화면", "Views")}>
        {TABS.map((tb) => (
          <button key={tb.id} role="tab" type="button" className="tab" aria-selected={tab === tb.id} onClick={() => go(tb.id)}>
            {tb.label}
          </button>
        ))}
      </nav>

      {error && <ErrorBox error={error} />}

      {tab === "today" && (ctx
        ? <Today ctx={ctx} questions={questions} methods={methods} onOpenMethod={openMethod} />
        : !error && loading)}

      {tab === "trends" && (stats
        ? <Trends stats={stats} days={days} onDays={setDays} questions={questions} methods={methods} onOpenMethod={openMethod} />
        : !error && loading)}

      {tab === "records" && ((allDays ?? ctx)
        ? <Records days={(allDays ?? ctx)!.days} questions={questions} methods={methods} onOpenMethod={openMethod} />
        : !error && loading)}

      {tab === "methods" && (methods
        ? <Methods data={methods} stats={stats} focusId={focusMethod} />
        : !error && loading)}

      {tab === "struggles" && (struggles
        ? <Struggles data={struggles} questions={questions} methods={methods} onOpenMethod={openMethod} />
        : !error && loading)}

      {tab === "settings" && <Settings />}

      <footer className="faint tiny" style={{ marginTop: 40, borderTop: "1px solid var(--rule)", paddingTop: 12 }}>
        {lang === "en"
          ? <>This screen only reads <code className="num">{ctx?.home ?? "~/howami"}</code> on this machine. Nothing is sent out.
            {" "}Records are made in Claude Code with <code className="num">/howami</code>.</>
          : <>이 화면은 내 PC 의 <code className="num">{ctx?.home ?? "~/howami"}</code> 만 읽습니다. 바깥으로 보내는 것은 없습니다.
            {" "}기록은 Claude Code 에서 <code className="num">/howami</code> 로 남깁니다.</>}
      </footer>
    </div>
  );
}
