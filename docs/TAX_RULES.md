# UK personal income tax — rules encoded in `src/lib/taxRules.ts`

Human-readable summary of every rate, threshold, and allowance the
calculator uses. Update this file alongside any change to
[`src/lib/taxRules.ts`](../src/lib/taxRules.ts) so the prose and the
code stay in sync. All monetary amounts are in pounds; rates are
percentages.

## Sources

- **2025/26**: House of Commons Library briefing
  [CBP-10237](https://commonslibrary.parliament.uk/research-briefings/cbp-10237/)
  — *Income tax rates and allowances for 2025/26*.
- **2026/27**: House of Commons Library briefing
  [CBP-10618](https://commonslibrary.parliament.uk/research-briefings/cbp-10618/)
  — *Income tax rates and allowances for 2026/27*.
- **Scottish rates and bands**: gov.scot's
  [Scottish income tax rates and bands](https://www.gov.scot/publications/scottish-income-tax-rates-and-bands/)
  page (both years).
- **National Insurance**: HMRC's published rate and threshold tables
  for Class 1 (employee) and Class 4 (self-employed).

All figures cross-checked against these sources at the time of writing
(May 2026). Verify against the live sources before relying on them for
filings.

## Personal allowance

| Item                                                | Value     | Both years |
| --------------------------------------------------- | --------- | ---------- |
| Personal allowance (income tax)                     | £12,570   | ✓          |
| Marriage Allowance (transferable)                   | £1,260    | ✓          |
| Blind Person's Allowance                            | £3,130    | ✓          |
| Personal-allowance taper start (adjusted net income) | £100,000  | ✓          |
| Personal-allowance taper end (PA exhausted at ANI)  | £125,140  | ✓          |

The personal allowance reduces by £1 for every £2 of adjusted net
income above £100,000 and is fully exhausted at £125,140. The taper
window is the well-known "60% trap" — a higher-rate taxpayer in this
band loses 50p of PA for every extra £1 earned, so the effective
marginal rate climbs to roughly 60% (or 63%+ in Scotland).

Marriage Allowance and Blind Person's Allowance are layered on top of
the (already-tapered) standard personal allowance.

## Income tax bands — England, Wales & Northern Ireland

Both 2025/26 and 2026/27, defined in **taxable** income (after PA):

| Band            | Taxable income range          | Rate |
| --------------- | ----------------------------- | ---- |
| Basic rate      | £0 – £37,700                  | 20%  |
| Higher rate     | £37,700 – £125,140            | 40%  |
| Additional rate | over £125,140                 | 45%  |

The additional-rate threshold is held at £125,140 of **taxable** (not
gross) income; by the time a taxpayer reaches it the personal
allowance has fully tapered, so taxable and gross income coincide.

## Income tax bands — Scotland (earned income only)

Scottish bands apply to non-savings non-dividend income; savings and
dividend income always use UK-wide rates regardless of region.

### 2025/26

| Band              | Taxable income range (after standard £12,570 PA) | Rate |
| ----------------- | ------------------------------------------------ | ---- |
| Starter rate      | £0 – £2,827                                      | 19%  |
| Basic rate        | £2,827 – £14,921                                 | 20%  |
| Intermediate rate | £14,921 – £31,092                                | 21%  |
| Higher rate       | £31,092 – £62,430                                | 42%  |
| Advanced rate     | £62,430 – £112,570                               | 45%  |
| Top rate          | over £112,570                                    | 48%  |

### 2026/27

The Scottish Budget for 2026/27 widened the starter band top to
£16,537 and the basic band top to £29,526. Other thresholds are
unchanged from 2025/26.

| Band              | Taxable income range (after standard £12,570 PA) | Rate |
| ----------------- | ------------------------------------------------ | ---- |
| Starter rate      | £0 – £3,967                                      | 19%  |
| Basic rate        | £3,967 – £16,956                                 | 20%  |
| Intermediate rate | £16,956 – £31,092                                | 21%  |
| Higher rate       | £31,092 – £62,430                                | 42%  |
| Advanced rate     | £62,430 – £112,570                               | 45%  |
| Top rate          | over £112,570                                    | 48%  |

## Savings income

| Item                                  | Value   | Notes                                           |
| ------------------------------------- | ------- | ----------------------------------------------- |
| Starting rate for savings band        | £5,000  | At 0%                                           |
| Starting rate for savings — reduction | £-for-£ | Each £1 of taxable non-savings income reduces the available SR-for-savings band by £1. So if taxable earned ≥ £5,000, no starting rate is available. |
| Personal savings allowance (basic-rate band)      | £1,000  | At 0%; still uses band space.       |
| Personal savings allowance (higher-rate band)     | £500    | At 0%; still uses band space.       |
| Personal savings allowance (additional-rate band) | £0      | No allowance for top-band taxpayers. |

PSA categorisation uses the UK band the taxpayer's earned income tops
out in (not the Scottish band) — Scottish savers still get the
"higher-rate" £500 PSA when their UK-band-equivalent earned income
falls into the £37,700–£125,140 range.

## Dividend income

| Item                              | Value   | Both years |
| --------------------------------- | ------- | ---------- |
| Dividend allowance                | £500    | ✓          |
| Dividend rate — basic-rate band   | 8.75%   | ✓          |
| Dividend rate — higher-rate band  | 33.75%  | ✓          |
| Dividend rate — additional-rate band | 39.35% | ✓         |

The dividend allowance is taxed at 0% but **still consumes band
space** — HMRC's view is that "the dividend allowance does not reduce
total income for tax purposes". So a £5 dividend after the allowance
on a taxpayer whose earned income is £37,500 falls partly into basic
and partly into higher rate.

## National Insurance

### Class 1 (employee)

| Item                          | 2025/26  | 2026/27  |
| ----------------------------- | -------- | -------- |
| Primary threshold (annual)    | £12,570  | £12,584  |
| Upper earnings limit (annual) | £50,270  | £50,284  |
| Main rate                     | 8%       | 8%       |
| Above-UEL rate                | 2%       | 2%       |

### Class 4 (self-employed)

| Item                    | Both years |
| ----------------------- | ---------- |
| Lower profits limit     | £12,570    |
| Upper profits limit     | £50,270    |
| Main rate               | 6%         |
| Above-UPL rate          | 2%         |

## Capital gains tax

| Item                              | Value   | Both years |
| --------------------------------- | ------- | ---------- |
| Annual exempt amount              | £3,000  | ✓          |
| Non-residential rate — basic band | 18%     | ✓          |
| Non-residential rate — higher band | 24%    | ✓          |
| Residential rate — basic band     | 18%     | ✓          |
| Residential rate — higher band    | 24%     | ✓          |

CGT is not actually computed by this app's income-tax engine — the
figures are surfaced in the suggestions panel (`cgt-aea`) and the
SA100 helper sheet so the user can plan around them.

## Other allowances and limits

| Item                            | Value    | Both years |
| ------------------------------- | -------- | ---------- |
| ISA annual allowance            | £20,000  | ✓          |
| Pension annual allowance        | £60,000  | ✓          |
| Trading-income allowance        | £1,000   | ✓          |
| Property-income allowance       | £1,000   | ✓          |
| Gift Aid basic-rate gross-up    | 20%      | ✓          |

The pension annual allowance can taper down to as little as £10,000
for very high earners under the tapered annual allowance rules; this
app does **not** implement that taper, on the basis that it only
affects users above ~£260k of adjusted income who realistically use
a professional adviser.

## What's deliberately out of scope

- Tapered annual allowance for pensions (>£260k adjusted income).
- Student loan repayments (Plan 1/2/4/5/postgrad).
- Non-residency, split-year, and remittance basis rules.
- IR35 off-payroll-working determinations.
- CGT computation on disposals (only the allowance is surfaced).
- VAT, IHT, corporation tax — this is a personal income tax tool.
- Marriage Allowance eligibility checks (the form just toggles the
  effect; the user is responsible for confirming they qualify).

## Sanity-check matrix

Hand-computed expected values used by the regression tests in
[`tests/calculator.test.ts`](../tests/calculator.test.ts):

| Scenario (2025/26 EWN unless noted)             | Expected income tax | Expected NI       |
| ----------------------------------------------- | ------------------- | ----------------- |
| £10,000 earned                                  | £0                  | £0                |
| £30,000 earned                                  | £3,486              | £1,394.40         |
| £60,000 earned                                  | £11,432             | £3,210.60         |
| £115,000 earned (PA tapered to £5,070)          | £36,432             | (£4,310.60)       |
| £160,000 earned (PA tapered to £0)              | £58,203             | —                 |
| £115,000 earned + £15,000 gross pension         | £30,432 (£6,000 saving) | —             |
| £50,000 earned + £5,000 dividends               | £9,004.75           | —                 |
| £50,000 earned (Scotland)                       | £9,013.80           | —                 |
| £30,000 earned (2026/27)                        | £3,486 (unchanged)  | —                 |
