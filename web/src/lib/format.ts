import type { Lang } from "../types";
import type { QuestionItem, Slot } from "../types";

const WEEKDAY: Record<Lang, string[]> = {
  ko: ["월", "화", "수", "목", "금", "토", "일"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};
export function weekdays(lang: Lang): string[] {
  return WEEKDAY[lang];
}

const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const SLOT: Record<Lang, Record<Slot, string>> = {
  ko: { morning: "아침", day: "낮", evening: "저녁", night: "밤" },
  en: { morning: "Morning", day: "Midday", evening: "Evening", night: "Night" },
};
export function slotLabel(lang: Lang, s: Slot): string {
  return SLOT[lang][s];
}

const KIND: Record<Lang, Record<"session" | "checkin", string>> = {
  ko: { session: "세션", checkin: "체크인" },
  en: { session: "Session", checkin: "Check-in" },
};
export function kindLabel(lang: Lang, k: "session" | "checkin"): string {
  return KIND[lang][k];
}

export const STAGE_ORDER = ["open", "map", "scan", "focus", "probe", "validate", "prescribe", "review", "care"];
const STAGE: Record<Lang, Record<string, string>> = {
  ko: {
    open: "대화 열기", map: "하루 펼치기", scan: "스캔", focus: "초점 정하기", probe: "탐지",
    validate: "해석 확인", prescribe: "처방", review: "되돌아보기", care: "돌봄",
  },
  en: {
    open: "Opening", map: "Laying out the day", scan: "Scan", focus: "Choosing a focus", probe: "Probing",
    validate: "Validating", prescribe: "Next step", review: "Reviewing", care: "Caring",
  },
};
export function stageLabel(lang: Lang, stage: string): string {
  return STAGE[lang][stage] ?? stage;
}

const EVIDENCE: Record<Lang, Record<string, string>> = {
  ko: { clinical: "임상 근거", applied: "응용 절차", local: "개인 기록 관찰" },
  en: { clinical: "Clinical evidence", applied: "Applied procedure", local: "Personal-record observation" },
};
export function evidenceLabel(lang: Lang, ev: string): string {
  return EVIDENCE[lang][ev] ?? ev;
}

/** 어려움 탭의 "도움이 된 과정" 근거 등급 */
const STRENGTH: Record<Lang, Record<string, string>> = {
  ko: { strong: "근거 탄탄", moderate: "근거 있음", weak: "근거 약함", none: "시험 없음" },
  en: { strong: "Strong evidence", moderate: "Some evidence", weak: "Weak evidence", none: "No trials" },
};
export function strengthLabel(lang: Lang, s: string): string {
  return STRENGTH[lang][s] ?? s;
}

const SOURCE: Record<Lang, Record<string, string>> = {
  ko: {
    wikipedia: "위키백과", apa: "APA", who: "WHO", nhs: "NHS", nimh: "NIMH", stanford: "스탠퍼드",
    iep: "IEP", official: "공식", gallup: "Gallup", ipsos: "Ipsos", wellcome: "Wellcome", gbd: "GBD",
    journal: "논문", survey: "설문", press: "언론", other: "출처",
  },
  en: {
    wikipedia: "Wikipedia", apa: "APA", who: "WHO", nhs: "NHS", nimh: "NIMH", stanford: "Stanford",
    iep: "IEP", official: "Official", gallup: "Gallup", ipsos: "Ipsos", wellcome: "Wellcome", gbd: "GBD",
    journal: "Journal", survey: "Survey", press: "Press", other: "Source",
  },
};
export function sourceLabel(lang: Lang, s: string): string {
  return SOURCE[lang][s] ?? s;
}

/** 상태 축은 자리마다 고정된 색을 쓴다. 순서가 곧 색이다 (검증된 팔레트 순서). */
const STATE_SLOTS = ["energy", "mood", "sleep", "execution"];
export function seriesVar(key: string): string {
  const i = STATE_SLOTS.indexOf(key);
  return i >= 0 ? `var(--series-${i + 1})` : "var(--series-domain)";
}

export function labelOf(key: string, items: QuestionItem[] | undefined): string {
  return items?.find((q) => q.key === key)?.label ?? key;
}

export function fmtDate(iso: string, lang: Lang = "ko"): string {
  const [y, m, d] = iso.split("-").map(Number);
  const js = new Date(y, m - 1, d).getDay();
  const wd = WEEKDAY[lang][js === 0 ? 6 : js - 1];
  return lang === "en" ? `${MONTH_EN[m - 1]} ${d} (${wd})` : `${m}월 ${d}일 (${wd})`;
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
