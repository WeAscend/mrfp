// Dropdown options an Admin can edit under Settings › Dropdowns (Decisions 6.1). Built-ins are the Spec lists; an
// organisation's overrides are stored as JSON on the organisation. Lead Identifiers stay fixed because rules hang off them.
import * as R from "./rules";

export const OPTION_SETS: { key: OptionKey; label: string; help: string; defaults: string[] }[] = [
  { key: "sources", label: "Source", help: "Where a lead came from.", defaults: R.SOURCES },
  { key: "specialConditions", label: "Special Condition", help: "Chips on a client; filterable.", defaults: R.SPECIAL_CONDITIONS },
  { key: "inactiveReasons", label: "Inactive Reason", help: "'Completed' is set automatically and can't be removed.", defaults: R.INACTIVE_REASONS },
  { key: "followUpReasons", label: "Follow Up reason", help: "Suggestions in the Reason box; any text can still be typed.", defaults: R.FOLLOW_UP_REASONS },
  { key: "a2aReasons", label: "A2A re-send reason", help: "Why an Authority to Act was sent again for the same claim.", defaults: R.A2A_REASONS },
  { key: "feeOptions", label: "Fee for Service %", help: "Numbers only. Any other percentage can still be typed on a claim (Decisions 3.7).", defaults: R.FEE_OPTIONS.map(String) },
];
export type OptionKey = "sources" | "specialConditions" | "inactiveReasons" | "followUpReasons" | "a2aReasons" | "feeOptions";
export type Options = Record<OptionKey, string[]>;

export function opts(org: { options?: unknown }): Options {
  const o = (org.options && typeof org.options === "object" ? org.options : {}) as Partial<Record<OptionKey, string[]>>;
  const out = {} as Options;
  for (const s of OPTION_SETS) { const v = o[s.key]; out[s.key] = Array.isArray(v) && v.length ? v.map(String) : s.defaults; }
  if (!out.inactiveReasons.includes("Completed")) out.inactiveReasons = ["Completed", ...out.inactiveReasons];
  return out;
}
