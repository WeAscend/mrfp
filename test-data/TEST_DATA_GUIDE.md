# MRFP test data (all made up)

Every name, address, phone number, email and reference number in this folder is invented. **Build and test with this data only.** Real data is loaded only at migration on MT's Mac.

Two sets:

1. `lead_import_sample.csv`: tests **Import leads from CSV** (Spec 2.5, Lead CSV Import sheet).
2. `airtable_export_FAKE/`: four CSVs shaped like MT's Airtable exports, for testing **migration** (Spec section 10, Migration Map sheet).

## Read this first: what is known and what is guessed

- **Column headers are exact.** They are copied from MT's real Airtable exports, including Airtable's own spellings (e.g. `ID  - Licence - Recieved` with two spaces). The extra columns `Record ID`, `Client Record ID`, `Holding Authority Record ID` and `Associated Entry Record ID` are the ones MT adds before exporting (Spec 10).
- **Value formats are guesses.** MT's export samples had no data rows, so these are best guesses:
  - dates as D/MM/YYYY;
  - money as `$1,234.56`;
  - multi-selects and links as comma-separated values;
  - Record IDs as `rec` + 14 characters.

  **Before writing the migration, check the formats against one real exported record**, e.g. ask MT to export a single client. Don't rely on these guesses.

"Today" in the expectations below is **13 Oct 2026**. "Check-list" means the list of items MRFP gives MT to sort out by hand after migration (Spec 10).

---

## 1. Lead CSV import: `lead_import_sample.csv` (7 rows)

Every row becomes a Client with:
- Stage = Lead
- Lead Identifier = New import
- Source = MT Cold Call
- Owner = MT1

| Row | Tests | Expected |
|---|---|---|
| IMPORTA, Ian | Plain new lead | Created. Lead Amount $7,493.21 exactly. One Search Log entry (ASIC) dated the import date. |
| IMPORTB, Isla | Two authorities; DOB; phone with leading zero | Search Log lists ASIC and Revenue NSW. Phone stays `0400 111 222`. DOB is 5 Nov 1972 (Australian format). Blank Status means New import, with no flag. |
| tester, alice | Possible duplicate (different case) | **Flagged in the preview** as a possible duplicate of TESTER, Alice (only after the migration test data is loaded). |
| IMPORT FREIGHT PTY LTD | Company in Surname | Client Type = Business. Name copied to Business Names. No Special Condition. |
| IMPORTC, Ivan | 'Super Fund' | Special Condition = Super Fund Account. |
| IMPORTD, Ivy | Status other than LEADS - NEW | Imported as New import **and flagged in the preview**. Special Condition NZ. |
| IMPORTE, Igor | Last Contact Date; previous addresses; cents | A dated Note, and Last Contact = 1 Oct 2026. Two Previous Addresses. Phone - Other kept as text. |

---

## 2. Migration: `airtable_export_FAKE/`

### Expected counts (Spec 10 formula)

| | Airtable rows | MRFP records |
|---|---|---|
| Clients | Clients 12 + Leads 9 - 1 lead with status 'Cold Call - Client Table' | **20 Clients** |
| Claims | 9 | **9 Claims** |
| HA / OC | 13 (9 Holding Authorities, 4 companies) | **9 Holding Authorities + 3 Originating Companies** (1 merger placeholder not created) |

### Clients

| Airtable record | Tests | Expected in MRFP |
|---|---|---|
| TESTER, Alice | Standard active client, 3 claims | Stage Active. A2A Sent 10 Mar 2026. A2A Signed & Received 18 Mar 2026 (earliest claim Signed date). ID dates copied. Client Code **TESA1**. Her Airtable note becomes one migration note. Last Contact stays 2 Oct 2026. |
| TESTER, Andrew | Client Code collision; NZ; Associated Entry | Client Code **TESA2** (Alice entered earlier). Special Condition NZ. Related Client Record = Alice (linked through Associated Entry Record ID). Client follow-up 10 Oct 2026 shows as **overdue (red)**. |
| EXAMPLE HOLDINGS PTY LTD | Business client | Client Type Business, no Special Condition. Client Code **9EXHO1** ('Pty Ltd' stripped). |
| DUMMY, Dora | Completed client | Stage Inactive, reason Completed. Became Non-Active 20 Aug 2026. Code **DUMD1**. |
| SAMPLE, 'Bruce & Carol' | Joint names in one record | Migrated as one record and **put on the check-list** to split. Code from the record as it stands (SAMB1). |
| VARIANT, Vic | 'Active Client' but every claim closed | Stays Active (rules don't change imported records) and **goes on the check-list**. Code VARV1. |
| PLACEHOLDER, Pete | Also in Leads as 'Cold Call - Client Table' | **One record only.** Stage Lead, Identifier 'Info sent - waiting on response'. Topped up from the lead row: Lead Amount $4,400.00, Address on UCM, Search Results. |
| MOCK, Mary | 'Contact Form' status | Lead / New import, Source = MRF Contact Form. |
| FAKE, Fred | 'Inactive' | Stage Inactive, Inactive Reason blank. No Client Code (no claims). |
| TRIAL, Tom | 'Cold Call - Rude DNC' | Inactive / Rude DNC. |
| QUIRK, Quinn | Status not in the map | Status left blank and **put on the check-list**. |
| FREESEARCH, Fay | 'Free Search - waiting for response' | Lead / Info sent - waiting on response. Source MRF Free Search Request. |

### Leads (8 new records; PLACEHOLDER, Pete is not created twice)

| Lead | Status | Expected |
|---|---|---|
| NEWLEAD, Nina | LEADS - NEW | Lead / New import. Special Condition WA. Source MT Cold Call. |
| GREEN, Gary | LEAD - Green | Lead / Calling. Last Contact 7 Oct 2026. Note imported as a migration note. |
| BIGFISH, Barbara | BIG FISH | Lead / Deep Research. Deceased Estate. |
| MOREINFO, Milo | LEAD - Need more info | Lead / Need more info. |
| HIDDEN, Hana | LEADS - Hard to Find | Lead / Hard to find. Search Log shows SRO Vic (name mapped). |
| NOPE, Ned | NO | Lead / Leads No List. Follow Up = migration date + 3 months. |
| WIDGET CO PTY LTD | LEADS - NEW, 'Business' | Client Type Business. **See open question 1.** |
| SUPERANN, Sue | 'Super Fund' | Special Condition Super Fund Account. |

### Claims

| # | Client | Tests | Expected |
|---|---|---|---|
| 1 | Alice | HA link holds an authority and a company; old submission | Holding Authority ASIC, Originating Company Example Bank. Reference `012345678901` **keeps its leading zero** (stored as text). Step 7. Submitted 1 Jul 2026, more than 67 days ago, so it **appears on the Holding Authority follow-up list**. Claim Notes and Client Notes become two notes tagged to this claim. Fee $2,496.11 + GST. |
| 2 | Alice | Resubmitted; Company column filled; new address | Step 9. Date Resubmitted 6 Oct 2026, so it is **not** on the follow-up list until more than 37 days have passed. The Company column is ignored. '9 Brand New Street' is **added to Alice's Previous Addresses**. |
| 9 | Alice | Second ASIC claim for the same client | Step 11. Alice's two ASIC claims get ATESA1-0001 and ATESA1-0002. Her Revenue NSW claim gets NTESA1-0001. |
| 3 | Andrew | NZD claim | Amount $3,250.00, Currency NZD. **Fee (AUD) left blank and put on the check-list** (Airtable's Calculated Fee not used). Claim follow-up 10 Oct 2026 shows as overdue. Claim ID ITESA2-0001. |
| 4 | Example Holdings | Business; second company in the HA link; renamed status | ASIC + Originating Company Test Mining Ltd. 'Holding Authority Forms To be Signed' becomes step 5. Fee 15%. Claim ID A9EXHO1-0001. |
| 5 | Dora | Closed claim; SRO name; full-date Year | Holding Authority **SRO Vic** (from 'SRO Victoria'). Year text '31 Mar 1998'. 'Review completed' becomes step 16. **Activity Log close entry dated 10 May 2026.** |
| 6 | Sample | A2A sent, never signed | Step 2. A2A log first entry Sent 8 Jun 2026, so the claim is on the **A2A chase**. |
| 8 | Sample | Placeholder company; removed status; WA name | Holding Authority **WA Treasury**. Originating Company **Sample Mutual** (placeholder re-pointed; 'Old Credit Union' added to Sample Mutual's Previous Names). Status 'Personal Details Form Sent for Completion': Claim Progress **blank, on the check-list**. |
| 7 | Vic | Closed claim; SA name | Holding Authority **SA Treasury**. Step 21 (No Contact from Client). Activity Log close entry dated 1 Sep 2026. |

All AUD fees are recalculated as Amount x Fee %, with GST Treatment + GST. They should match Airtable's Calculated Fee exactly.

---

## 3. Open questions found while making this data (for MT)

1. **Business leads in the Airtable Leads table:** the company name sits in Surname. The **import** rule copies it to Business Names, but the **migration** rule only says 'Business' sets Client Type = Business. Should migration also move the name from Surname to Business Names? Probably yes, but confirm with MT.
2. **Leads 'Date entered':** the Spec says a lead's Date entered falls back to the Airtable record's created date. The Leads export has no Date entered column, and Airtable doesn't export created dates unless a 'Created time' field is added. **MT should add a Created time field to the Leads table before exporting.**
