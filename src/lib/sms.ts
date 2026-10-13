// SMS driver. Twilio when TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM are set, otherwise a "log" driver.
// Australian numbers are normalised to E.164 (+61…). Inbound STOP handling lives in /api/sms/inbound.
export type SmsResult = { id: string; driver: "twilio" | "log" };
export const smsDriver = () => (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM ? "twilio" : "log") as SmsResult["driver"];

/** "0412 345 678" -> "+61412345678"; already-international numbers pass through. Returns null when it isn't a usable mobile. */
export function toE164(raw: string | null | undefined, country = "AU"): string | null {
  if (!raw) return null;
  const d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return /^\+\d{8,15}$/.test(d) ? d : null;
  if (country === "AU") { if (/^04\d{8}$/.test(d)) return "+61" + d.slice(1); if (/^614\d{8}$/.test(d)) return "+" + d; return null; }
  if (country === "NZ") { if (/^02\d{7,9}$/.test(d)) return "+64" + d.slice(1); return null; }
  return null;
}
export const digitsOnly = (s: string) => s.replace(/\D/g, "");

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  if (smsDriver() === "log") {
    if (process.env.NODE_ENV !== "test") console.log(`[sms:log] to=${to}\n${body}`);
    return { id: "log_" + Date.now().toString(36), driver: "log" };
  }
  const sid = process.env.TWILIO_ACCOUNT_SID!, auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const form = new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Body: body });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form });
  if (!res.ok) throw new Error(`SMS provider rejected the message (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { sid: string };
  return { id: j.sid, driver: "twilio" };
}
