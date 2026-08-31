import { createContext, useContext } from "react";
import type { Bilingual, Lang } from "../types";

/**
 * 화면 언어. UI 문구는 각 사용처에서 t(ko, en) 으로 두 언어를 나란히 적고,
 * 데이터는 {ko,en} 맵(pick)이나 `*_en` 병렬 필드(alt)로 고른다.
 * 번역이 없는 데이터 필드는 한국어로 폴백한다.
 */
export const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: "ko",
  setLang: () => {},
});

export function useI18n() {
  const { lang, setLang } = useContext(LangContext);
  const t = (ko: string, en: string) => (lang === "en" ? en : ko);
  const pick = (bi?: Bilingual | null): string =>
    bi ? ((lang === "en" ? bi.en ?? bi.ko : bi.ko ?? bi.en) ?? "") : "";
  const alt = (ko?: string | null, en?: string | null): string | undefined =>
    lang === "en" && en ? en : ko ?? undefined;
  return { lang, setLang, t, pick, alt };
}

export function initialLang(): Lang {
  try {
    const s = localStorage.getItem("howami.lang");
    if (s === "ko" || s === "en") return s;
  } catch { /* 저장된 값이 없으면 브라우저 언어를 따른다 */ }
  try {
    return (navigator.language ?? "").toLowerCase().startsWith("ko") ? "ko" : "en";
  } catch {
    return "ko";
  }
}
