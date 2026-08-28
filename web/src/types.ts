// scripts/serve.py 가 내주는 JSON 의 형태. howami.py 의 출력과 1:1 로 맞춘다.

export type Kind = "session" | "checkin";
export type Slot = "morning" | "day" | "evening" | "night";

export interface DomainEntry {
  key: string;
  score: number | null;
  note: string | null;
}

export interface Session {
  id: string;
  date: string;
  time: string | null;
  slot: Slot | null;
  kind: Kind;
  weekday: number;
  weekday_label: string;
  prescription: string | null;
  prev_prescription_done: boolean | null;
  scores: Record<string, number>;
  domains: DomainEntry[];
  flags: string[];
  methods: string[];
  body?: string | null;
}

export interface DayRollup {
  date: string;
  sessions: number;
  weekday: number;
  weekday_label: string;
  scores: Record<string, number>;
  domains: Record<string, number>;
}

export interface OpenPrescription {
  text: string;
  from: string;
  same_day: boolean;
}

export interface Context {
  ok?: false;
  error?: string;
  home: string;
  db: string;
  today: string;
  now: string;
  sessions_today: number;
  today_sessions: Session[];
  streak_days: number;
  total_entries: number;
  total_days: number;
  last_entry: Session | null;
  open_prescription: OpenPrescription | null;
  baseline_7d: Record<string, number>;
  domain_baseline_7d: Record<string, number>;
  drop_threshold: number;
  history: Session[];
  days: DayRollup[];
}

export interface SeriesPoint {
  date: string;
  v: number;
}

export interface WeekdayMean {
  weekday: number;
  ko: string;
  en: string;
  n: number;
  mean: number;
}

export interface KeyStats {
  n: number;
  scored?: number;
  mean: number | null;
  min: number | null;
  max: number | null;
  latest?: number;
  series: SeriesPoint[];
  by_weekday: WeekdayMean[];
}

export interface Stats {
  ok?: false;
  error?: string;
  note?: string;
  entries: number;
  days?: number;
  sessions_per_day?: number;
  range?: { from: string; to: string };
  scores?: Record<string, KeyStats>;
  domains?: Record<string, KeyStats>;
  by_slot?: { slot: Slot; key: string; n: number; mean: number }[];
  flags?: { flag: string; n: number }[];
  methods?: { method: string; n: number; last_used: string }[];
  prescription_follow_through?: { n: number; done: number };
  recent_prescriptions?: { id: string; date: string; time: string | null; prescription: string }[];
}

export interface Day {
  ok?: false;
  error?: string;
  date: string;
  weekday?: string;
  sessions: number;
  note?: string;
  rollup?: DayRollup | null;
  entries?: Session[];
}

export interface QuestionItem {
  key: string;
  label?: string;
  question?: string;
  when?: string;
  probe_hint?: string;
  default?: boolean;
  anchors: Record<string, string>;
}

export interface Questions {
  lang: string;
  domains: QuestionItem[];
  domain_anchors: Record<string, string>;
  states: QuestionItem[];
}

export type Lang = "ko" | "en";
export type Bilingual = Partial<Record<Lang, string>>;

export interface MethodLink {
  label: string;
  url: string;
  source?: string;
}

export interface Method {
  id: string;
  stage?: string;
  name: Bilingual;
  summary: Bilingual;
  say_it_as?: Bilingual;
  origin?: string;
  evidence?: "clinical" | "applied" | "local" | string;
  use_when?: string;
  effect: Bilingual;
  links: MethodLink[];
}

export interface Methods {
  methods: Method[];
  general_links: MethodLink[];
}

export type OpenTarget = "home" | "data" | "db" | "insights";

export interface DirSummary {
  path: string;
  exists: boolean;
  files: number;
  bytes: number;
}

export interface Settings {
  ok?: false;
  error?: string;
  home: string;
  home_env: string | null;
  data: DirSummary;
  insights: DirSummary;
  db: { path: string; exists: boolean; bytes: number };
  db_entries: number | null;
  db_days: number | null;
  schema_version: number | null;
  project_root: string;
  questions_dir: string;
  server: { url: string; port: number; python: string; platform: string };
  can_open: boolean;
}

/** 어려움 지도 (questions/struggles.yaml → /api/struggles) */
export interface StruggleItem {
  id: string;
  region?: string;
  name: Bilingual;
  summary?: string;
  figure?: string;
  variation?: string;
  domains: string[];
  states: string[];
  links: MethodLink[];
}

export interface StruggleGroup {
  id: string;
  title: Bilingual;
  note?: string;
  layout: "cards" | "table" | string;
  items: StruggleItem[];
}

export interface Struggles {
  version?: string;
  updated?: string;
  sources_reviewed?: string;
  subagents?: string;
  intro: Bilingual;
  groups: StruggleGroup[];
  patterns: string[];
}
