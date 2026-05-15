# Project: `uk-tax-advisor`

An open-source UK personal income tax web application. Users upload bank statements, get an accurate tax calculation, receive personalised tax-saving suggestions, chat with an AI agent about UK tax rules, and export filing-ready files. MIT licensed. UK-only for v1.

## Tech stack (locked)

- **Next.js 15** (App Router) + **TypeScript** + **Tailwind CSS**
- **Anthropic Claude API** (`claude-sonnet-4-5`) for the AI agent, abstracted behind an interface so Ollama can be swapped in later
- **SheetJS** (`xlsx` package) for Excel export
- **No database** in v1 — state lives in React + localStorage; sensitive data (statements) never leaves the user's browser except for AI agent calls
- Tests run with `tsx`, no Jest needed
- **Node 20+** required

## Design language

Editorial and authoritative — Financial Times newsroom meets HMRC clarity. Serif display font (Fraunces or Source Serif 4), refined sans for body (IBM Plex Sans or similar). Restrained palette, generous whitespace, no flashy gradients. Trust over delight.

## Working rules (read every sprint)

- After every sprint, run **all tests** and the **typechecker**. Do not start the next sprint until everything passes.
- **Never call the Anthropic API from client-side code** — keys go in `.env.local` and are only read in `app/api/*` routes.
- Every file gets a top-of-file comment explaining what it does and why it exists.
- Tax rules are read-only data; **never hardcode rule numbers** anywhere except `src/lib/taxRules.ts`.
- All currency values stored as numbers in pounds; formatting happens at render time.
- Stop and ask the user before doing anything outside the current sprint's scope.
- This app is **NOT regulated financial advice**. Every user-facing surface that shows tax figures must include a disclaimer.

---

## Sprint 0 — Project skeleton

**Goal:** A runnable Next.js project with the right structure, tooling, and an empty homepage that proves the toolchain works.

**Deliverables:**

1. Initialise Next.js 15 with TypeScript, Tailwind, App Router, ESLint. Use the `app/` directory.
2. Create this folder structure:
   ```
   src/
     lib/        (pure logic — calculator, parser, exports, agent)
     components/ (React components)
   app/
     api/        (server routes)
     (pages live here)
   tests/
   docs/
   ```
3. Add `tsx` as a dev dependency. Add scripts: `dev`, `build`, `start`, `test` (runs `tsx tests/*.test.ts`), `typecheck` (runs `tsc --noEmit`).
4. Add `.env.local.example` with `ANTHROPIC_API_KEY=` and a comment explaining it's optional (the agent feature is disabled without it).
5. Add `.gitignore` covering `node_modules`, `.next`, `.env.local`, `out`, build artefacts.
6. Add `LICENSE` (MIT) and a placeholder `README.md` with project name, one-line description, and a "Status: under construction" note.
7. Replace `app/page.tsx` with a minimal "UK Tax Advisor — coming soon" page using the editorial design language (serif heading, restrained palette).
8. Set up Tailwind with custom colours: a near-black ink colour, an off-white paper colour, one accent (deep red or burgundy works for an editorial feel), and a muted grey for secondary text. Load Fraunces (serif) and IBM Plex Sans via `next/font/google`.

**Acceptance:**
- `npm run dev` opens a styled page on `localhost:3000`
- `npm run build` succeeds
- `npm run typecheck` passes
- The page uses the chosen serif display font

**Stop here. Confirm with the user before continuing.**

---

## Sprint 1 — Tax rules data (single source of truth)

**Goal:** Encode every UK personal income tax rule for 2025/26 and 2026/27 in one canonical, well-documented module.

**Deliverables:**

1. Create `src/lib/taxRules.ts` exporting:
   - Types: `Region` (`'england-wales-ni' | 'scotland'`), `TaxYear` (`'2025/26' | '2026/27'`), `TaxBand`, `YearRules`
   - `RULES_2025_26` and `RULES_2026_27` constants
   - `ALL_RULES` map
   - `getRules(taxYear)` function
   - `taxYearForDate(date)` function (UK tax year runs 6 April → 5 April)

2. Each `YearRules` object must contain:
   - `personalAllowance` (£12,570 both years)
   - `personalAllowanceTaperStart` (£100,000), `personalAllowanceTaperEnd` (£125,140)
   - `incomeTaxBandsEWN` — array of `TaxBand`
   - `incomeTaxBandsScotland` — array of `TaxBand`
   - `dividendAllowance` (£500), `dividendRates` ({basic: 0.0875, higher: 0.3375, additional: 0.3935})
   - `personalSavingsAllowance` ({basicRate: 1000, higherRate: 500, additionalRate: 0})
   - `startingRateForSavings` (£5,000), `startingRateForSavingsRate` (0)
   - `cgtAnnualExemptAmount` (£3,000), `cgtRates` ({basicRate: 0.18, higherRate: 0.24, residentialBasicRate: 0.18, residentialHigherRate: 0.24})
   - `ni` — Class 1 employee thresholds: 2025/26 PT £12,570 / UEL £50,270; 2026/27 PT £12,584 / UEL £50,284; mainRate 0.08, higherRate 0.02
   - `niClass4` — self-employed: LPL £12,570, UPL £50,270, mainRate 0.06, higherRate 0.02
   - `isaAllowance` (£20,000)
   - `pensionAnnualAllowance` (£60,000)
   - `marriageAllowance` (£1,260)
   - `blindPersonsAllowance` (£3,130)
   - `tradingAllowance` (£1,000), `propertyAllowance` (£1,000)
   - `giftAidBasicRate` (0.20)

3. **CRITICAL — band definitions:** Bands must be defined in **TAXABLE income** (after PA), with the **additional-rate threshold at £125,140 of taxable income** (NOT £125,140 minus PA). This is HMRC's definition and is essential for correct results when PA is tapered.

   For England/Wales/NI both years:
   ```ts
   [
     { from: 0,       to: 37700,    rate: 0.20, name: 'Basic rate' },
     { from: 37700,   to: 125140,   rate: 0.40, name: 'Higher rate' },
     { from: 125140,  to: Infinity, rate: 0.45, name: 'Additional rate' },
   ]
   ```

4. **Scotland 2025/26 bands** (taxable amounts assuming standard £12,570 PA):
   ```ts
   [
     { from: 0,                  to: 15397 - 12570,  rate: 0.19, name: 'Starter rate' },
     { from: 15397 - 12570,      to: 27491 - 12570,  rate: 0.20, name: 'Basic rate' },
     { from: 27491 - 12570,      to: 43662 - 12570,  rate: 0.21, name: 'Intermediate rate' },
     { from: 43662 - 12570,      to: 75000 - 12570,  rate: 0.42, name: 'Higher rate' },
     { from: 75000 - 12570,      to: 125140 - 12570, rate: 0.45, name: 'Advanced rate' },
     { from: 125140 - 12570,     to: Infinity,        rate: 0.48, name: 'Top rate' },
   ]
   ```

5. **Scotland 2026/27 bands** — starter band widens to £16,537, basic to £29,526; other thresholds unchanged.

6. Include source citations in file header: HoC Library briefings CBP-10237 (2025/26), CBP-10618 (2026/27), and gov.scot/publications/scottish-income-tax-rates-and-bands.

**Acceptance:**
- File compiles, `npm run typecheck` passes
- All numbers cross-checked against HMRC and gov.scot
- File header documents sources

**Stop here. Confirm with the user before continuing.**

---

## Sprint 2 — Tax calculator + tests

**Goal:** A correct tax calculator that handles every edge case in UK personal income tax, with a comprehensive test suite that catches regressions.

**Deliverables:**

1. Create `src/lib/taxCalculator.ts` exporting:
   - `IncomeInputs` interface: `earnedIncome`, `savingsIncome?`, `dividendIncome?`, `pensionContributionsGross?`, `giftAidGross?`, `region?`, `taxYear?`, `receivesMarriageAllowance?`, `transfersMarriageAllowance?`, `blindPersonsAllowance?`, `studentLoanPlan?`
   - `TaxResult` interface: `taxYear`, `region`, `grossIncome`, `personalAllowance`, `personalAllowanceLost`, `taxableEarned`, `taxableSavings`, `taxableDividends`, `incomeTaxOnEarned`, `incomeTaxOnSavings`, `incomeTaxOnDividends`, `totalIncomeTax`, `nationalInsurance`, `totalTaxAndNI`, `effectiveRate`, `marginalRate`, `takeHome`, `breakdown: BandBreakdown[]`, `notes: string[]`
   - `BandBreakdown` interface: `bandName`, `taxableInBand`, `rate`, `tax`
   - `calculateTax(input)` function

2. **CRITICAL — calculation rules (HMRC income slice order):**
   1. Non-savings non-dividend income (earned, pension, rental) — lowest slice
   2. Savings income (interest) — middle slice
   3. Dividend income — top slice (always)

3. **Personal allowance allocation:** Apply to earned first, then savings, then dividends.

4. **Personal allowance tapering:** Lose £1 for every £2 of *adjusted net income* (gross income minus gross pension contributions minus Gift Aid) above £100,000. Fully gone at £125,140.

5. **Marriage allowance:** If `receivesMarriageAllowance`, add £1,260 to PA. If `transfersMarriageAllowance`, subtract £1,260.

6. **Blind person's allowance:** If true, add £3,130 to PA.

7. **Band extension:** Pension contributions and Gift Aid push every band boundary out by the contribution amount (this is how higher-rate pension relief works for relief-at-source contributions).

8. **Dividend allowance:** £500 at 0%, but **still uses band space** (HMRC: "the dividend allowance does not reduce total income for tax purposes"). So dividends within the allowance still advance the cursor for band positioning.

9. **Starting rate for savings:** £5,000 at 0%, but reduced £1-for-£1 by every £1 of taxable non-savings income above the personal allowance. So if taxable earned ≥ £5,000, no starting rate available.

10. **PSA categorisation:** Determine from the highest rate band the user's earned income reaches: basic-rate band (top rate ≤ 20%) → £1,000 PSA; higher-rate band → £500; additional-rate → £0.

11. **Scottish savers** use **UK-wide rates** for savings and dividends (only earned income uses Scottish bands).

12. **NI:** Only on earned income. 8% from PT to UEL, 2% above UEL. Below PT = £0.

13. **Marginal rate calculation:** Include NI. Detect "60% trap" — between £100k–£125,140 the effective marginal is 40% (or 45% in Scotland) + 20% (PA loss) + NI marginal rate. Above UEL the NI part drops to 2%.

14. Create `tests/calculator.test.ts` with **all** these scenarios for 2025/26 (use a £1 tolerance, but pension test is exact):

   | Scenario | Expected |
   |---|---|
   | £10,000 earned | Tax £0, NI £0 |
   | £30,000 earned | Tax £3,486, NI £1,394.40 |
   | £60,000 earned | Tax £11,432, NI £3,210.60 |
   | £115,000 earned | PA £5,070, PA lost £7,500, Tax £36,432 |
   | £160,000 earned | PA £0, Tax £58,203 |
   | £115,000 earned + £15,000 gross pension | PA fully restored to £12,570, income tax saving exactly £6,000 vs baseline |
   | £50,000 earned + £5,000 dividends | Tax £9,004.75 (note: dividend allowance counts toward bands, so all £4,500 post-allowance falls in higher rate) |
   | £50,000 earned, Scotland | Tax £9,013.80 |
   | £30,000 earned, 2026/27 | Tax £3,486 (unchanged) |

15. Tests must use simple `console.log` with ✓/✗ markers and exit with code 1 if any fail. No test framework needed.

**Acceptance:**
- `npm run test` shows all scenarios passing
- `npm run typecheck` passes
- The pension test asserts exactly £6,000 saving — this catches the most common bug (incorrect band extension)

**Stop here. Show test output to the user before continuing.**

---

## Sprint 3 — Bank statement parser

**Goal:** Parse CSV bank statements from the major UK banks, classify transactions, and infer annual income figures.

**Deliverables:**

1. Create `src/lib/statementParser.ts` exporting:
   - `Transaction` interface: `date: Date`, `description: string`, `amount: number` (positive = credit, negative = debit), `balance?: number`, `raw: Record<string, string>`
   - `TxCategory` type: `'salary' | 'savings-interest' | 'dividend' | 'pension-contribution' | 'charity-donation' | 'rental-income' | 'self-employment-income' | 'isa-deposit' | 'transfer' | 'expense' | 'unknown'`
   - `ClassifiedTransaction` extends `Transaction` with `category` and `confidence` (0–1)
   - `InferredIncomes` interface: `earnedIncome`, `savingsIncome`, `dividendIncome`, `rentalIncome`, `selfEmploymentIncome`, `pensionContributions`, `charityDonations`, `needsReview: ClassifiedTransaction[]`
   - `parseCSV(content: string)` function
   - `classify(txs)` function
   - `inferIncomes(classified)` function

2. **Format detection** from headers (auto-detect, no user input):
   - Monzo: headers include `Amount`, `Name`, `Category`
   - Starling: headers include `Amount (GBP)`
   - Lloyds-style (separate debit/credit columns): headers include `Debit Amount` or `Money Out`
   - Generic fallback: single `Amount` column (covers HSBC, NatWest, Revolut, Barclays)

3. **CSV parser:** Write a small inline parser that handles quoted fields, escaped quotes (`""`), commas inside quotes, and `\r\n` line endings. Don't add a heavy CSV dependency.

4. **Date parsing:** Handle UK formats — `DD/MM/YYYY`, `DD-MM-YYYY`, `DD MMM YYYY`. Fall back to `new Date()` for ISO formats.

5. **Classifier:** Regex-based, first match wins. Rough rules:
   - **salary**: positive amount + `/\b(salary|wages|payroll|net pay|monthly pay)\b/i` → confidence 0.95
   - **savings-interest**: positive + `/\b(interest|int\.|credit interest|gross int)\b/i` → 0.9
   - **dividend**: positive + `/\b(dividend|div\.?|ord div|distribution)\b/i` → 0.9
   - **pension-contribution**: negative + `/\b(pension|sipp|aviva|nest|hl pension|vanguard pension)\b/i` → 0.85
   - **charity-donation**: negative + `/\b(donation|charity|gift aid|just ?giving|oxfam|red cross|rspca|cancer research)\b/i` → 0.8
   - **isa-deposit**: negative + `/\b(isa|stocks ?& ?shares|s&s isa)\b/i` → 0.75
   - **rental-income**: positive + `/\b(rent|rental|landlord)\b/i` → 0.85
   - **self-employment-income**: positive + `/\b(invoice|freelance|consult|self ?employ|stripe|paypal|wise)\b/i` → 0.7
   - **transfer**: `/\b(transfer|tfr|to savings|from savings)\b/i` → 0.6
   - Fallback: `unknown` if positive, `expense` if negative, confidence 0.3

6. `inferIncomes`: Sum amounts per category. `needsReview` = transactions with confidence < 0.6 AND `Math.abs(amount) > 500`.

7. Create `tests/parser.test.ts` with sample CSVs for Monzo, Starling, and a generic format. Verify:
   - Each format detected and parsed correctly
   - At least 5 transactions classified correctly per format
   - `inferIncomes` returns the correct totals on a fixture

8. Add sample CSV fixtures to `tests/fixtures/` (small, anonymised — invent realistic test data).

**Acceptance:**
- All tests pass
- Typecheck passes
- A salary transaction in a Monzo CSV is detected with confidence ≥ 0.9

**Stop here. Show test output before continuing.**

---

## Sprint 4 — Suggestions engine

**Goal:** A tax-saving suggestions engine that surfaces concrete, prioritised optimisations based on the user's situation.

**Deliverables:**

1. Create `src/lib/suggestions.ts` exporting:
   - `Suggestion` interface: `id`, `title`, `estimatedSaving`, `category` (`'pension' | 'isa' | 'allowance' | 'spousal' | 'charity' | 'structuring' | 'capital'`), `why`, `action`, `caveats: string[]`, `priority` (number, higher = more impactful)
   - `generateSuggestions(input: IncomeInputs)` function returning `{ suggestions: Suggestion[], baseline: TaxResult }`

2. Each suggestion is a pure function `(input, currentResult) => Suggestion | null`. Implement at least these seven:

   - **`pension-pa-recovery`** (priority 100) — only if `personalAllowanceLost > 0`. Recommend pension contribution to drop adjusted net income back to £100k. Estimated saving = `recommendedContrib × 0.60`.
   - **`marriage-allowance`** (priority 80) — only if neither flag set AND `grossIncome < personalAllowance`. Saving = `£1,260 × 0.20`.
   - **`higher-rate-pension`** (priority 75) — only if `marginalRate ≥ 0.40` AND headroom in annual allowance. Saving = `headroom × 0.20` (the extra relief beyond basic rate).
   - **`isa-shelter`** (priority 70) — only if user has savings or dividend income outside ISAs. Saving = `(savingsIncome + dividendIncome) × marginalRate × 0.5`.
   - **`gift-aid`** (priority 40) — only if higher-rate and not already claiming. Informational, saving = 0.
   - **`cgt-aea`** (priority 30) — always shown. Estimated saving = `£3,000 × marginalRate × 0.5`.
   - **`trading-property-allowance`** (priority 20) — only if `grossIncome < 100000`. Informational, saving = 0.

3. Sort by priority desc, then estimated saving desc.

4. Each suggestion must include:
   - `why` — explains why this applies to THIS user, with specific numbers
   - `action` — concrete step the user can take
   - `caveats` — 2–3 honest warnings (e.g. pension locks money until 55, ISA limit shared across all ISAs, etc.)

5. Create `tests/suggestions.test.ts`:
   - A £115k earner gets `pension-pa-recovery` as the top suggestion
   - A £30k earner does NOT get `pension-pa-recovery`
   - A £200k earner with £10k savings outside an ISA gets `isa-shelter` and `higher-rate-pension`
   - A £10k earner gets `marriage-allowance`

**Acceptance:**
- All tests pass, typecheck passes
- Top suggestion for a £115k earner is PA recovery via pension

**Stop here. Confirm before continuing.**

---

## Sprint 5 — Excel + JSON exports

**Goal:** Generate filing-ready Excel workbooks and machine-readable JSON.

**Deliverables:**

1. Create `src/lib/export.ts` exporting:
   - `ExportData` interface: `taxResult`, `transactions`, `incomes`, `suggestions`
   - `generateExcel(data): ArrayBuffer`
   - `generateJSON(data): string`

2. Excel workbook contains five sheets:
   - **Summary** — tax year, region, income breakdown, allowances, tax due, take-home, effective + marginal rates
   - **Band Breakdown** — every entry in `taxResult.breakdown` with band name, amount, rate, tax
   - **Transactions** — every classified transaction with date, description, amount, category, confidence
   - **SA100 helper** — figures keyed by HMRC box number:
     - SA102 box 1: Pay from employment
     - SA103S/F: Self-employment turnover
     - SA105 box 20: Rental income
     - SA100 interest box: Savings interest
     - SA100 dividends box: Dividends
     - SA100 TR4: Gift Aid (gross) and pension contributions (gross)
     - Plus a prominent "VERIFY against original payslips, P60, dividend vouchers" notice
   - **Suggestions** — title, category, estimated saving, why, action

3. Column widths set sensibly so the file looks clean when opened.

4. Use `XLSX.write(wb, { type: 'array', bookType: 'xlsx' })` to produce an `ArrayBuffer`.

5. Create an API route `app/api/export/route.ts` that accepts a POST with the export data and returns the XLSX as a download with `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and a `Content-Disposition: attachment; filename="uk-tax-{taxYear}.xlsx"`.

6. Create `tests/export.test.ts`:
   - Generating Excel from a fixture returns a non-empty ArrayBuffer
   - Parsing the result back with `XLSX.read` shows all five sheets exist
   - The Summary sheet contains the expected total tax figure

**Acceptance:**
- All tests pass
- Manual check: open the generated file in Excel/Numbers and verify formatting is clean

**Stop here.**

---

## Sprint 6 — AI agent

**Goal:** A conversational agent that answers UK personal tax questions, grounded in the user's calculated position and the rules data.

**Deliverables:**

1. Create `src/lib/agent.ts` exporting:
   - `AgentContext` interface: `taxResult`, `suggestions`, `rules`
   - `AgentMessage` interface: `role: 'user' | 'assistant'`, `content: string`
   - `askAgent(ctx, history, userMessage): Promise<string>`

2. System prompt must:
   - Lock the agent to UK personal income tax for the specified year
   - Inject the user's current `TaxResult` as structured JSON
   - Inject the key rules (PA, taper, bands, dividend allowance, PSA, ISA limit, CGT AEA, NI thresholds) so the agent doesn't hallucinate numbers
   - Forbid: regulated financial advice, aggressive tax avoidance schemes (DOTAS), overseas tax matters, IR35 specifics, non-resident status
   - Require: plain language, defining jargon, showing working when asked "how is X calculated", citing the user's actual figures when relevant
   - End with: "Always verify with a chartered tax adviser or HMRC for your exact situation."

3. Trim history to last 8 turns before sending to API.

4. Model: `claude-sonnet-4-5`. Max tokens 1024.

5. Create `app/api/agent/route.ts` — POST endpoint accepting `{ context, history, message }`. Returns `{ reply: string }`. Returns 503 with a clear message if `ANTHROPIC_API_KEY` is not set, so the UI can hide the agent gracefully.

6. The agent module must be designed so `askAgent` is swappable. Define an interface `AgentProvider` with `ask(ctx, history, message)` and implement `ClaudeAgent` and a stub `OllamaAgent` (throws "not implemented"). The API route picks based on env var `AGENT_PROVIDER` (default `claude`).

7. Create `tests/agent.test.ts` — only test the prompt construction (no live API calls):
   - System prompt includes the user's `grossIncome`
   - System prompt includes the correct personal allowance for the year
   - History trimming keeps last 8 messages only

**Acceptance:**
- Tests pass, typecheck passes
- POST to `/api/agent` with `ANTHROPIC_API_KEY` set returns a coherent reply
- POST to `/api/agent` without the key returns 503 with helpful message

**Stop here.**

---

## Sprint 7 — UI: upload + parse flow

**Goal:** First user-facing flow — upload bank statements, see classified transactions, confirm/correct inferred income.

**Deliverables:**

1. New route `app/upload/page.tsx`:
   - Drag-and-drop CSV upload (also click-to-browse)
   - Support uploading multiple statements (e.g. current account + savings account)
   - On upload, parse client-side (statements never leave the browser at this stage)
   - Show a table of classified transactions with category badges
   - Allow user to recategorise any transaction (dropdown per row)
   - Show inferred income summary panel (annualised if statement covers < 12 months — detect span from first/last date)

2. Store parsed data in React state + persist to localStorage under key `uk-tax-advisor:statements`.

3. Components in `src/components/`:
   - `<FileDropzone />` — drag/drop + file input, returns CSV text
   - `<TransactionsTable />` — virtualised if > 200 rows, with edit controls
   - `<IncomeSummary />` — card showing inferred income with edit-in-place

4. Editorial design: serif headers, generous whitespace, table borders are hairline, the accent colour only on actionable elements.

5. Add a prominent banner: "Your bank statements stay in your browser. They are never uploaded to any server."

6. Add a "Continue to calculation →" button that's only enabled when at least `earnedIncome` is set.

**Acceptance:**
- Drop a sample Monzo CSV and see transactions appear
- Recategorising a transaction updates the inferred income summary
- Page reload preserves the parsed state (from localStorage)
- Lighthouse accessibility score ≥ 95 on this page

**Stop here.**

---

## Sprint 8 — UI: tax calculation + breakdown

**Goal:** Show the user their full tax position with a clear, visual breakdown.

**Deliverables:**

1. New route `app/calculate/page.tsx`:
   - Pulls inferred income from localStorage (or shows a "go upload first" message if empty)
   - Form lets user adjust: tax year, region, pension contributions (gross), Gift Aid (gross), marriage allowance, blind person's allowance, student loan plan
   - Runs `calculateTax` on every change (it's fast, no debounce needed)
   - Shows result panels:
     - **Headline** — total tax + NI, take-home, effective rate, marginal rate
     - **Band breakdown** — horizontal stacked bar of bands, with hover for amount + rate per band
     - **Allowances used** — visual showing PA, dividend allowance, PSA, ISA headroom remaining
     - **Notes** — the `result.notes` array (e.g. "you lost £X of PA")

2. Components:
   - `<TaxHeadline />` — big numbers, serif
   - `<BandBreakdownBar />` — pure SVG, no chart library
   - `<AllowancesPanel />` — small visual cards
   - `<CalculationForm />` — accessible form with proper labels

3. Numbers formatted with `Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 })` for headlines, 2dp for breakdowns.

4. Add disclaimer: "Estimates only. Not regulated financial advice. Verify with HMRC or a chartered tax adviser before filing."

5. Persist form state to localStorage under `uk-tax-advisor:inputs`.

**Acceptance:**
- £60k earner from upload flow lands here and sees tax £11,432 + NI £3,210.60
- Adjusting pension contribution to £10k updates the figures instantly
- Form state survives reload

**Stop here.**

---

## Sprint 9 — UI: suggestions panel

**Goal:** Surface the suggestions engine output in a clear, ranked list with the ability to "apply" a suggestion (simulating its effect).

**Deliverables:**

1. New section on the `/calculate` page below the breakdown:
   - "Ways to reduce your tax" heading
   - List of suggestions sorted by priority
   - Each card: title, estimated saving badge, "Why" expandable, "Action" section, caveats as small print
   - "Apply this" button on suggestions that have a numerical lever (e.g. pension contribution): clicking it updates the form inputs to simulate the suggestion and the result panels recompute

2. Component: `<SuggestionCard />` with an `onApply?` callback.

3. When a suggestion is applied, show a small banner above the form: "Simulating: £15,000 pension contribution. [Revert]" The Revert button restores prior inputs.

**Acceptance:**
- A £115k earner sees PA-recovery as the top suggestion
- Clicking "Apply" sets pension to the recommended amount and refreshes the result
- Clicking "Revert" undoes it cleanly

**Stop here.**

---

## Sprint 10 — UI: AI agent chat

**Goal:** Conversational chat panel on the calculate page where users can ask questions about their tax.

**Deliverables:**

1. Floating chat panel on `/calculate`, collapsible. Initial state: collapsed with a prompt "Ask about your tax →".

2. When `ANTHROPIC_API_KEY` is missing, the chat shows a friendly message: "Agent unavailable — add `ANTHROPIC_API_KEY` to enable" with a link to the README setup section.

3. Chat UI:
   - Message bubbles, user right / assistant left
   - Suggested prompts on first open: "How is my tax calculated?", "Why did I lose personal allowance?", "What's the most tax-efficient way to give to charity?"
   - Loading indicator while awaiting reply
   - Streaming the reply word-by-word using SSE (use `response.body.getReader()` and emit text deltas from the API route via Claude's streaming API)

4. The chat posts to `/api/agent` with `{ context: { taxResult, suggestions, rules }, history, message }`.

5. History capped at 16 messages in UI state; the API route trims to 8.

6. Add the disclaimer at the bottom of the chat panel: "AI responses are estimates. Not regulated financial advice."

**Acceptance:**
- Asking "Why did I lose personal allowance?" on a £115k profile returns an accurate, specific answer citing the user's actual income
- Streaming works (text appears progressively, not in one chunk)
- Without API key, the panel shows the unavailable message gracefully

**Stop here.**

---

## Sprint 11 — UI: export

**Goal:** One-click Excel and JSON download.

**Deliverables:**

1. Export buttons on `/calculate`: "Download Excel", "Download JSON".

2. Excel button POSTs to `/api/export` and triggers a download.

3. JSON button generates client-side and triggers download via Blob.

4. Add a small "What's in this file?" expandable that lists the five sheets and what each contains.

5. Add an "SA100 helper" preview before download — show the user the figures that'll appear, so they can verify before opening Excel.

**Acceptance:**
- Excel downloads with all five sheets
- JSON downloads and is valid (parseable)
- SA100 helper preview matches what ends up in the Excel sheet

**Stop here.**

---

## Sprint 12 — Documentation, polish, release prep

**Goal:** A repo ready to publish publicly.

**Deliverables:**

1. Comprehensive `README.md`:
   - Project description + screenshot
   - Features list
   - Quick start (clone, install, run dev)
   - Configuration (env vars, especially `ANTHROPIC_API_KEY`)
   - Privacy notes — emphasise statements stay in browser; only the AI agent calls leave the device
   - Contributing guide pointer
   - **DISCLAIMER section** — this is not financial advice; users responsible for their own filings
   - License (MIT)

2. `CONTRIBUTING.md`:
   - How to add support for a new bank's CSV format
   - How to update tax rules for a new tax year (point to `src/lib/taxRules.ts`)
   - Testing requirements before PRs

3. `docs/TAX_RULES.md` — human-readable summary of every rule encoded in `taxRules.ts`, with sources. Annual updates to this doc go alongside annual updates to the rules.

4. `docs/CALCULATION_GUIDE.md` — explains the calculator's logic, especially:
   - Slice ordering (earned → savings → dividends)
   - Personal allowance allocation
   - Dividend allowance band-space behaviour
   - Band extension via pension/Gift Aid
   - The 60% trap

5. `docs/PRIVACY.md` — explicit page on what data goes where:
   - Statements parsed in-browser only
   - Calculation runs in-browser
   - The ONLY network call with user data is to `/api/agent` if the user opens the chat
   - localStorage usage and how to clear it

6. Add a `/about` page with the same disclaimer + privacy summary.

7. Add a footer to every page: "Open source · MIT · Not financial advice · [GitHub] · [Privacy]".

8. GitHub Actions workflow at `.github/workflows/ci.yml` — on PR: `npm ci`, `npm run typecheck`, `npm run test`, `npm run build`.

9. Bump version to `1.0.0` in `package.json`.

**Acceptance:**
- All docs written and proofread
- CI workflow runs green
- README has a working "Quick start" that someone unfamiliar can follow

**Stop here. v1 release.**

---

## Post-v1 ideas (not for this build)

- PDF statement parsing (pdfplumber + Tesseract for scanned PDFs)
- Multi-year comparison (run scenarios across tax years)
- CGT calculator for share/property disposals
- Self-employment expenses categoriser
- Direct HMRC filing via MTD APIs (regulated; needs HMRC agent authorisation)
- Ollama integration for fully offline agent
- More bank format support (Chase, First Direct, Co-op, Nationwide, Tide, Mettle)
- Pension annual allowance taper for very high earners
- IR35 helper for contractors

---

## Final note for Claude Code

When in doubt, stop and ask the user. This codebase will be used by real people to make real tax decisions. Correctness over speed. Sources cited over assumptions. Tests passing before moving on.
