import { NextResponse } from "next/server";
import { stripe, stripeEnabled, handleStripeEvent } from "@/lib/billing";

export async function POST(req: Request) {
  if (!stripeEnabled() || !process.env.STRIPE_WEBHOOK_SECRET) return new NextResponse("Stripe not configured", { status: 503 });
  const sig = req.headers.get("stripe-signature") || "";
  let event;
  try { event = stripe().webhooks.constructEvent(await req.text(), sig, process.env.STRIPE_WEBHOOK_SECRET); } catch (e) { return new NextResponse(`Webhook error: ${(e as Error).message}`, { status: 400 }); }
  await handleStripeEvent(event);
  return NextResponse.json({ received: true });
}
