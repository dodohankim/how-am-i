import type { ReactNode } from "react";

export function Card({ title, hint, children, flat, className }: {
  title?: ReactNode; hint?: ReactNode; children: ReactNode; flat?: boolean; className?: string;
}) {
  return (
    <div className={`card${flat ? " flat" : ""}${className ? ` ${className}` : ""}`}>
      {(title || hint) && (
        <div className="card-head">
          {title && <h3>{title}</h3>}
          {hint && <span className="hint">{hint}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

export function Section({ title, hint, children }: { title: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {hint && <span className="hint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function ErrorBox({ error }: { error: string }) {
  return (
    <div className="error" role="alert">
      <div>데이터를 불러오지 못했습니다.</div>
      <code>{error}</code>
      <div className="small muted" style={{ marginTop: 6 }}>
        <code>python3 scripts/serve.py</code> 가 실행 중인지, 개발 모드라면 프록시 대상 포트가 맞는지 확인하세요.
      </div>
    </div>
  );
}

export function RangePicker({ value, onChange, options }: {
  value: number; onChange: (v: number) => void; options: { label: string; value: number }[];
}) {
  return (
    <div className="range" role="group" aria-label="기간">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
