# Contributing

Thanks for considering a contribution. This file collects the patterns
the project uses; following them keeps reviews fast and the tax numbers
correct.

## Ground rules

- **Correctness over speed.** This codebase is used by real people for
  real filings. Don't ship something whose tax figures you haven't
  verified.
- **Tests pass before you open a PR.** `npm run typecheck && npm run
  test && npm run build` should all succeed locally; CI runs the same
  three commands.
- **Every file gets a top-of-file comment** explaining what it does and
  why it exists. New files without one will be asked to add one.
- **Tax rules are read-only data.** Hardcode rate numbers, thresholds,
  and allowances *only* in `src/lib/taxRules.ts`. Everything else
  imports from there.
- **All currency values are stored as numbers in pounds.** Formatting
  happens at render time via `src/lib/format.ts`.
- **Anthropic API keys are never read in client-side code.** Keys go in
  `.env.local` and are only read in `app/api/*` routes. Browser-side
  BYOK keys live in `localStorage` under the agent's own key, separate
  from any operator-side env var.

## How to add support for a new bank's CSV format

The CSV parser auto-detects the bank from the header row and dispatches
to a per-format extractor. Adding a new bank is three small steps:

1. **Detection.** Update `detectFormat()` in
   [`src/lib/statementParser.ts`](./src/lib/statementParser.ts) with a
   header check unique to that bank. Order matters — the generic
   fallback runs last, so put the new check before it.

2. **Extractor.** Add a new `extractMyBank(headers, rows)` function
   following the same shape as `extractMonzo` / `extractStarling` /
   `extractLloyds` / `extractGeneric`. Each transaction must produce:

   - `date: Date` (skip the row if `parseDate` returns null)
   - `description: string` — combine counterparty + reference / notes so
     the classifier has something to match against
   - `amount: number` (positive = credit, negative = debit, in pounds)
   - `balance?: number`
   - `raw: Record<string, string>` — the original column-keyed row

3. **Dispatch.** Wire the new format into the `switch` statement at the
   bottom of `parseCSV()` and add a `BankFormat` member.

Then:

4. **Test fixture.** Add a sample CSV with 6–10 transactions to
   [`tests/fixtures/`](./tests/fixtures/), naming it
   `<bank>-sample.csv`. Pick transactions that exercise at least five
   classifier categories (salary, savings interest, dividend, pension
   contribution, etc.). Use realistic but invented values — never check
   in your own real bank statements.

5. **Test case.** Add a section to
   [`tests/parser.test.ts`](./tests/parser.test.ts) that:
   - Asserts `parsed.format` matches the new `BankFormat` value.
   - Asserts the expected transaction count.
   - Asserts at least five classifications into real categories.
   - Asserts the full `inferIncomes` totals.

The classifier itself usually doesn't need changes — the regex rules in
`src/lib/statementParser.ts` are general enough that any reasonable
description will match. If your bank uses unusual wording (e.g. "Cred
Int" instead of "credit interest"), extend the regex in the affected
`ClassifierRule` and add a fixture row that proves it works.

## How to update tax rules for a new tax year

UK tax bands change roughly once a year (April 6). The full data flow is:

1. **Add a `RULES_YYYY_YY` constant** to
   [`src/lib/taxRules.ts`](./src/lib/taxRules.ts). The simplest form is
   a spread over the previous year's rules with the deltas applied:

   ```ts
   export const RULES_2027_28: YearRules = {
     ...RULES_2026_27,
     taxYear: "2027/28",
     ni: { ...RULES_2026_27.ni, primaryThreshold: 12598 /* etc. */ },
   };
   ```

2. **Extend the `TaxYear` union and `ALL_RULES` map** in the same file:

   ```ts
   export type TaxYear = "2025/26" | "2026/27" | "2027/28";
   export const ALL_RULES: Record<TaxYear, YearRules> = {
     "2025/26": RULES_2025_26,
     "2026/27": RULES_2026_27,
     "2027/28": RULES_2027_28,
   };
   ```

3. **Update `taxYearForDate()`** so the date pivot recognises the new
   year, and ensure unsupported years still throw cleanly.

4. **Cross-check every figure** against:
   - the House of Commons Library briefing for that year (search
     "Income tax rates and allowances CBP-XXXXX");
   - gov.scot's Scottish income tax rates and bands page;
   - HMRC's published NI rate-and-threshold tables for Class 1 and
     Class 4.

   Put the document numbers and URLs in the file header alongside the
   existing 2025/26 and 2026/27 citations.

5. **Update [`docs/TAX_RULES.md`](./docs/TAX_RULES.md)** with the new
   year's headline figures so the human-readable summary stays in sync
   with the code.

6. **Add a test scenario** to
   [`tests/calculator.test.ts`](./tests/calculator.test.ts) that
   exercises the new bands or thresholds. At minimum, include a £30k
   earner test against the new year — that's the simplest "did the
   defaults wire up?" check.

## How the test suite is structured

No framework — each test file is a standalone `tsx` script that prints
`✓` / `✗` markers and exits non-zero on failure. To add a new test
file:

1. Create `tests/<area>.test.ts`. Use the existing files as templates
   for the assertion helpers (`ok`, `eq`, `eqNumber`).
2. Run it directly: `npx tsx tests/<area>.test.ts`.
3. `npm run test` picks it up automatically — the script globs every
   `tests/*.test.ts` and exits non-zero on the first failing file.

Browser-side UI changes don't have an automated test runner; verify
them manually with `npm run dev` and the Playwright steps documented
in the relevant sprint commit message.

## Tests required before opening a PR

```bash
npm run typecheck   # must pass clean
npm run test        # all assertions across all test files must pass
npm run build       # production build must succeed
```

CI in [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs the
same three commands on every push and pull request. PRs that fail CI
won't be merged.

## Style notes

- TypeScript strict mode. No `any` — narrow types properly or use
  `unknown` + a type guard.
- React components use `"use client"` only when they need it (state,
  effects, event handlers). Keep server components where possible.
- Tailwind for styling — no inline styles unless dynamic (e.g. SVG
  fill values). Pull from the design tokens in
  [`app/globals.css`](./app/globals.css) (`text-ink`, `text-muted`,
  `bg-paper`, `border-rule`, `bg-accent`) rather than introducing new
  colours per-component.
- Editorial design language: serif headlines (Source Serif 4), sans
  body (IBM Plex Sans), hairline rules, accent burgundy only on
  actionable elements.

## Licence on contributions

By contributing, you agree your contribution is licensed under the
project's [PolyForm Noncommercial Licence 1.0.0](./LICENSE). For
contributions that warrant commercial use beyond that, please discuss
with the project owner via an issue first.
