import { clientByUnsubToken } from "@/lib/services/comms";
import { UnsubForm } from "./UnsubForm";

/** Public unsubscribe page. A confirm step (not opt-out-on-GET) so email security scanners that pre-fetch links don't unsubscribe people by accident. */
export default async function Unsubscribe({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params; const { done } = await searchParams;
  const r = await clientByUnsubToken(token);
  return (
    <main className="min-h-screen grid place-items-center px-5 py-10">
      <div className="card-plain max-w-[520px] w-full">
        {!r ? <><h1>Link not recognised</h1><p className="lede">This unsubscribe link isn't valid. If you keep receiving messages, reply to the sender and ask to be removed.</p></> :
          done ? <><h1>You're unsubscribed</h1><p className="lede">{r.org.name} won't send you any more {done === "BOTH" ? "emails or text messages" : done === "SMS" ? "text messages" : "emails"}. Changes take effect straight away.</p></> :
          <><div className="eyebrow mb-2">{r.org.name}</div><h1>Stop messages?</h1><p className="lede">Choose what you'd like to stop receiving from {r.org.name}. You can always call us if you change your mind.</p><UnsubForm token={token} /></>}
      </div>
    </main>
  );
}
