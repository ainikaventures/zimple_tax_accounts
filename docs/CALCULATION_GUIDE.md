# How the calculator works

[`src/lib/taxCalculator.ts`](../src/lib/taxCalculator.ts) is one
function — `calculateTax(input: IncomeInputs): TaxResult` — but it
covers a few non-obvious mechanics. This file explains them so you can
reason about why a number is what it is and modify the calculator with
confidence.

## Conceptual model

HMRC taxes income in three slices, in order:

1. **Non-savings non-dividend income** (salary, self-employment,
   rental, pension drawdown). The calculator calls this collective
   bucket `earnedIncome`.
2. **Savings income** (interest from accounts and bonds).
3. **Dividend income** (UK dividends outside an ISA).

Each slice flows through the bands one after the other, building on
the position of the slice before it. So a £50k earner with £5k of
dividends ends up paying higher-rate dividend tax on most of those
dividends, even though their earned income alone wouldn't reach the
higher-rate band — because dividends sit *on top of* earned in the
band stack.

## Personal allowance

The standard PA (£12,570) is allocated **in slice order**:

1. As much as possible against `earnedIncome`.
2. Any remainder against `savingsIncome`.
3. Any remainder against `dividendIncome`.

So a £8,000-salary, £10,000-savings taxpayer:

```
PA = £12,570
PA on earned    = min(8000, 12570)  = 8000   → £0 taxable earned
PA on savings   = min(10000, 4570)  = 4570   → £5,430 taxable savings
PA on dividends = ...                = 0
```

### Marriage Allowance and Blind Person's Allowance

`receivesMarriageAllowance` adds £1,260 to PA. `transfersMarriageAllowance`
subtracts £1,260. `blindPersonsAllowance` adds £3,130. All three are
applied **after** the taper, so they're not themselves tapered.

### Personal-allowance taper

Adjusted net income (gross income minus gross pension minus Gift Aid)
between £100,000 and £125,140 tapers the standard £12,570 PA at £1 for
every £2 above the floor. Two implications:

- Pension contributions **reduce** ANI, so they can recover the PA
  pound-for-£2-contributed. This is the lever the `pension-pa-recovery`
  suggestion pulls.
- The marginal tax rate inside the taper band is *not* 40%. It's 40%
  (basic IT) + 20% (half of the band rate, because each extra £1 of
  income costs £0.50 of PA which is then taxed at 40%) + 2% (NI above
  UEL) = **62%** for an EWN higher-rate taxpayer in the band. Hence
  "the 60% trap". In Scotland it's higher again (45% advanced + 22.5%
  taper + 2% NI = 69.5%).

## Band extension via pension and Gift Aid

Gross pension contributions and gross Gift Aid donations **extend
every income tax band** outward by the contribution amount:

```
Basic band:       0 → 37,700 + extension
Higher band:    37,700 + extension → 125,140 + extension
Additional band: 125,140 + extension → ∞
```

So a £15,000 gross pension contribution by a £115k EWN earner:

1. Drops ANI to £100,000 → PA fully restored (£12,570).
2. Pushes the £125,140 boundary out to £140,140.
3. The taxable income £102,430 now falls partly into basic-rate band
   (£52,700 of it, since basic now runs 0 → £52,700) and partly into
   higher (£49,730 in the £52,700 → £140,140 band).

Net effect: £30,432 tax instead of £36,432. **Exactly £6,000 saved**
on the pension. The regression test asserts this at £0.01 tolerance —
it's the single best canary for "did I implement band extension
correctly?".

## Dividend allowance — band-space behaviour

The £500 dividend allowance is taxed at 0% but **still uses band
space**. HMRC's wording: "the dividend allowance does not reduce
total income for tax purposes".

Worked example: £50,000 salary + £5,000 dividends, EWN 2025/26.

```
PA = £12,570, all on earned
Taxable earned = £37,430 (entirely in basic band: 0 → £37,700)

Now we slice dividends. The cursor sits at £37,430.

First £500 (dividend allowance, 0%): cursor 37,430 → 37,930.
  Of this £500: £270 sits in the basic-rate band's remaining space
  (37,430 → 37,700), and £230 sits in the higher-rate band's space
  (37,700 → 37,930). Both at 0% — but both consumed band space.

Remaining £4,500 of dividends: cursor 37,930 → 42,430.
  All in higher rate (≤ £125,140). Taxed at the higher-rate dividend
  rate of 33.75% → £1,518.75.

Total tax: £7,486 (earned) + £1,518.75 (dividends) = £9,004.75.
```

If the dividend allowance *did* reduce income for tax purposes (the
intuitive reading) you'd instead expect £270 of the post-allowance
dividend to fall into basic-rate band space. It does not. The
regression test for this scenario asserts £9,004.75 — get it right.

## Starting rate for savings

A £5,000 band of savings income at 0%, *reduced £-for-£* by every £1
of taxable non-savings income above the personal allowance. So:

```
SR available = max(0, 5000 - taxableEarned)
```

This is consumed *before* the personal savings allowance.

## Personal savings allowance (PSA)

Classified by which UK band the taxpayer's earned income tops out in
(with band extension applied):

| Earned tops in...   | PSA       |
| ------------------- | --------- |
| Basic-rate band     | £1,000    |
| Higher-rate band    | £500      |
| Additional-rate band| £0        |

PSA categorisation uses **UK** bands even for Scottish taxpayers —
PSA is a UK-wide concept and Scottish savers still get £500 when
their UK-band-equivalent earned income falls in the £37,700 →
£125,140 range.

## Slice ordering, in code

The cursor walks through the (extended) bands in this order:

1. **Earned slice** — at the region-appropriate bands (Scotland or
   EWN earned bands).
2. **Savings slice** — at the UK earned bands' rates (savings always
   uses UK rates), with SR-for-savings and PSA prepended as 0%
   sub-portions that still advance the cursor.
3. **Dividend slice** — at the UK earned bands' positions, with the
   dividend allowance prepended as a 0% sub-portion, and each band's
   rate overridden to the corresponding dividend rate (8.75 / 33.75 /
   39.35%).

The cursor always advances; the bands are taken in order; allowances
that are "0%" still consume position.

## National Insurance

Class 1 employee NI, applied to **earned income only**:

```
NI(earned) =
    0                                      if earned <= primaryThreshold
    (earned - PT) * mainRate                if earned <= UEL
    (UEL - PT) * mainRate + (earned - UEL) * higherRate   otherwise
```

`mainRate` is 8%, `higherRate` is 2% (i.e. above the UEL the NI rate
drops). NI is computed off pre-pension earned income — pension
contributions do *not* reduce NI in this app (we don't model salary
sacrifice).

## Marginal rate

The headline "marginal rate" on the calculate page is the effective
rate on the **next £1 of earned income**, composed of:

- The income tax rate of the band containing `taxableEarned` (in the
  region-appropriate bands, after band extension);
- A 50%-of-the-band-rate uplift when adjusted net income sits in the
  PA-taper band (the 60% trap);
- The NI marginal rate (`0` below PT, `8%` between PT and UEL, `2%`
  above UEL).

For someone at £115k EWN: 40% + 20% + 2% = 62%.

## Take-home

`takeHome = grossIncome - totalIncomeTax - nationalInsurance`. We do
**not** subtract pension contributions or Gift Aid — those are
personal savings/giving decisions, not tax cost. If the user wants to
see "cash in pocket after pension", they subtract the net pension
themselves.

## Things to be careful of when changing the calculator

- **Don't move PA allocation order.** Earned → savings → dividends.
- **Don't strip the dividend-allowance band-space behaviour.** The
  £4,500 dividends in higher-rate space (Sprint 2 test 7) depends on
  it.
- **Don't extend only the basic band on pension contributions.** The
  brief explicitly says *every* band boundary moves — both 37,700 and
  125,140 shift outward by the gross contribution. The £6,000-saving
  test catches this.
- **PSA categorisation uses UK bands, not Scottish ones.** A Scottish
  intermediate-rate taxpayer (Scottish 21%) still gets £1,000 PSA, not
  £500.
- **Marginal rate includes NI and the taper uplift.** Several
  suggestions use `baseline.marginalRate` to size estimated savings;
  if the rate is wrong the savings estimates drift.

## Annual updates

When you add a new tax year (see CONTRIBUTING.md), the calculator
itself does not need to change — all the rules-driven figures come
from `getRules(taxYear)`. As long as the new `YearRules` object
follows the same shape, the calculator handles it.
