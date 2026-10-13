// Subscription billing via Stripe. Plans are placeholders until pricing is decided — the shape (per-org plan,
// seat count, trial, webhook sync) is wired so only price IDs and amounts need filling in.
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const PLANS = [
  { key: "solo", name: "Solo", seats: 1, blurb: "One user. Leads, clients, claims, follow-ups and reports.", priceId: process.env.STRIPE_PRICE_SOLO },
  { key: "team", name: "Team", seats: 5, blurb: "Up to 5 users with roles, activity log and CSV import.", priceId: process.env.STRIPE_PRICE_TEAM },
  { key: "agency", name: "Agency", seats: 25, blurb: "Up to 25 users, priority support, API access (coming).", priceId: process.env.STRIPE_PRICE_AGENCY },
] as const;

export const stripeEnabled = () => !!process.env.STRIPE_SECRET_KEY;
export const stripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function createCheckout(orgId: string, planKey: string, email: string) {
  const plan = PLANS.find(p => p.key === planKey); if (!plan?.priceId) throw new Error("That plan is not available yet.");
  const sub = await db.query.subscriptions.findFirst({ where: eq(schema.subscriptions.orgId, orgId) });
  const s = stripe();
  let customer = sub?.stripeCustomerId;
  if (!customer) { const c = await s.customers.create({ email, metadata: { orgId } }); customer = c.id; await db.update(schema.subscriptions).set({ stripeCustomerId: customer }).where(eq(schema.subscriptions.orgId, orgId)); }
  const session = await s.checkout.sessions.create({ mode: "subscription", customer, line_items: [{ price: plan.priceId, quantity: 1 }], success_url: `${process.env.APP_URL}/settings?tab=org&billing=success`, cancel_url: `${process.env.APP_URL}/settings?tab=org`, metadata: { orgId, plan: plan.key } });
  return session.url!;
}
export async function createPortal(orgId: string) {
  const sub = await db.query.subscriptions.findFirst({ where: eq(schema.subscriptions.orgId, orgId) });
  if (!sub?.stripeCustomerId) throw new Error("No billing account yet.");
  const p = await stripe().billingPortal.sessions.create({ customer: sub.stripeCustomerId, return_url: `${process.env.APP_URL}/settings?tab=org` });
  return p.url;
}
/** Webhook: keep the local subscription row in step with Stripe. */
export async function handleStripeEvent(event: Stripe.Event) {
  const statusMap: Record<string, "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED"> = { trialing: "TRIALING", active: "ACTIVE", past_due: "PAST_DUE", canceled: "CANCELED", unpaid: "PAST_DUE", incomplete: "PAST_DUE", incomplete_expired: "CANCELED", paused: "PAST_DUE" };
  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session; const orgId = s.metadata?.orgId; const plan = s.metadata?.plan;
    if (orgId) await db.update(schema.subscriptions).set({ stripeSubscriptionId: String(s.subscription), plan: plan ?? "solo", status: "ACTIVE", seats: PLANS.find(p => p.key === plan)?.seats ?? 1, updatedAt: new Date() }).where(eq(schema.subscriptions.orgId, orgId));
  } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const s = event.data.object as Stripe.Subscription;
    const periodEnd = s.items.data[0]?.current_period_end;
    await db.update(schema.subscriptions).set({ status: statusMap[s.status] ?? "PAST_DUE", currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null, updatedAt: new Date() }).where(eq(schema.subscriptions.stripeSubscriptionId, s.id));
  }
}
