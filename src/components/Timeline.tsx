import type { TimelineItem } from "@/lib/services/comms";
import { Section } from "./ui";

const ICON: Record<TimelineItem["kind"], string> = { email: "✉", sms: "💬", call: "☎", consent: "✓", sign: "✍", note: "•" };
const STATUS_CLASS = (s?: string | null) => !s ? "" : /FAILED|BOUNCED|DECLINED|EXPIRED|CANCELLED/.test(s) ? "chip-red" : /SIGNED|DELIVERED|OPENED/.test(s) ? "chip-lime" : "chip-outline";
/** Every email, SMS, call, consent change and signature request on a record, newest first. Notes stay in their own box. */
export function Timeline({ items, title = "Contact history", right }: { items: TimelineItem[]; title?: string; right?: React.ReactNode }) {
  return (
    <Section title={title} right={right}>
      {!items.length && <p className="meta">No calls or messages yet. Log a call or send the information email to start.</p>}
      <ol className="flex flex-col gap-2.5">
        {items.map(i => <li key={i.kind + i.id} className="flex gap-3 items-start">
          <span className="w-7 h-7 rounded-full border border-line grid place-items-center text-[13px] shrink-0 bg-bg" aria-hidden>{ICON[i.kind]}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-x-2 gap-y-1 items-center text-[14px]"><b>{i.title}</b>{i.status && <span className={`chip !text-[11.5px] !py-px ${STATUS_CLASS(i.status)}`}>{i.status.toLowerCase()}</span>}<span className="meta">{i.at.toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · {i.by}</span></div>
            {i.detail && <details className="mt-0.5"><summary className="meta cursor-pointer">{i.kind === "email" || i.kind === "sms" ? "Show message" : i.detail.slice(0, 120)}</summary><pre className="whitespace-pre-wrap font-body text-[13.5px] text-ink2 mt-1.5 border-l-2 border-line pl-3">{i.detail}</pre></details>}
          </div>
        </li>)}
      </ol>
    </Section>
  );
}
