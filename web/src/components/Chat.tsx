import { useEffect, useMemo, useState } from "react";
import type { Turn } from "../lib/conversation";
import { splitConversation } from "../lib/conversation";
import { Markdown } from "./Markdown";
import { useI18n } from "../lib/i18n";

/** 말풍선 목록. 에이전트가 물은 것은 왼쪽, 사용자가 타이핑한 것은 오른쪽. */
export function Chat({ turns }: { turns: Turn[] }) {
  const { t } = useI18n();
  return (
    <div className="chat" role="log" aria-label={t("대화", "Conversation")}>
      {turns.map((tn, i) => (
        <div className={`bubble ${tn.role}`} key={i}>
          <span className="who">{tn.role === "agent" ? "howami" : t("나", "me")}</span>
          <div className="text">{tn.text}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * 세션 본문. `## 대화` 절은 여기서 보여주지 않고(ChatButton 이 연다) 나머지 절만 마크다운으로 그린다.
 */
export function SessionBody({ body }: { body: string }) {
  const { t } = useI18n();
  const { rest } = useMemo(() => splitConversation(body), [body]);
  return rest ? <Markdown text={rest} /> : <div className="faint small">{t("본문 없음", "No body")}</div>;
}

/**
 * 말풍선 버튼. 누르면 그 세션의 `## 대화` 절만 대화창으로 띄운다.
 * 절이 없는 옛 기록은 버튼이 흐리게 보이고, 눌러도 대화가 없다는 한 줄만 나온다.
 */
export function ChatButton({ body, title }: { body?: string | null; title: string }) {
  const { t } = useI18n();
  const turns = useMemo(() => (body ? splitConversation(body).turns : []), [body]);
  const [open, setOpen] = useState(false);
  const has = turns.length > 0;
  return (
    <>
      <button type="button" className={`chat-btn${has ? "" : " empty"}`} onClick={() => setOpen(true)}
        title={has ? t(`대화 ${turns.length}턴 보기`, `View ${turns.length} turns`) : t("이 세션에는 대화 기록이 없어요", "This session has no conversation log")}
        aria-label={t("대화 보기", "View conversation")}>
        <BubbleIcon />
        {t("대화", "Chat")}{has && <b className="num">{turns.length}</b>}
      </button>
      {open && <ChatModal turns={turns} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}

/** 대화창. 배경을 누르거나 Esc 를 누르면 닫힌다. 설명 없이 말풍선만 보여준다. */
export function ChatModal({ turns, title, onClose }: { turns: Turn[]; title: string; onClose: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="chat-overlay" onClick={onClose} role="presentation">
      <div className="chat-panel" role="dialog" aria-modal="true" aria-label={t(`${title} 대화`, `${title} conversation`)} onClick={(e) => e.stopPropagation()}>
        <div className="chat-panel-head">
          <span className="num">{title}</span>
          <button type="button" className="chat-close" onClick={onClose} aria-label={t("닫기", "Close")}>×</button>
        </div>
        <div className="chat-panel-body">
          {turns.length
            ? <Chat turns={turns} />
            : <div className="faint small chat-empty">{t("이 세션에는 대화 기록이 없어요.", "This session has no conversation log.")}</div>}
        </div>
      </div>
    </div>
  );
}

function BubbleIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
    </svg>
  );
}
