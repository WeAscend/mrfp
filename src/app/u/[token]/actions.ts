"use server";
import { redirect } from "next/navigation";
import { optOutByToken } from "@/lib/services/comms";
export async function unsubscribeAction(token: string, ch: "EMAIL" | "SMS" | "BOTH") { await optOutByToken(token, ch); redirect(`/u/${token}?done=${ch}`); }
