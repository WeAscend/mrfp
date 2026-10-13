import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export type SessionData = { userId?: string; orgId?: string };

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || "dev-only-change-me-please-32-chars-minimum!!",
  cookieName: "mrfp_session",
  cookieOptions: { secure: process.env.NODE_ENV === "production", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 14 },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}
