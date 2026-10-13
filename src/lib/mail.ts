// Email driver. Resend when RESEND_API_KEY is set, otherwise a "log" driver that records the message and prints it —
// so every flow works end-to-end in development and tests without a provider. The footer that identifies the sender
// and carries the unsubscribe link is added by services/comms.ts, not here.
export type MailInput = { to: string; toName?: string | null; from: string; replyTo?: string | null; subject: string; text: string; html?: string; headers?: Record<string, string>; tags?: Record<string, string> };
export type MailResult = { id: string; driver: "resend" | "log" };

export const mailDriver = () => (process.env.RESEND_API_KEY ? "resend" : "log") as MailResult["driver"];

export async function sendMail(m: MailInput): Promise<MailResult> {
  if (mailDriver() === "log") {
    if (process.env.NODE_ENV !== "test") console.log(`[mail:log] to=${m.to} subject=${JSON.stringify(m.subject)}\n${m.text.slice(0, 400)}${m.text.length > 400 ? "…" : ""}`);
    return { id: "log_" + Date.now().toString(36), driver: "log" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: m.from, to: [m.toName ? `${m.toName} <${m.to}>` : m.to], reply_to: m.replyTo || undefined, subject: m.subject, text: m.text, html: m.html || textToHtml(m.text), headers: m.headers, tags: m.tags ? Object.entries(m.tags).map(([name, value]) => ({ name, value })) : undefined }),
  });
  if (!res.ok) throw new Error(`Email provider rejected the message (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { id: string };
  return { id: j.id, driver: "resend" };
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
/** Plain text -> simple HTML: paragraphs on blank lines, bare URLs linked. */
export function textToHtml(text: string) {
  const paras = text.split(/\n{2,}/).map(p => esc(p).replace(/\n/g, "<br>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>'));
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0C3C60;max-width:640px">${paras.map(p => `<p style="margin:0 0 14px">${p}</p>`).join("")}</div>`;
}
