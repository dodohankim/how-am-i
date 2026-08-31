import { fmtNum } from "../lib/format";
import { useI18n } from "../lib/i18n";

/**
 * 눈금 사다리 — 1~5 점수를 다섯 칸으로 그린다.
 * 점수는 이산값이라 게이지 대신 칸으로 보여주고, 최근 7일 평균은 오른쪽 눈금 표시로 겹친다.
 */
export function Ladder({ label, value, baseline, color, dropThreshold }: {
  label: string;
  value: number | null | undefined;
  baseline?: number | null;
  color: string;
  dropThreshold: number;
}) {
  const { t } = useI18n();
  const W = 56, RUNG = 12, GAP = 6, H = RUNG * 5 + GAP * 4;
  const v = value ?? null;
  const delta = v !== null && baseline != null ? v - baseline : null;
  const drop = delta !== null && -delta >= dropThreshold;
  const baselineY = baseline != null ? H - ((baseline - 0.5) / 5) * H : null;

  return (
    <div className="ladder" aria-label={v !== null ? t(`${label} ${v}점`, `${label}: ${v}`) : t(`${label} 기록 없음`, `${label}: no record`)}>
      <svg width={W + 18} height={H} viewBox={`0 0 ${W + 18} ${H}`} role="img" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => {
          const y = H - n * RUNG - (n - 1) * GAP;
          const on = v !== null && n <= v;
          return (
            <rect key={n} x={0} y={y} width={W} height={RUNG} rx={3}
              fill={on ? color : "var(--rule-2)"} />
          );
        })}
        {baselineY !== null && (
          <g transform={`translate(${W + 4}, ${baselineY})`}>
            <path d="M0 0 L8 -4 L8 4 Z" fill="var(--ink-3)" />
            <line x1={-W - 4} x2={0} y1={0} y2={0} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="2 3" />
          </g>
        )}
      </svg>
      <div className="value num">{v ?? "–"}</div>
      <div className="label">
        {label}
        {drop && <span className="badge drop" title={t(`7일 평균보다 ${dropThreshold}점 이상 낮음`, `${dropThreshold}+ below the 7-day average`)}>▼ {t("급락", "Drop")}</span>}
      </div>
      <div className="delta" title={t("최근 7일 평균 대비", "Against the 7-day average")}>
        {baseline != null ? t(`평균 ${fmtNum(baseline)}`, `avg ${fmtNum(baseline)}`) : t("평균 없음", "no average")}
        {delta !== null && ` · ${delta > 0 ? "+" : ""}${fmtNum(delta)}`}
      </div>
    </div>
  );
}
