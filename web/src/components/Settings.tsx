import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api";
import type { OpenTarget, Settings as SettingsData } from "../types";
import { Card, ErrorBox } from "./ui";
import { useI18n } from "../lib/i18n";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function Settings() {
  const { lang, t } = useI18n();
  const [data, setData] = useState<SettingsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api.settings().then(setData).catch((e) => setError(String(e.message ?? e)));
  }, []);

  const open = async (target: OpenTarget) => {
    setNotice(null);
    try {
      const r = await api.open(target);
      setNotice({ ok: true, text: t(`열었습니다: ${r.opened}`, `Opened: ${r.opened}`) });
    } catch (e: any) {
      setNotice({ ok: false, text: String(e.message ?? e) });
    }
  };

  if (error) return <ErrorBox error={error} />;
  if (!data) return <div className="muted">{t("불러오는 중…", "Loading…")}</div>;

  const canOpen = data.can_open;

  return (
    <>
      <p className="muted small" style={{ margin: "0 0 16px" }}>
        {t("기록은 전부 아래 폴더 안에만 있다. 원본은 세션마다 한 개씩 저장되는 md 파일이고, SQLite DB 는 그 md 파일들을 읽어 만든 색인이라 지워져도 다시 만들 수 있다.",
          "Every record lives only in the folders below. The source of truth is one md file per session; the SQLite DB is an index built from those files and can be rebuilt if deleted.")}
      </p>

      {notice && (
        <div className={`notice${notice.ok ? "" : " bad"}`} role="status">{notice.text}</div>
      )}

      <div className="grid" style={{ gap: 12 }}>
        <PathCard
          title={t("데이터 루트", "Data root")}
          path={data.home}
          detail={data.home_env
            ? (lang === "en"
              ? <>Where the <code className="num">HOWAMI_HOME</code> environment variable points.</>
              : <>환경변수 <code className="num">HOWAMI_HOME</code> 이 가리키는 위치다.</>)
            : (lang === "en"
              ? <>No <code className="num">HOWAMI_HOME</code> set, so the default <code className="num">~/howami</code> is used.</>
              : <>환경변수 <code className="num">HOWAMI_HOME</code> 이 없어 기본값 <code className="num">~/howami</code> 를 쓴다.</>)}
          canOpen={canOpen}
          onOpen={() => open("home")}
        />
        <PathCard
          title={t("원본 md 파일", "Source md files")}
          path={data.data.path}
          detail={data.data.exists
            ? (lang === "en"
              ? <><b className="num">{data.data.files}</b> md files · {fmtBytes(data.data.bytes)}. Filenames follow <code className="num">YYYY-MM-DD--HHMM.md</code>.</>
              : <>md 파일 <b className="num">{data.data.files}</b>개 · {fmtBytes(data.data.bytes)}. 파일 이름은 <code className="num">YYYY-MM-DD--HHMM.md</code> 형식이다.</>)
            : t("아직 폴더가 없다. 첫 기록을 남기면 생긴다.", "No folder yet. It appears with the first record.")}
          canOpen={canOpen && data.data.exists}
          onOpen={() => open("data")}
        />
        <PathCard
          title="SQLite DB"
          path={data.db.path}
          detail={data.db.exists
            ? (lang === "en"
              ? <>{fmtBytes(data.db.bytes)} · <b className="num">{data.db_entries ?? 0}</b> sessions · <b className="num">{data.db_days ?? 0}</b> days · schema v{data.schema_version}.
                {" "}If deleted, <code className="num">howami.py reindex</code> rebuilds it from md.</>
              : <>{fmtBytes(data.db.bytes)} · 세션 <b className="num">{data.db_entries ?? 0}</b>개 · <b className="num">{data.db_days ?? 0}</b>일 · 스키마 v{data.schema_version}.
                {" "}지우면 <code className="num">howami.py reindex</code> 로 md 에서 다시 만든다.</>)
            : t("아직 DB 파일이 없다. 첫 기록을 저장하면 생긴다.", "No DB file yet. It appears when the first record is saved.")}
          canOpen={canOpen && data.db.exists}
          openLabel={t("파일 위치 열기", "Open file location")}
          onOpen={() => open("db")}
        />
        <PathCard
          title={t("주간 인사이트", "Weekly insights")}
          path={data.insights.path}
          detail={data.insights.exists
            ? (lang === "en"
              ? <><b className="num">{data.insights.files}</b> md files · {fmtBytes(data.insights.bytes)}</>
              : <>md 파일 <b className="num">{data.insights.files}</b>개 · {fmtBytes(data.insights.bytes)}</>)
            : t("아직 폴더가 없다.", "No folder yet.")}
          canOpen={canOpen && data.insights.exists}
          onOpen={() => open("insights")}
        />
      </div>

      <Card title={t("이 서버", "This server")} hint={t("읽기 전용 · 127.0.0.1 에만 열려 있음", "Read-only · bound to 127.0.0.1 only")} className="settings-server">
        <dl className="kv wide">
          <dt>{t("주소", "Address")}</dt><dd><code className="num">{data.server.url}</code></dd>
          <dt>Python</dt><dd><code className="num">{data.server.python}</code> · {data.server.platform}</dd>
          <dt>{t("프로젝트", "Project")}</dt><dd><code className="num">{data.project_root}</code></dd>
          <dt>{t("질문 세트", "Question sets")}</dt><dd><code className="num">{data.questions_dir}</code></dd>
        </dl>
        {!canOpen && (
          <p className="faint small" style={{ margin: "10px 0 0" }}>
            {t("이 환경에서는 폴더 열기 버튼을 쓸 수 없다. 경로를 복사해 직접 열어라.",
              "The open-folder buttons don't work in this environment. Copy the path and open it yourself.")}
          </p>
        )}
      </Card>

      <div className="disclaimer">
        {lang === "en"
          ? <><strong>To change things:</strong> set the data location before starting the server, e.g.{" "}
            <code className="num">HOWAMI_HOME=/your/path python3 scripts/serve.py</code>. The port is{" "}
            <code className="num">--port 9000</code> or <code className="num">HOWAMI_WEB_PORT</code>. This screen modifies nothing.</>
          : <><strong>바꾸고 싶다면</strong> 데이터 위치는 서버를 띄우기 전에 <code className="num">HOWAMI_HOME=/원하는/경로 python3 scripts/serve.py</code> 처럼
            환경변수로 정한다. 포트는 <code className="num">--port 9000</code> 또는 <code className="num">HOWAMI_WEB_PORT</code>. 이 화면에서는 아무것도 고치지 않는다.</>}
      </div>
    </>
  );
}

function PathCard({ title, path, detail, canOpen, openLabel, onOpen }: {
  title: string; path: string; detail: ReactNode; canOpen: boolean; openLabel?: string; onOpen: () => void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* 클립보드 권한이 없으면 조용히 넘어간다 */ }
  };
  return (
    <Card title={title}>
      <div className="path-row">
        <code className="path num" title={path}>{path}</code>
        <div className="path-actions">
          <button type="button" className="raw-toggle" onClick={copy}>{copied ? t("복사됨", "Copied") : t("복사", "Copy")}</button>
          <button type="button" className="raw-toggle primary" onClick={onOpen} disabled={!canOpen}>
            {openLabel ?? t("폴더 열기", "Open folder")}
          </button>
        </div>
      </div>
      <p className="muted small" style={{ margin: "8px 0 0" }}>{detail}</p>
    </Card>
  );
}
