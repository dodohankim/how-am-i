import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api";
import type { OpenTarget, Settings as SettingsData } from "../types";
import { Card, ErrorBox } from "./ui";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function Settings() {
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
      setNotice({ ok: true, text: `열었습니다: ${r.opened}` });
    } catch (e: any) {
      setNotice({ ok: false, text: String(e.message ?? e) });
    }
  };

  if (error) return <ErrorBox error={error} />;
  if (!data) return <div className="muted">불러오는 중…</div>;

  const canOpen = data.can_open;

  return (
    <>
      <p className="muted small" style={{ margin: "0 0 16px" }}>
        기록은 전부 아래 폴더 안에만 있다. 원본은 세션마다 한 개씩 저장되는 md 파일이고, SQLite DB 는 그 md 파일들을
        읽어 만든 색인이라 지워져도 다시 만들 수 있다.
      </p>

      {notice && (
        <div className={`notice${notice.ok ? "" : " bad"}`} role="status">{notice.text}</div>
      )}

      <div className="grid" style={{ gap: 12 }}>
        <PathCard
          title="데이터 루트"
          path={data.home}
          detail={data.home_env
            ? <>환경변수 <code className="num">HOWAMI_HOME</code> 이 가리키는 위치다.</>
            : <>환경변수 <code className="num">HOWAMI_HOME</code> 이 없어 기본값 <code className="num">~/howami</code> 를 쓴다.</>}
          canOpen={canOpen}
          onOpen={() => open("home")}
        />
        <PathCard
          title="원본 md 파일"
          path={data.data.path}
          detail={data.data.exists
            ? <>md 파일 <b className="num">{data.data.files}</b>개 · {fmtBytes(data.data.bytes)}. 파일 이름은 <code className="num">YYYY-MM-DD--HHMM.md</code> 형식이다.</>
            : <>아직 폴더가 없다. 첫 기록을 남기면 생긴다.</>}
          canOpen={canOpen && data.data.exists}
          onOpen={() => open("data")}
        />
        <PathCard
          title="SQLite DB"
          path={data.db.path}
          detail={data.db.exists
            ? <>{fmtBytes(data.db.bytes)} · 세션 <b className="num">{data.db_entries ?? 0}</b>개 · <b className="num">{data.db_days ?? 0}</b>일 · 스키마 v{data.schema_version}.
              {" "}지우면 <code className="num">howami.py reindex</code> 로 md 에서 다시 만든다.</>
            : <>아직 DB 파일이 없다. 첫 기록을 저장하면 생긴다.</>}
          canOpen={canOpen && data.db.exists}
          openLabel="파일 위치 열기"
          onOpen={() => open("db")}
        />
        <PathCard
          title="주간 인사이트"
          path={data.insights.path}
          detail={data.insights.exists
            ? <>md 파일 <b className="num">{data.insights.files}</b>개 · {fmtBytes(data.insights.bytes)}</>
            : <>아직 폴더가 없다.</>}
          canOpen={canOpen && data.insights.exists}
          onOpen={() => open("insights")}
        />
      </div>

      <Card title="이 서버" hint="읽기 전용 · 127.0.0.1 에만 열려 있음" className="settings-server">
        <dl className="kv wide">
          <dt>주소</dt><dd><code className="num">{data.server.url}</code></dd>
          <dt>Python</dt><dd><code className="num">{data.server.python}</code> · {data.server.platform}</dd>
          <dt>프로젝트</dt><dd><code className="num">{data.project_root}</code></dd>
          <dt>질문 세트</dt><dd><code className="num">{data.questions_dir}</code></dd>
        </dl>
        {!canOpen && (
          <p className="faint small" style={{ margin: "10px 0 0" }}>
            이 환경에서는 폴더 열기 버튼을 쓸 수 없다. 경로를 복사해 직접 열어라.
          </p>
        )}
      </Card>

      <div className="disclaimer">
        <strong>바꾸고 싶다면</strong> 데이터 위치는 서버를 띄우기 전에 <code className="num">HOWAMI_HOME=/원하는/경로 python3 scripts/serve.py</code> 처럼
        환경변수로 정한다. 포트는 <code className="num">--port 9000</code> 또는 <code className="num">HOWAMI_WEB_PORT</code>. 이 화면에서는 아무것도 고치지 않는다.
      </div>
    </>
  );
}

function PathCard({ title, path, detail, canOpen, openLabel, onOpen }: {
  title: string; path: string; detail: ReactNode; canOpen: boolean; openLabel?: string; onOpen: () => void;
}) {
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
          <button type="button" className="raw-toggle" onClick={copy}>{copied ? "복사됨" : "복사"}</button>
          <button type="button" className="raw-toggle primary" onClick={onOpen} disabled={!canOpen}>
            {openLabel ?? "폴더 열기"}
          </button>
        </div>
      </div>
      <p className="muted small" style={{ margin: "8px 0 0" }}>{detail}</p>
    </Card>
  );
}
