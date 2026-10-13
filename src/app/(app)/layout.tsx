import { requireTenant } from "@/lib/tenant";
import { dueCount } from "@/lib/services/queries";
import { Shell } from "@/components/Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const t = await requireTenant();
  const due = await dueCount(t);
  return <Shell t={t} due={due}>{children}</Shell>;
}
