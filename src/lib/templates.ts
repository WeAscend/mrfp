// Message templates: defaults every organisation starts with, and the placeholder renderer.
// Placeholders are {{name}} style; unknown ones render blank so a typo never leaks "{{foo}}" to a client.
export type TemplateKey = "info_email" | "a2a_sign" | "a2a_reminder" | "id_request" | "ha_chase" | "invoice" | "info_sms" | "a2a_sms" | "a2a_reminder_sms";
export type DefaultTemplate = { key: TemplateKey; channel: "EMAIL" | "SMS"; name: string; subject?: string; body: string; when: string };

export const PLACEHOLDERS: [string, string][] = [
  ["{{firstName}}", "Client's preferred or first name (business contact for a business)"], ["{{name}}", "Full display name (Surname, First)"], ["{{fullName}}", "Natural name (First Surname)"], ["{{org}}", "Your organisation name"], ["{{orgShort}}", "Short name, e.g. MRF"],
  ["{{userName}}", "The sender's name"], ["{{leadAmount}}", "Lead amount, formatted"], ["{{foundAt}}", "Where the money was found (search log)"], ["{{authority}}", "Holding authority (claim messages)"],
  ["{{claimId}}", "Claim ID"], ["{{reference}}", "OTN / reference"], ["{{amount}}", "Claim amount"], ["{{dateSubmitted}}", "Date submitted"], ["{{signLink}}", "Link to sign the Authority to Act"],
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
  { key: "a2a_sign", channel: "EMAIL", name: "Authority to Act — sign online", subject: "Please sign your Authority to Act — {{org}}", when: "Sends the e-sign link. Sets A2A Sent and the Lead Identifier; reminders go automatically.",
    body: `Hi {{firstName}},

Here is your Authority to Act for {{org}} to recover the money held in your name. It takes about two minutes to read and sign online:

{{signLink}}

Once it's signed we'll start the claim straight away and keep you posted at each step. If anything is unclear, reply to this email or call {{phone}}.

Kind regards,
{{userName}}
{{org}}` },
  { key: "a2a_reminder", channel: "EMAIL", name: "Authority to Act — reminder", subject: "Reminder: your Authority to Act is waiting — {{org}}", when: "Sent automatically on the reminder days while the document is unsigned.",
    body: `Hi {{firstName}},

Just a reminder that your Authority to Act is ready to sign online — it takes a couple of minutes:

{{signLink}}

We can't lodge the claim for {{leadAmount}} until it's signed. If you've changed your mind or have questions, just let me know.

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
  { key: "info_sms", channel: "SMS", name: "Information SMS", when: "Short version of the information email, for clients who gave SMS consent.",
    body: `Hi {{firstName}}, {{userName}} from {{org}} here. As discussed, we found money held in your name (est. {{leadAmount}}). I'll email the details — call {{phone}} any time.` },
  { key: "a2a_sms", channel: "SMS", name: "Authority to Act — sign link SMS", when: "Sends the e-sign link by SMS.",
    body: `Hi {{firstName}}, your {{org}} Authority to Act is ready to sign (2 mins): {{signLink}}` },
  { key: "a2a_reminder_sms", channel: "SMS", name: "Authority to Act — reminder SMS", when: "Automatic reminder while unsigned.",
    body: `Hi {{firstName}}, reminder from {{org}}: your Authority to Act is waiting to be signed: {{signLink}}` },
];

export const DEFAULT_A2A_TEMPLATE = `AUTHORITY TO ACT

I, {{name}}, authorise {{org}} ("the Agent") to act on my behalf to search for, claim and recover unclaimed money held in my name by any government body, company, financial institution or other holding authority in Australia or New Zealand.

I authorise the Agent to:
1. Make enquiries with any holding authority about money held in my name and obtain information and documents relating to it;
2. Prepare and lodge claims for the release of that money, and provide copies of my identity and address documents to the holding authority where required;
3. Receive the recovered money into the Agent's trust account where the holding authority pays the Agent, and remit the balance to me after deduction of the agreed fee.

Fee: The Agent's fee is {{feePct}}% of the amount recovered, plus GST, deducted from the recovered amount or invoiced on receipt. No fee is payable if nothing is recovered.

This authority remains in force until the claim is finalised or until I withdraw it in writing. I confirm the details I have provided are true and that I am entitled to the money claimed.`;

/** Replace {{placeholders}}; unknown keys become "". Conditional "clauses" are just values that may be "". */
export function render(body: string, vars: Record<string, string | number | null | undefined>) {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => { const v = vars[k]; return v == null ? "" : String(v); }).replace(/[ \t]+\n/g, "\n");
}
