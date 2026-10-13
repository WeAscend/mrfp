import type { Tenant } from "@/lib/tenant";
import type { ClientFull } from "@/lib/services/clients";
import type { FollowUpRow } from "@/lib/services/queries";
import type { HoldingAuthority, OriginatingCompany } from "@/db/schema";
import type { TimelineItem } from "@/lib/services/comms";
import type { ChannelState } from "@/lib/commsTypes";

export type Ctx = {
  t: Tenant; c: ClientFull; authorities: HoldingAuthority[]; byId: Record<string, HoldingAuthority>; ocs: OriginatingCompany[];
  users: { userCode: string; role: string; user: { name: string } }[]; others: { id: string; name: string }[]; fus: FollowUpRow[]; related: ClientFull["relatedFrom"][number]["to"][];
  tl: TimelineItem[]; openSign: { id: string; status: string; createdAt: string; remindersSent: number } | null; emailState: ChannelState; smsState: ChannelState;
};
export const claimRef = (k: { claimId: string; amount: string | null; currency: string }, haName: string) => `${k.claimId} : ${haName} : ${k.amount ? `$${Number(k.amount).toLocaleString("en-AU", { minimumFractionDigits: 2 })}` : "—"}`;
