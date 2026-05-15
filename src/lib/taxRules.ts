/* src/lib/taxRules.ts — single source of truth for UK personal income tax rules.
 *
 * Encodes every rule the calculator needs for tax years 2025/26 and 2026/27 in
 * one canonical module. Nothing else in the codebase should hardcode rate
 * numbers, thresholds, or allowances — import from here instead. When HMRC or
 * the Scottish Government publishes new rules for a future year, add a new
 * `RULES_YYYY_YY` constant and extend the `TaxYear` union; the rest of the
 * application picks it up through `getRules()`.
 *
 * All monetary amounts are in pounds (number). Rates are decimal fractions
 * (0.20 means 20%), not percentages.
 *
 * Band convention (important — see Sprint 1 spec in info/PROJECT_BRIEF.md):
 *   - All tax bands are expressed in *taxable* income (i.e. after the personal
 *     allowance has been subtracted), not in *gross* income.
 *   - The England/Wales/NI additional-rate threshold is held at £125,140 of
 *     taxable income, NOT £125,140 minus the personal allowance. By the time a
 *     taxpayer reaches this band the personal allowance has fully tapered to
 *     zero (taper completes at £125,140 gross), so taxable and gross income
 *     coincide there — this gives the right answer in every PA-taper edge case.
 *   - The Scotland bands below are converted from the gov.scot gross thresholds
 *     by subtracting the standard £12,570 PA from each boundary, *including*
 *     the top-rate boundary. This is what the project brief specifies for
 *     consistency with the test cases; note however that strictly applying the
 *     EWN principle above would place the Scotland top-rate boundary at
 *     taxable £125,140, not £112,570. The two interpretations only diverge for
 *     very high Scottish earners — there is no Sprint 2 test case at that
 *     income level, but flagged here in case we revisit later.
 *
 * Sources cross-checked (May 2026):
 *   - House of Commons Library briefing CBP-10237 — Income tax rates and
 *     allowances for 2025/26.
 *   - House of Commons Library briefing CBP-10618 — Income tax rates and
 *     allowances for 2026/27.
 *   - gov.scot/publications/scottish-income-tax-rates-and-bands — Scottish
 *     rates and bands for 2025/26 and 2026/27.
 *   - HMRC — National Insurance rates and thresholds (employee Class 1 and
 *     self-employed Class 4) for 2025/26 and 2026/27.
 *
 * Disclaimer: these figures are encoded in good faith and were correct at the
 * time of writing. They are not regulated advice; verify against HMRC and
 * gov.scot before relying on them for filing decisions. */

/**
 * Tax region. Scotland sets its own rates and bands on *earned* income only;
 * savings and dividend income always use UK-wide rates regardless of region.
 */
export type Region = "england-wales-ni" | "scotland";

/**
 * Supported tax years. UK tax years run from 6 April through 5 April the
 * following calendar year, so "2025/26" means 6 April 2025 to 5 April 2026.
 */
export type TaxYear = "2025/26" | "2026/27";

/**
 * One slice of an income tax band schedule. All amounts are in pounds of
 * *taxable* income (after the personal allowance has been subtracted). The
 * top band uses `to: Infinity`.
 */
export interface TaxBand {
  /** Lower bound of the band in pounds of taxable income (inclusive). */
  from: number;
  /** Upper bound of the band in pounds of taxable income (exclusive). */
  to: number;
  /** Marginal rate within this band, as a decimal fraction (e.g. 0.40 = 40%). */
  rate: number;
  /** Human-readable band name as published by HMRC / gov.scot. */
  name: string;
}

/**
 * Complete set of rules for a single tax year. Every figure the calculator
 * needs sits inside one of these.
 */
export interface YearRules {
  /** Which tax year this set of rules applies to. */
  taxYear: TaxYear;

  /** Personal allowance (income-tax-free amount), in pounds. */
  personalAllowance: number;
  /** Income above this level starts the personal-allowance taper. */
  personalAllowanceTaperStart: number;
  /** Income at or above this level fully exhausts the personal allowance. */
  personalAllowanceTaperEnd: number;

  /** Income tax bands for taxpayers resident in England, Wales, or NI. */
  incomeTaxBandsEWN: TaxBand[];
  /** Income tax bands for taxpayers resident in Scotland (earned income only). */
  incomeTaxBandsScotland: TaxBand[];

  /** Tax-free amount of dividend income (sits at 0% but still consumes band space). */
  dividendAllowance: number;
  /** Dividend tax rates above the dividend allowance. */
  dividendRates: {
    /** Basic-rate dividend rate (8.75%). */
    basic: number;
    /** Higher-rate dividend rate (33.75%). */
    higher: number;
    /** Additional-rate dividend rate (39.35%). */
    additional: number;
  };

  /** Personal Savings Allowance, by the taxpayer's highest income tax band. */
  personalSavingsAllowance: {
    /** PSA for taxpayers whose top band is basic rate (£1,000). */
    basicRate: number;
    /** PSA for taxpayers whose top band is higher rate (£500). */
    higherRate: number;
    /** PSA for taxpayers whose top band is additional rate (£0). */
    additionalRate: number;
  };

  /** Starting-rate band for savings income (0% on up to this much). */
  startingRateForSavings: number;
  /** Rate applied within the starting-rate-for-savings band. */
  startingRateForSavingsRate: number;

  /** Annual CGT exempt amount. */
  cgtAnnualExemptAmount: number;
  /** Capital Gains Tax rates by taxpayer band and asset class. */
  cgtRates: {
    /** Basic-rate CGT rate on non-residential gains. */
    basicRate: number;
    /** Higher/additional-rate CGT rate on non-residential gains. */
    higherRate: number;
    /** Basic-rate CGT rate on residential-property gains. */
    residentialBasicRate: number;
    /** Higher/additional-rate CGT rate on residential-property gains. */
    residentialHigherRate: number;
  };

  /** National Insurance Class 1 (employee) thresholds and rates. */
  ni: {
    /** Primary Threshold — annualised earnings level at which NI starts. */
    primaryThreshold: number;
    /** Upper Earnings Limit — earnings level above which the higher rate applies. */
    upperEarningsLimit: number;
    /** Main rate between PT and UEL (8%). */
    mainRate: number;
    /** Rate above UEL (2%). */
    higherRate: number;
  };

  /** National Insurance Class 4 (self-employed) thresholds and rates. */
  niClass4: {
    /** Lower Profits Limit. */
    lowerProfitsLimit: number;
    /** Upper Profits Limit. */
    upperProfitsLimit: number;
    /** Main rate between LPL and UPL (6%). */
    mainRate: number;
    /** Rate above UPL (2%). */
    higherRate: number;
  };

  /** Annual ISA subscription limit. */
  isaAllowance: number;
  /** Pension annual allowance (gross contribution attracting tax relief). */
  pensionAnnualAllowance: number;
  /** Amount of personal allowance transferable under the Marriage Allowance. */
  marriageAllowance: number;
  /** Additional allowance for registered blind persons. */
  blindPersonsAllowance: number;
  /** Trading-income allowance (small self-employment threshold). */
  tradingAllowance: number;
  /** Property-income allowance (small rental threshold). */
  propertyAllowance: number;

  /** Basic-rate tax used for Gift Aid grossing-up (20%). */
  giftAidBasicRate: number;
}

/**
 * England/Wales/NI income tax bands. Identical for 2025/26 and 2026/27 —
 * frozen by the Chancellor's "stealth" fiscal drag through to (at least)
 * 2028. Defined in TAXABLE income; see file header for the band-convention
 * note and the rationale for keeping the additional-rate threshold at
 * £125,140 of taxable income.
 */
const INCOME_TAX_BANDS_EWN: TaxBand[] = [
  { from: 0, to: 37700, rate: 0.20, name: "Basic rate" },
  { from: 37700, to: 125140, rate: 0.40, name: "Higher rate" },
  { from: 125140, to: Infinity, rate: 0.45, name: "Additional rate" },
];

/**
 * Scotland 2025/26 income tax bands (earned income only). Converted from the
 * gov.scot gross thresholds by subtracting the standard £12,570 personal
 * allowance from each boundary. See file header for the asymmetry note about
 * the top-rate boundary.
 */
const INCOME_TAX_BANDS_SCOTLAND_2025_26: TaxBand[] = [
  { from: 0, to: 15397 - 12570, rate: 0.19, name: "Starter rate" },
  { from: 15397 - 12570, to: 27491 - 12570, rate: 0.20, name: "Basic rate" },
  { from: 27491 - 12570, to: 43662 - 12570, rate: 0.21, name: "Intermediate rate" },
  { from: 43662 - 12570, to: 75000 - 12570, rate: 0.42, name: "Higher rate" },
  { from: 75000 - 12570, to: 125140 - 12570, rate: 0.45, name: "Advanced rate" },
  { from: 125140 - 12570, to: Infinity, rate: 0.48, name: "Top rate" },
];

/**
 * Scotland 2026/27 income tax bands. Scottish Budget 2026/27 widened the
 * starter band top to £16,537 and the basic band top to £29,526; the
 * intermediate / higher / advanced / top thresholds were left at 2025/26
 * levels.
 */
const INCOME_TAX_BANDS_SCOTLAND_2026_27: TaxBand[] = [
  { from: 0, to: 16537 - 12570, rate: 0.19, name: "Starter rate" },
  { from: 16537 - 12570, to: 29526 - 12570, rate: 0.20, name: "Basic rate" },
  { from: 29526 - 12570, to: 43662 - 12570, rate: 0.21, name: "Intermediate rate" },
  { from: 43662 - 12570, to: 75000 - 12570, rate: 0.42, name: "Higher rate" },
  { from: 75000 - 12570, to: 125140 - 12570, rate: 0.45, name: "Advanced rate" },
  { from: 125140 - 12570, to: Infinity, rate: 0.48, name: "Top rate" },
];

/**
 * Canonical rules for the 2025/26 tax year (6 April 2025 to 5 April 2026).
 */
export const RULES_2025_26: YearRules = {
  taxYear: "2025/26",

  personalAllowance: 12570,
  personalAllowanceTaperStart: 100000,
  personalAllowanceTaperEnd: 125140,

  incomeTaxBandsEWN: INCOME_TAX_BANDS_EWN,
  incomeTaxBandsScotland: INCOME_TAX_BANDS_SCOTLAND_2025_26,

  dividendAllowance: 500,
  dividendRates: {
    basic: 0.0875,
    higher: 0.3375,
    additional: 0.3935,
  },

  personalSavingsAllowance: {
    basicRate: 1000,
    higherRate: 500,
    additionalRate: 0,
  },

  startingRateForSavings: 5000,
  startingRateForSavingsRate: 0,

  cgtAnnualExemptAmount: 3000,
  cgtRates: {
    basicRate: 0.18,
    higherRate: 0.24,
    residentialBasicRate: 0.18,
    residentialHigherRate: 0.24,
  },

  ni: {
    primaryThreshold: 12570,
    upperEarningsLimit: 50270,
    mainRate: 0.08,
    higherRate: 0.02,
  },
  niClass4: {
    lowerProfitsLimit: 12570,
    upperProfitsLimit: 50270,
    mainRate: 0.06,
    higherRate: 0.02,
  },

  isaAllowance: 20000,
  pensionAnnualAllowance: 60000,
  marriageAllowance: 1260,
  blindPersonsAllowance: 3130,
  tradingAllowance: 1000,
  propertyAllowance: 1000,

  giftAidBasicRate: 0.20,
};

/**
 * Canonical rules for the 2026/27 tax year (6 April 2026 to 5 April 2027).
 * Most figures match 2025/26; only the NI Class 1 thresholds (small uprating)
 * and the Scotland starter/basic bands change.
 */
export const RULES_2026_27: YearRules = {
  ...RULES_2025_26,
  taxYear: "2026/27",
  incomeTaxBandsScotland: INCOME_TAX_BANDS_SCOTLAND_2026_27,
  ni: {
    ...RULES_2025_26.ni,
    primaryThreshold: 12584,
    upperEarningsLimit: 50284,
  },
};

/**
 * Map of every supported tax year to its rule set. New tax years go here.
 */
export const ALL_RULES: Record<TaxYear, YearRules> = {
  "2025/26": RULES_2025_26,
  "2026/27": RULES_2026_27,
};

/**
 * Look up the rule set for a given tax year. Throws if the year is not yet
 * encoded (the `TaxYear` union should prevent that at compile time, but a
 * runtime check guards against unchecked casts from form input or persisted
 * state).
 */
export function getRules(taxYear: TaxYear): YearRules {
  const rules = ALL_RULES[taxYear];
  if (!rules) {
    throw new Error(`No tax rules encoded for tax year: ${taxYear}`);
  }
  return rules;
}

/**
 * Given a calendar date, return the UK tax year that contains it.
 *
 * UK tax years run from 6 April through 5 April the following calendar year,
 * so e.g. 5 April 2026 still falls inside tax year 2025/26, and 6 April 2026
 * is the first day of 2026/27.
 *
 * Throws if the resolved year is outside the currently-encoded range
 * (2025/26 and 2026/27). Callers that need to handle out-of-range dates
 * gracefully should catch and fall back to a user-selected year.
 */
export function taxYearForDate(date: Date): TaxYear {
  const calendarYear = date.getFullYear();
  const monthIndex = date.getMonth(); // 0 = January, 3 = April
  const dayOfMonth = date.getDate();

  // On or after 6 April → tax year is named after `calendarYear`.
  // Before 6 April → tax year is named after `calendarYear - 1`.
  const onOrAfterApril6 =
    monthIndex > 3 || (monthIndex === 3 && dayOfMonth >= 6);
  const startYear = onOrAfterApril6 ? calendarYear : calendarYear - 1;

  const endYearSuffix = ((startYear + 1) % 100).toString().padStart(2, "0");
  const candidate = `${startYear}/${endYearSuffix}`;

  if (candidate === "2025/26") return "2025/26";
  if (candidate === "2026/27") return "2026/27";

  throw new Error(
    `No tax rules encoded for tax year ${candidate}. ` +
      `Supported years: ${Object.keys(ALL_RULES).join(", ")}.`,
  );
}
