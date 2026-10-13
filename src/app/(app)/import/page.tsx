import { requireTenant } from "@/lib/tenant";
import { ImportWizard } from "./ImportWizard";

export default async function ImportPage() {
  const t = await requireTenant();
  return <><h1 className="mb-4">Import leads from CSV</h1><ImportWizard userCode={t.membership.userCode} /></>;
}
