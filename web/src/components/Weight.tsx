import type { Session, WeightSummary } from "../types";
import { useI18n } from "../lib/i18n";

/**
 * 대화 전후 '마음의 무게' (0~10). 이 두 숫자가 "이 대화를 거치고 내가 달라졌는가"를
 * 보여주는 유일한 값이라, 세션마다 배지로 붙이고 오늘 탭 상단에 한 줄로 모은다.
 * 비율은 쓰지 않고 횟수로만 말한다 (n=1 관찰).
 */

export function weightDir(before?: number | null, after?: number | null): "down" | "up" | "flat" | "half" | null {
  if (before == null && after == null) return null;
  if (before == null || after == null) return "half";
  return after < before ? "down" : after > before ? "up" : "flat";
}

export function WeightPill({ before, after }: { before?: number | null; after?: number | null }) {
  const { t } = useI18n();
  const dir = weightDir(before, after);
  if (!dir) return null;
  return (
    <span className={`badge weight ${dir}`}
      title={t("대화 시작 → 끝, 마음의 무게 0~10", "Start → end of the conversation, how heavy your mind felt, 0–10")}>
      {t("무게", "Weight")} <b className="num">{before ?? "–"}</b> → <b className="num">{after ?? "–"}</b>
    </span>
  );
}

/** 오늘 탭 상단: 오늘 세션들의 전후 쌍과, 쌓인 게 있으면 지금까지의 횟수 한 줄 */
export function WeightLine({ sessions, summary }: { sessions: Session[]; summary?: WeightSummary | null }) {
  const { lang, t } = useI18n();
  const withWeight = sessions.filter((s) => weightDir(s.weight_before, s.weight_after));
  const n = summary?.n ?? 0;
  if (!withWeight.length && !n) return null;
  return (
    <div className="weight-line">
      <span className="k">{t("이 대화 전후", "Before → after")}</span>
      {withWeight.length
        ? withWeight.map((s) => (
          <span key={s.id} className="pair">
            <span className="faint">{s.time ?? ""}</span> <WeightPill before={s.weight_before} after={s.weight_after} />
          </span>
        ))
        : <span className="faint">{t("오늘은 아직 숫자를 받지 않았어요.", "No numbers taken today yet.")}</span>}
      {n > 0 && (
        <span className="tally">
          {lang === "en"
            ? `So far: ${summary!.down} of ${n} conversations ended lighter · ${summary!.same} unchanged · ${summary!.up} heavier`
            : `지금까지 ${n}번 중 ${summary!.down}번은 끝날 때 내려갔고, ${summary!.same}번은 그대로, ${summary!.up}번은 올라갔어요`}
        </span>
      )}
    </div>
  );
}
