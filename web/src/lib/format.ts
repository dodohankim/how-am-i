import type { QuestionItem, Slot } from "../types";

export const WEEKDAY_KO = ["월", "화", "수", "목", "금", "토", "일"];

export const SLOT_LABEL: Record<Slot, string> = {
  morning: "아침",
  day: "낮",
  evening: "저녁",
  night: "밤",
};

export const KIND_LABEL = { session: "세션", checkin: "체크인" } as const;

export const STAGE_ORDER = ["open", "map", "scan", "focus", "probe", "validate", "prescribe", "review", "care"];
export const STAGE_LABEL: Record<string, string> = {
  open: "대화 열기",
  map: "하루 펼치기",
  scan: "스캔",
  focus: "초점 정하기",
  probe: "탐지",
  validate: "해석 확인",
  prescribe: "처방",
  review: "되돌아보기",
  care: "돌봄",
};

export const EVIDENCE_LABEL: Record<string, string> = {
  clinical: "임상 근거",
  applied: "응용 절차",
  local: "개인 기록 관찰",
};

/** 어려움 탭의 "도움이 된 과정" 근거 등급 */
export const STRENGTH_LABEL: Record<string, string> = {
  strong: "근거 탄탄",
  moderate: "근거 있음",
  weak: "근거 약함",
  none: "시험 없음",
};

export const SOURCE_LABEL: Record<string, string> = {
  wikipedia: "위키백과",
  apa: "APA",
  who: "WHO",
  nhs: "NHS",
  nimh: "NIMH",
  stanford: "스탠퍼드",
  iep: "IEP",
  official: "공식",
  gallup: "Gallup",
  ipsos: "Ipsos",
  wellcome: "Wellcome",
  gbd: "GBD",
  journal: "논문",
  survey: "설문",
  press: "언론",
  other: "출처",
};

/** 상태 축은 자리마다 고정된 색을 쓴다. 순서가 곧 색이다 (검증된 팔레트 순서). */
const STATE_SLOTS = ["energy", "mood", "sleep", "execution"];
export function seriesVar(key: string): string {
  const i = STATE_SLOTS.indexOf(key);
  return i >= 0 ? `var(--series-${i + 1})` : "var(--series-domain)";
}

export function labelOf(key: string, items: QuestionItem[] | undefined): string {
  return items?.find((q) => q.key === key)?.label ?? key;
}

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = WEEKDAY_KO[new Date(y, m - 1, d).getDay() === 0 ? 6 : new Date(y, m - 1, d).getDay() - 1];
  return `${m}월 ${d}일 (${wd})`;
}

export function fmtShort(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}/${d}`;
}

export function fmtNum(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  return Number.isInteger(v) ? String(v) : v.toFixed(digits);
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 1~5 평균값을 순차 램프(100~700) 단계로 옮긴다. */
export function rampStep(v: number): number {
  const steps = [100, 200, 300, 400, 500, 600, 700];
  const t = Math.max(0, Math.min(1, (v - 1) / 4));
  return steps[Math.round(t * (steps.length - 1))];
}
