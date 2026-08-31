/**
 * 세션 본문에서 `## 대화` 절을 떼어 낸다.
 *
 * 형식 (schema/session.md 참고):
 *   ## 대화
 *   Q: 에이전트가 물은 것
 *   A: 사용자가 타이핑한 말 그대로
 *   A 나 Q 로 시작하지 않는 줄은 직전 턴에 이어 붙는다.
 *
 * 돌려주는 rest 는 `## 대화` 절을 뺀 나머지 본문이다. 절이 없으면 turns 는 비고 rest 는 원문 그대로다.
 */
export type TurnRole = "agent" | "user";
export interface Turn { role: TurnRole; text: string; }

const HEADING_RE = /^##\s+(.*?)\s*$/;
const TURN_RE = /^(Q|A)\s*:\s?(.*)$/;

export function splitConversation(body: string): { turns: Turn[]; rest: string } {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const rest: string[] = [];
  const turns: Turn[] = [];
  let inConv = false;
  let cur: Turn | null = null;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = HEADING_RE.exec(line);
    if (h) {
      const title = h[1].toLowerCase();
      inConv = title === "대화" || title === "conversation";
      cur = null;
      if (inConv) continue;
    }
    if (!inConv) { rest.push(line); continue; }
    const m = TURN_RE.exec(line);
    if (m) {
      cur = { role: m[1] === "Q" ? "agent" : "user", text: m[2].trim() };
      turns.push(cur);
    } else if (cur && line.trim()) {
      cur.text += "\n" + line.trim();
    }
  }
  return { turns, rest: rest.join("\n").trim() };
}
