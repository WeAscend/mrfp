import { requireTenant } from "@/lib/tenant";
import { ImportWizard } from "./ImportWizard";
import { PageHead } from "@/components/PageHead";

export default async function ImportPage() {
  const t = await requireTenant();
  return <><PageHead title="Import leads" lede="One lead per row from a register export. Preview first; possible duplicates are flagged, never merged." /><ImportWizard userCode={t.membership.userCode} /></>;
}
