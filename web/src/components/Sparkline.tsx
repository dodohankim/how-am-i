import { useMemo, useRef, useState } from "react";
import type { SeriesPoint } from "../types";
import { addDays, daysBetween, fmtDate, fmtNum, fmtShort } from "../lib/format";

/**
 * 작은 다중 차트 한 칸. x 축은 달력 날짜라서 기록이 없는 날은 빈 자리로 남는다.
 * 1~5 고정 y 축, 2px 선, 점 표시, 호버 시 십자선과 툴팁.
 */
export function Sparkline({ name, color, series, from, to, mean }: {
  name: string;
  color: string;
  series: SeriesPoint[];
  from: string;
  to: string;
  mean: number | null;
}) {
  const W = 320, H = 96, PL = 18, PR = 8, PT = 8, PB = 18;
  const span = Math.max(1, daysBetween(from, to));
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const pts = useMemo(() => {
    const byDate = new Map(series.map((p) => [p.date, p.v]));
    const out: { x: number; y: number; date: string; v: number; i: number }[] = [];
    for (let i = 0; i <= span; i++) {
      const date = addDays(from, i);
      const v = byDate.get(date);
      if (v === undefined) continue;
      out.push({ i, date, v, x: PL + (i / span) * (W - PL - PR), y: PT + ((5 - v) / 4) * (H - PT - PB) });
    }
    return out;
  }, [series, from, span]);

  // 연속된 날짜끼리만 선으로 잇는다. 하루라도 비면 끊는다.
  const paths = useMemo(() => {
    const segs: string[] = [];
    let cur: string[] = [];
    let prevI = -2;
    for (const p of pts) {
      if (p.i !== prevI + 1 && cur.length) { segs.push(cur.join(" ")); cur = []; }
      cur.push(`${cur.length ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
      prevI = p.i;
    }
    if (cur.length) segs.push(cur.join(" "));
    return segs;
  }, [pts]);

  const latest = pts.length ? pts[pts.length - 1] : null;
  const hp = hover !== null ? pts[hover] : null;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!pts.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0, bd = Infinity;
    pts.forEach((p, i) => { const d = Math.abs(p.x - x); if (d < bd) { bd = d; best = i; } });
    setHover(best);
  }

  return (
    <div className="spark" ref={ref}>
      <div className="spark-head">
        <span className="name"><i style={{ background: color }} />{name}</span>
        <span className="stat">
          최근 <b>{latest ? fmtNum(latest.v) : "–"}</b> · 평균 {fmtNum(mean)}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${name} 추이`}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {[1, 3, 5].map((g) => {
          const y = PT + ((5 - g) / 4) * (H - PT - PB);
          return (
            <g key={g}>
              <line x1={PL} x2={W - PR} y1={y} y2={y} stroke="var(--rule-2)" strokeWidth={1} />
              <text x={PL - 5} y={y + 3.5} fontSize={9} textAnchor="end" fill="var(--ink-3)" fontFamily="var(--font-num)">{g}</text>
            </g>
          );
        })}
        <text x={PL} y={H - 4} fontSize={9} fill="var(--ink-3)" fontFamily="var(--font-num)">{fmtShort(from)}</text>
        <text x={W - PR} y={H - 4} fontSize={9} textAnchor="end" fill="var(--ink-3)" fontFamily="var(--font-num)">{fmtShort(to)}</text>
        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {pts.map((p) => (
          <circle key={p.date} cx={p.x} cy={p.y} r={hp?.date === p.date ? 4.5 : 3}
            fill={color} stroke="var(--surface)" strokeWidth={1.5} />
        ))}
        {hp && (
          <line x1={hp.x} x2={hp.x} y1={PT} y2={H - PB} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="2 2" />
        )}
        {/* 마우스 판정 영역 */}
        <rect x={0} y={0} width={W} height={H} fill="transparent" />
      </svg>
      {hp && (
        <div className="tooltip" style={{ left: `${(hp.x / W) * 100}%`, top: `${(hp.y / H) * 100}%` }}>
          {fmtDate(hp.date)} · {fmtNum(hp.v)}
        </div>
      )}
      {!pts.length && <div className="faint tiny" style={{ marginTop: -60, textAlign: "center", position: "relative" }}>이 기간에 기록이 없어요</div>}
    </div>
  );
}
