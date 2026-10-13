// Message templates: defaults every organisation starts with, and the placeholder renderer.
// Placeholders are {{name}} style; unknown ones render blank so a typo never leaks "{{foo}}" to a client.
export type TemplateKey = string; // built-in keys below; Admin can add their own (Decisions 4.8)
export type DefaultTemplate = { key: TemplateKey; channel: "EMAIL" | "SMS"; name: string; subject?: string; body: string; when: string };

export const PLACEHOLDERS: [string, string][] = [
  ["{{firstName}}", "Client's preferred or first name (business contact for a business)"], ["{{name}}", "Full display name (Surname, First)"], ["{{fullName}}", "Natural name (First Surname)"], ["{{org}}", "Your organisation name"], ["{{orgShort}}", "Short name, e.g. MRF"],
  ["{{userName}}", "The sender's name"], ["{{leadAmount}}", "Lead amount, formatted"], ["{{foundAt}}", "Where the money was found (search log)"], ["{{authority}}", "Holding authority (claim messages)"],
  ["{{claimId}}", "Claim ID"], ["{{reference}}", "OTN / reference"], ["{{amount}}", "Claim amount"], ["{{dateSubmitted}}", "Date submitted"], 
  ["{{fee}}", "Fee incl. GST breakdown"], ["{{phone}}", "Your phone"], ["{{website}}", "Your website"],
];

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  { key: "info_email", channel: "EMAIL", name: "Information email", subject: "Unclaimed money held in your name — {{org}}", when: "After a call where the person agreed to receive information. Sets Info Email Sent and the follow-up.",
    body: `Hi {{firstName}},

Thanks for your time on the phone today. As discussed, our search shows money held in your name{{foundAtClause}}, currently estimated at {{leadAmount}}.

{{org}} recovers unclaimed money on a no-win, no-fee basis: we only charge a percentage of what is actually returned to you, and nothing if nothing is recovered.

To go ahead we'll need you to sign an Authority to Act, which lets us lodge the claim with the holding authority on your behalf. I'll send that through separately as soon as you're ready — just reply to this email or call me on {{phone}}.

Kind regards,
{{userName}}
{{org}}` },
  { key: "id_request", channel: "EMAIL", name: "ID & address evidence request", subject: "Documents needed for your claim {{claimId}} — {{org}}", when: "When a claim reaches step 4 (Awaiting ID & Address Evidence).",
    body: `Hi {{firstName}},

{{authority}} needs proof of identity and address before they'll release the funds for claim {{claimId}}. Please reply with a clear photo or scan of:

1. Photo ID (driver licence or passport)
2. One document showing your current address (a utility bill, bank statement or rates notice within the last 3 months)

If the money was held under a previous address, a document linking you to that address helps too.

Kind regards,
{{userName}}
{{org}}` },
  { key: "ha_chase", channel: "EMAIL", name: "Holding authority chase", subject: "Status request: claim {{reference}} submitted {{dateSubmitted}}", when: "To the holding authority when a claim is due to be chased. Records the chase on the claim.",
    body: `Hello,

We're following up on the unclaimed money claim below, lodged under an Authority to Act on behalf of our client.

Claimant: {{name}}
Reference / OTN: {{reference}}
Amount: {{amount}}
Submitted: {{dateSubmitted}}
Our reference: {{claimId}}

Could you let us know the current status and whether anything further is required?

Kind regards,
{{userName}}
{{org}}
{{phone}}` },
  { key: "invoice", channel: "EMAIL", name: "Invoice — refund received", subject: "Good news: your refund of {{amount}} has been received — {{org}}", when: "When a claim reaches step 11 (Refund Received).",
    body: `Hi {{firstName}},

Great news — {{authority}} has released {{amount}} for claim {{claimId}}.

As agreed in your Authority to Act, our fee is {{fee}}. The balance will be paid to you once the fee is settled; the invoice is attached / will follow shortly.

Thank you for trusting {{org}}.

Kind regards,
{{userName}}
{{org}}` },
];

/** Replace {{placeholders}}; unknown keys become "". Conditional "clauses" are just values that may be "". */
export function render(body: string, vars: Record<string, string | number | null | undefined>) {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => { const v = vars[k]; return v == null ? "" : String(v); }).replace(/[ \t]+\n/g, "\n");
}
