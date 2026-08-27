import type { ReactNode } from "react";

/**
 * 기록 본문용 최소 마크다운 렌더러.
 * 다루는 것: `## 제목`, `### 소제목`, `- 목록`, 문단, `**굵게**`, `` `코드` ``.
 * 그 밖의 문법은 글자 그대로 보여준다. 라이브러리를 추가하지 않기 위한 선택이다.
 */
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];
  let k = 0;

  const flushList = () => {
    if (!list.length) return;
    out.push(<ul key={k++}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  const flushPara = () => {
    if (!para.length) return;
    out.push(<p key={k++}>{inline(para.join(" "))}</p>);
    para = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^##\s+/.test(line)) { flushList(); flushPara(); out.push(<h2 key={k++}>{line.replace(/^##\s+/, "")}</h2>); continue; }
    if (/^###\s+/.test(line)) { flushList(); flushPara(); out.push(<h3 key={k++}>{line.replace(/^###\s+/, "")}</h3>); continue; }
    if (/^\s*[-*]\s+/.test(line)) { flushPara(); list.push(line.replace(/^\s*[-*]\s+/, "")); continue; }
    if (!line.trim()) { flushList(); flushPara(); continue; }
    flushList();
    para.push(line.trim());
  }
  flushList();
  flushPara();
  return <div className="md">{out}</div>;
}

function inline(s: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push(s.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) parts.push(<strong key={i++}>{t.slice(2, -2)}</strong>);
    else parts.push(<code key={i++}>{t.slice(1, -1)}</code>);
    last = m.index + t.length;
  }
  if (last < s.length) parts.push(s.slice(last));
  return parts;
}
