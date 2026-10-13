import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant";
export default async function Home() { const t = await getTenant(); redirect(t ? "/today" : "/login"); }
