/* src/lib/taxCalculator.ts — UK personal income tax calculator.
 *
 * Pure function that turns user-supplied income figures into a complete tax
 * computation: bands used, allowances applied, NI, marginal rate, take-home
 * pay, and human-readable notes. Every figure comes from src/lib/taxRules.ts;
 * no rate or threshold is hardcoded here.
 *
 * Calculation rules (from info/PROJECT_BRIEF.md Sprint 2 and HMRC's actual
 * mechanics — see docs/CALCULATION_GUIDE.md, added in Sprint 12, for prose):
 *
 *   1. Income is sliced in the HMRC order: non-savings non-dividend first
 *      ("earned" — also covers pension and rental income aggregated upstream),
 *      then savings, then dividends.
 *   2. The personal allowance is allocated against earned first, then savings,
 *      then dividends — taking as much from each as that slice can absorb.
 *   3. The PA tapers away above £100,000 of *adjusted net income* (gross
 *      income minus gross pension contributions minus Gift Aid). £1 lost for
 *      every £2 above the threshold; PA is fully gone at £125,140 of ANI.
 *   4. Pension contributions and Gift Aid extend every band boundary by the
 *      gross contribution amount — basic, higher, and additional thresholds
 *      all shift outward. This is how relief-at-source higher-rate relief
 *      works.
 *   5. The dividend allowance (£500) sits at 0% but *does* consume band
 *      space — the cursor advances. Same for the starting-rate-for-savings
 *      (£5,000, reduced £1-for-£1 by taxable non-savings income) and the
 *      personal savings allowance (£1,000 / £500 / £0 by band).
 *   6. Scottish taxpayers use their region's bands for *earned* income only;
 *      savings and dividends always use UK-wide bands and rates.
 *   7. National insurance applies to earned income only. Below the primary
 *      threshold: nothing. Between PT and the upper earnings limit: 8% (Class
 *      1 main rate). Above the UEL: 2%.
 *   8. The reported marginal rate is the effective rate on the next £1 of
 *      *earned* income — band rate + 50% PA-taper uplift when in the £100k–
 *      £125,140 band + NI marginal rate. This is what the suggestions engine
 *      uses to estimate the value of a pension contribution.
 *
 * All monetary values are floats in pounds. Tests in tests/calculator.test.ts
 * use a £1 tolerance for most assertions and an exact (£0.01) tolerance for
 * the pension-relief test, which is the canary for incorrect band extension. */

import {
  type Region,
  type TaxBand,
  type TaxYear,
  type YearRules,
  getRules,
} from "./taxRules";

/**
 * User-supplied inputs to the calculator. Every monetary field is in pounds.
 * Income amounts are *gross* (before any tax). Pension and Gift Aid amounts
 * are *gross* — i.e. the figure including the 20% relief at source already
 * added by the pension provider / charity.
 */
export interface IncomeInputs {
  /** Non-savings non-dividend income — salary, self-employment, rental,
   *  pension income received. Required. */
  earnedIncome: number;
  /** Interest from savings accounts and bonds. */
  savingsIncome?: number;
  /** Dividend income from stocks held outside an ISA. */
  dividendIncome?: number;
  /** Gross pension contributions for the year (including relief at source). */
  pensionContributionsGross?: number;
  /** Gross Gift Aid donations for the year (including 25% top-up). */
  giftAidGross?: number;
  /** Tax residency for band purposes. Defaults to England/Wales/NI. */
  region?: Region;
  /** Tax year. Defaults to 2025/26. */
  taxYear?: TaxYear;
  /** True if the user *receives* a Marriage Allowance transfer from their
   *  spouse (adds £1,260 to PA). */
  receivesMarriageAllowance?: boolean;
  /** True if the user *transfers* their Marriage Allowance to a spouse
   *  (subtracts £1,260 from PA). */
  transfersMarriageAllowance?: boolean;
  /** True if the user is registered blind (adds £3,130 to PA). */
  blindPersonsAllowance?: boolean;
  /** Student loan repayment plan, if any. Reserved for a future sprint —
   *  not consumed by the calculator yet. */
  studentLoanPlan?: "1" | "2" | "4" | "5" | "postgrad";
}

/**
 * One row of the band-by-band breakdown. The `bandName` includes a slice
 * suffix where ambiguous — e.g. "Higher rate (dividends)" — so the UI can
 * render the result without knowing the calculator's internal structure.
 */
export interface BandBreakdown {
  bandName: string;
  taxableInBand: number;
  rate: number;
  tax: number;
}

/**
 * Full result of a tax calculation. Every field is precomputed; the UI does
 * no maths beyond currency formatting. Currency values are floats in pounds;
 * rates are decimal fractions (0.20 = 20%).
 */
export interface TaxResult {
  taxYear: TaxYear;
  region: Region;
  grossIncome: number;
  /** Personal allowance actually applied (after taper, MA, and BPA). */
  personalAllowance: number;
  /** Amount of the *standard* PA tapered away above £100k of ANI. Excludes
   *  MA / BPA adjustments (which are not subject to taper). */
  personalAllowanceLost: number;
  /** Earned income left after subtracting PA. */
  taxableEarned: number;
  /** Savings income left after subtracting any PA spillover. */
  taxableSavings: number;
  /** Dividend income left after subtracting any PA spillover. */
  taxableDividends: number;
  incomeTaxOnEarned: number;
  incomeTaxOnSavings: number;
  incomeTaxOnDividends: number;
  totalIncomeTax: number;
  /** Class 1 employee NI (earned income only). */
  nationalInsurance: number;
  totalTaxAndNI: number;
  /** Total tax + NI as a fraction of gross income (0.20 = 20%). */
  effectiveRate: number;
  /** Marginal rate on the next £1 of *earned* income, including NI and any
   *  PA-taper uplift. Used by the suggestions engine. */
  marginalRate: number;
  /** Gross income minus total tax and NI. Does NOT subtract pension or
   *  Gift Aid contributions — those are personal savings/giving decisions. */
  takeHome: number;
  /** Band-by-band breakdown including allowance "0%" entries. */
  breakdown: BandBreakdown[];
  /** Human-readable notes about edge cases, taper, the 60% trap, etc. */
  notes: string[];
}

/**
 * Return a fresh band schedule with each boundary shifted outward by
 * `extension`. The very bottom (lower bound 0) of the first band stays at 0,
 * and the top of the last band stays at Infinity — only "real" thresholds
 * move. With extension = 0 this is just a shallow copy.
 */
function extendBands(bands: TaxBand[], extension: number): TaxBand[] {
  return bands.map((band) => ({
    ...band,
    from: band.from === 0 ? 0 : band.from + extension,
    to: band.to === Infinity ? Infinity : band.to + extension,
  }));
}

/**
 * Find the band that contains `position` in taxable-income space, using the
 * half-open convention `from <= position < to`. Returns null if no band
 * matches (which shouldn't happen for a well-formed band schedule with the
 * top band ending at Infinity).
 */
function bandContaining(bands: TaxBand[], position: number): TaxBand | null {
  for (const band of bands) {
    if (position >= band.from && position < band.to) return band;
  }
  return null;
}

/**
 * Map an EWN band name to the corresponding dividend rate. Used when slicing
 * dividend income across UK bands — the bands give us the position, but
 * dividends are taxed at their own rates (8.75 / 33.75 / 39.35 %).
 */
function dividendRateForBand(
  bandName: string,
  rates: YearRules["dividendRates"],
): number {
  if (bandName === "Basic rate") return rates.basic;
  if (bandName === "Higher rate") return rates.higher;
  return rates.additional;
}

/**
 * Calculate UK personal income tax and NI for one taxpayer-year.
 */
export function calculateTax(input: IncomeInputs): TaxResult {
  const taxYear: TaxYear = input.taxYear ?? "2025/26";
  const region: Region = input.region ?? "england-wales-ni";
  const rules = getRules(taxYear);

  const earned = input.earnedIncome;
  const savings = input.savingsIncome ?? 0;
  const dividends = input.dividendIncome ?? 0;
  const pensionGross = input.pensionContributionsGross ?? 0;
  const giftAidGross = input.giftAidGross ?? 0;

  const grossIncome = earned + savings + dividends;
  const adjustedNetIncome = grossIncome - pensionGross - giftAidGross;

  // ---- Personal allowance: taper, then MA / BPA adjustments ----
  const standardPA = rules.personalAllowance;
  const taperAmount = Math.max(
    0,
    (adjustedNetIncome - rules.personalAllowanceTaperStart) / 2,
  );
  const taperedStandardPA = Math.max(0, standardPA - taperAmount);
  const personalAllowanceLost = standardPA - taperedStandardPA;

  const maAdjustment =
    (input.receivesMarriageAllowance ? rules.marriageAllowance : 0) -
    (input.transfersMarriageAllowance ? rules.marriageAllowance : 0);
  const bpaAdjustment = input.blindPersonsAllowance
    ? rules.blindPersonsAllowance
    : 0;
  const personalAllowance = Math.max(
    0,
    taperedStandardPA + maAdjustment + bpaAdjustment,
  );

  // ---- PA allocation: earned, then savings, then dividends ----
  const paOnEarned = Math.min(earned, personalAllowance);
  let paLeft = personalAllowance - paOnEarned;
  const paOnSavings = Math.min(savings, paLeft);
  paLeft -= paOnSavings;
  const paOnDividends = Math.min(dividends, paLeft);

  const taxableEarned = earned - paOnEarned;
  const taxableSavings = savings - paOnSavings;
  const taxableDividends = dividends - paOnDividends;

  // ---- Band extension from pension + Gift Aid ----
  const bandExtension = pensionGross + giftAidGross;
  const earnedBandsBase =
    region === "scotland"
      ? rules.incomeTaxBandsScotland
      : rules.incomeTaxBandsEWN;
  const earnedBands = extendBands(earnedBandsBase, bandExtension);
  // UK bands are also used to position savings and dividends (which always
  // use UK-wide rates and bands regardless of region) and to categorise PSA.
  const ukBands = extendBands(rules.incomeTaxBandsEWN, bandExtension);

  const breakdown: BandBreakdown[] = [];
  let cursor = 0;

  // ---- Earned slice ----
  let incomeTaxOnEarned = 0;
  if (taxableEarned > 0) {
    let remaining = taxableEarned;
    for (const band of earnedBands) {
      if (remaining <= 0) break;
      if (cursor >= band.to) continue;
      const inBand = Math.min(remaining, band.to - cursor);
      if (inBand > 0) {
        const tax = inBand * band.rate;
        breakdown.push({
          bandName: band.name,
          taxableInBand: inBand,
          rate: band.rate,
          tax,
        });
        incomeTaxOnEarned += tax;
        cursor += inBand;
        remaining -= inBand;
      }
    }
  }

  // ---- Savings slice: SR-for-savings, then PSA, then UK band rates ----
  // Starting rate for savings is reduced £1-for-£1 by taxable non-savings
  // income, so once a taxpayer's earned income exceeds £5,000 above PA the
  // starting rate is fully consumed.
  const startingRateForSavings = Math.max(
    0,
    rules.startingRateForSavings - taxableEarned,
  );

  // Personal savings allowance: categorised by where the user's *earned*
  // income tops out in UK bands (with any extension applied). Scottish
  // intermediate-rate taxpayers still get the basic-rate £1,000 PSA because
  // PSA categorisation uses UK bands, not Scottish ones.
  const ukBasicTop = ukBands[0].to;
  const ukHigherTop = ukBands[1].to;
  let psaAllowance: number;
  if (taxableEarned >= ukHigherTop) {
    psaAllowance = rules.personalSavingsAllowance.additionalRate;
  } else if (taxableEarned >= ukBasicTop) {
    psaAllowance = rules.personalSavingsAllowance.higherRate;
  } else {
    psaAllowance = rules.personalSavingsAllowance.basicRate;
  }

  let incomeTaxOnSavings = 0;
  if (taxableSavings > 0) {
    let remaining = taxableSavings;

    const srApplied = Math.min(remaining, startingRateForSavings);
    if (srApplied > 0) {
      breakdown.push({
        bandName: "Starting rate for savings",
        taxableInBand: srApplied,
        rate: rules.startingRateForSavingsRate,
        tax: 0,
      });
      cursor += srApplied;
      remaining -= srApplied;
    }

    const psaApplied = Math.min(remaining, psaAllowance);
    if (psaApplied > 0) {
      breakdown.push({
        bandName: "Personal savings allowance",
        taxableInBand: psaApplied,
        rate: 0,
        tax: 0,
      });
      cursor += psaApplied;
      remaining -= psaApplied;
    }

    for (const band of ukBands) {
      if (remaining <= 0) break;
      if (cursor >= band.to) continue;
      const inBand = Math.min(remaining, band.to - cursor);
      if (inBand > 0) {
        const tax = inBand * band.rate;
        breakdown.push({
          bandName: `${band.name} (savings)`,
          taxableInBand: inBand,
          rate: band.rate,
          tax,
        });
        incomeTaxOnSavings += tax;
        cursor += inBand;
        remaining -= inBand;
      }
    }
  }

  // ---- Dividend slice: dividend allowance, then dividend rates ----
  let incomeTaxOnDividends = 0;
  if (taxableDividends > 0) {
    let remaining = taxableDividends;

    const daApplied = Math.min(remaining, rules.dividendAllowance);
    if (daApplied > 0) {
      // The dividend allowance is at 0% but still consumes band space. It is
      // emitted as a single breakdown entry regardless of which band(s) it
      // straddles — the cursor advances by `daApplied`, so subsequent slices
      // pick up at the right position.
      breakdown.push({
        bandName: "Dividend allowance",
        taxableInBand: daApplied,
        rate: 0,
        tax: 0,
      });
      cursor += daApplied;
      remaining -= daApplied;
    }

    for (const band of ukBands) {
      if (remaining <= 0) break;
      if (cursor >= band.to) continue;
      const inBand = Math.min(remaining, band.to - cursor);
      if (inBand > 0) {
        const divRate = dividendRateForBand(band.name, rules.dividendRates);
        const tax = inBand * divRate;
        breakdown.push({
          bandName: `${band.name} (dividends)`,
          taxableInBand: inBand,
          rate: divRate,
          tax,
        });
        incomeTaxOnDividends += tax;
        cursor += inBand;
        remaining -= inBand;
      }
    }
  }

  // ---- National insurance (Class 1 employee, earned income only) ----
  const niCfg = rules.ni;
  let nationalInsurance = 0;
  if (earned > niCfg.primaryThreshold) {
    const upperBoundary = Math.min(earned, niCfg.upperEarningsLimit);
    const inMainBand = upperBoundary - niCfg.primaryThreshold;
    nationalInsurance += inMainBand * niCfg.mainRate;
    if (earned > niCfg.upperEarningsLimit) {
      nationalInsurance +=
        (earned - niCfg.upperEarningsLimit) * niCfg.higherRate;
    }
  }

  // ---- Marginal rate on the next £1 of earned income ----
  let marginalIncomeTax = 0;
  const currentBand = bandContaining(earnedBands, taxableEarned);
  if (currentBand && (taxableEarned > 0 || earned > personalAllowance)) {
    marginalIncomeTax = currentBand.rate;
  }
  // PA-taper uplift: every extra £1 of earned income above the taper start
  // loses £0.50 of PA, which is then taxed at the band rate. Effective extra
  // rate is half the band rate, only inside the taper window.
  if (
    adjustedNetIncome > rules.personalAllowanceTaperStart &&
    adjustedNetIncome < rules.personalAllowanceTaperEnd &&
    marginalIncomeTax > 0
  ) {
    marginalIncomeTax += 0.5 * marginalIncomeTax;
  }

  let niMarginal = 0;
  if (earned >= niCfg.upperEarningsLimit) {
    niMarginal = niCfg.higherRate;
  } else if (earned >= niCfg.primaryThreshold) {
    niMarginal = niCfg.mainRate;
  }

  const marginalRate = marginalIncomeTax + niMarginal;

  // ---- Totals ----
  const totalIncomeTax =
    incomeTaxOnEarned + incomeTaxOnSavings + incomeTaxOnDividends;
  const totalTaxAndNI = totalIncomeTax + nationalInsurance;
  const takeHome = grossIncome - totalTaxAndNI;
  const effectiveRate = grossIncome > 0 ? totalTaxAndNI / grossIncome : 0;

  // ---- Notes ----
  const notes: string[] = [];
  if (personalAllowanceLost > 0 && personalAllowanceLost < standardPA) {
    notes.push(
      `Your adjusted net income exceeds £${rules.personalAllowanceTaperStart.toLocaleString("en-GB")}, so £${Math.round(personalAllowanceLost).toLocaleString("en-GB")} of your personal allowance has been tapered away.`,
    );
  } else if (personalAllowanceLost >= standardPA && standardPA > 0) {
    notes.push(
      `Your adjusted net income has reached £${rules.personalAllowanceTaperEnd.toLocaleString("en-GB")}, so your personal allowance has been fully tapered to £0.`,
    );
  }
  if (
    adjustedNetIncome > rules.personalAllowanceTaperStart &&
    adjustedNetIncome < rules.personalAllowanceTaperEnd
  ) {
    notes.push(
      "You are in the personal-allowance taper band — every extra £1 of income loses 50p of allowance, producing an effective marginal rate of around 60% (higher in Scotland).",
    );
  }
  if (input.receivesMarriageAllowance) {
    notes.push(
      `Marriage allowance received: personal allowance increased by £${rules.marriageAllowance.toLocaleString("en-GB")}.`,
    );
  }
  if (input.transfersMarriageAllowance) {
    notes.push(
      `Marriage allowance transferred to spouse: personal allowance reduced by £${rules.marriageAllowance.toLocaleString("en-GB")}.`,
    );
  }
  if (input.blindPersonsAllowance) {
    notes.push(
      `Blind person's allowance applied: personal allowance increased by £${rules.blindPersonsAllowance.toLocaleString("en-GB")}.`,
    );
  }
  if (bandExtension > 0) {
    notes.push(
      `Pension and Gift Aid contributions (£${Math.round(bandExtension).toLocaleString("en-GB")}) extended every tax band, giving higher-rate relief above basic rate.`,
    );
  }

  return {
    taxYear,
    region,
    grossIncome,
    personalAllowance,
    personalAllowanceLost,
    taxableEarned,
    taxableSavings,
    taxableDividends,
    incomeTaxOnEarned,
    incomeTaxOnSavings,
    incomeTaxOnDividends,
    totalIncomeTax,
    nationalInsurance,
    totalTaxAndNI,
    effectiveRate,
    marginalRate,
    takeHome,
    breakdown,
    notes,
  };
}
