import type { Context, Day, Methods, Questions, Session, Stats } from "./types";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    throw new Error(`${path}: 응답을 JSON 으로 읽지 못했습니다 (HTTP ${res.status})`);
  }
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error ?? `${path}: HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  context: (days: number, limit = 30) => get<Context>(`/api/context?days=${days}&limit=${limit}`),
  stats: (days: number) => get<Stats>(`/api/stats?days=${days}`),
  day: (date: string) => get<Day>(`/api/day/${date}`),
  entry: (id: string) => get<Session & { raw: string; path: string }>(`/api/entries/${id}`),
  questions: (lang = "ko") => get<Questions>(`/api/questions?lang=${lang}`),
  methods: () => get<Methods>("/api/methods"),
};
