// Pure types/constants shared by server services and client components (no db imports here).
export type Channel = "EMAIL" | "SMS";
export type ChannelState = "ok" | "no-consent" | "opted-out" | "no-address";
export const CALL_OUTCOMES = ["Spoke", "No answer", "Voicemail", "Call back", "Wrong number", "Not interested"] as const;
export type CallOutcome = typeof CALL_OUTCOMES[number];
