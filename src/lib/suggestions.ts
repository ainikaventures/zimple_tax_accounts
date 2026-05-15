/* src/lib/suggestions.ts — tax-saving suggestions engine.
 *
 * Surfaces concrete, prioritised optimisations based on the user's tax
 * situation. Each suggestion is produced by a pure factory function that
 * receives the user's inputs and the baseline TaxResult, and either returns
 * a Suggestion or returns null to opt out.
 *
 * Factories are composed by `generateSuggestions`, which calls each one,
 * filters out nulls, sorts by priority (high first) and then by estimated
 * saving (high first), and returns the list along with the baseline TaxResult
 * the caller may want to display side-by-side.
 *
 * The estimated savings here are intentionally rough — the brief specifies
 * specific shorthand formulae (e.g. `recommendedContrib × 0.60` for PA
 * recovery via pension), and we follow them literally. The `why` field of
 * each suggestion grounds the explanation in the user's actual figures; the
 * `caveats` field surfaces honest warnings (locks, allowance caps, wash-sale
 * rules, etc.) so users aren't sold a one-sided pitch.
 *
 * Spec: info/PROJECT_BRIEF.md Sprint 4. */

import {
  calculateTax,
  type IncomeInputs,
  type TaxResult,
} from "./taxCalculator";
import { getRules } from "./taxRules";

// ─── Public types ──────────────────────────────────────────────────────────

/**
 * One actionable tax-saving suggestion for a specific user.
 */
export interface Suggestion {
  /** Stable identifier, used by the UI and tests (kebab-case). */
  id: string;
  /** Short headline shown in the suggestion list. */
  title: string;
  /** Rough annual tax saving in pounds. Zero for informational suggestions. */
  estimatedSaving: number;
  /** Broad category for grouping / filtering in the UI. */
  category:
    | "pension"
    | "isa"
    | "allowance"
    | "spousal"
    | "charity"
    | "structuring"
    | "capital";
  /** User-specific reasoning, citing numbers from their baseline. */
  why: string;
  /** Concrete next step the user can take. */
  action: string;
  /** 2–3 honest warnings about locks, caps, side effects, etc. */
  caveats: string[];
  /** Higher = more impactful. Used for sort order alongside estimated saving. */
  priority: number;
}

/**
 * Output of `generateSuggestions`. The baseline result is included so the UI
 * can show "current position vs suggestions" without re-running the
 * calculator.
 */
export interface SuggestionsResult {
  suggestions: Suggestion[];
  baseline: TaxResult;
}

/** Signature each suggestion factory implements. */
type SuggestionFactory = (
  input: IncomeInputs,
  baseline: TaxResult,
) => Suggestion | null;

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Round a pounds value to the nearest pound and format it with British
 * thousands separators (`£12,570`). Used inside `why` / `action` text so the
 * user-facing copy doesn't read like raw calculator output.
 */
function gbp(amount: number): string {
  return `£${Math.round(amount).toLocaleString("en-GB")}`;
}

function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

// ─── Suggestion factories ──────────────────────────────────────────────────

/**
 * Priority 100 — pension contribution sized to drop adjusted net income back
 * to £100,000 and so fully restore the personal allowance.
 *
 * The brief's headline estimate of `recommendedContrib × 0.60` is the
 * "60% trap" relief: 40% higher-rate relief on the gross contribution + 20%
 * effective relief from PA recovery (each £1 of PA back is worth ~40p of tax
 * × £1 PA = ~£0.40, but split across all the income, giving roughly £0.20
 * per £ contributed). Together that's about £0.60 of tax saved per £1.
 */
const pensionPaRecovery: SuggestionFactory = (input, baseline) => {
  if (baseline.personalAllowanceLost <= 0) return null;

  const currentPension = input.pensionContributionsGross ?? 0;
  const giftAid = input.giftAidGross ?? 0;
  const ani = baseline.grossIncome - currentPension - giftAid;

  const recommendedContrib = ani - 100000;
  if (recommendedContrib <= 0) return null;

  const estimatedSaving = recommendedContrib * 0.6;

  return {
    id: "pension-pa-recovery",
    title: "Recover your personal allowance with a pension contribution",
    estimatedSaving,
    category: "pension",
    priority: 100,
    why:
      `Your adjusted net income is around ${gbp(ani)}, which is above £100,000. ` +
      `That has tapered ${gbp(baseline.personalAllowanceLost)} off your personal ` +
      `allowance — leaving you with ${gbp(baseline.personalAllowance)} instead of ` +
      `the full £12,570. A gross pension contribution of about ` +
      `${gbp(recommendedContrib)} would bring your adjusted net income back to ` +
      `£100,000 and fully restore the allowance. Inside this taper band, a ` +
      `pound of pension typically saves about 60p of tax — combining higher-rate ` +
      `relief with the PA recovery.`,
    action:
      `Make a gross pension contribution of approximately ` +
      `${gbp(recommendedContrib)} before 5 April. Personal contributions get 20% ` +
      `relief at source; claim the rest via Self Assessment.`,
    caveats: [
      "Pension money is locked until at least age 55 (rising to 57 from 2028).",
      "The annual allowance is £60,000 across all pensions including employer contributions; excess attracts a tax charge.",
      "For earners well above £200k, the annual allowance itself tapers down — check the 'tapered annual allowance' rules before maxing out.",
    ],
  };
};

/**
 * Priority 80 — transfer £1,260 of unused personal allowance to a
 * basic-rate-taxpayer spouse via the Marriage Allowance.
 */
const marriageAllowance: SuggestionFactory = (input, baseline) => {
  if (input.receivesMarriageAllowance || input.transfersMarriageAllowance) {
    return null;
  }
  if (baseline.grossIncome >= baseline.personalAllowance) return null;

  const rules = getRules(baseline.taxYear);
  const estimatedSaving = rules.marriageAllowance * rules.giftAidBasicRate;

  return {
    id: "marriage-allowance",
    title: "Transfer Marriage Allowance to your partner",
    estimatedSaving,
    category: "spousal",
    priority: 80,
    why:
      `Your gross income (${gbp(baseline.grossIncome)}) is below the personal ` +
      `allowance (${gbp(baseline.personalAllowance)}), so part of your allowance ` +
      `is unused. If you have a spouse or civil partner who pays basic-rate tax, ` +
      `you can transfer ${gbp(rules.marriageAllowance)} of your allowance to ` +
      `them — saving them roughly ${gbp(estimatedSaving)} a year.`,
    action:
      "Apply at gov.uk/marriage-allowance. You can backdate claims up to four tax years if you've been eligible the whole time.",
    caveats: [
      "Both partners must be UK residents and married or in a civil partnership.",
      "Your partner must pay tax at the basic rate (their income sits within the 20% band).",
      "Transferring reduces your own allowance by £1,260 — only beneficial if you genuinely cannot use it.",
    ],
  };
};

/**
 * Priority 75 — top up pension contributions to capture full higher-rate
 * relief, up to the annual allowance.
 */
const higherRatePension: SuggestionFactory = (input, baseline) => {
  if (baseline.marginalRate < 0.4) return null;

  const rules = getRules(baseline.taxYear);
  const currentPension = input.pensionContributionsGross ?? 0;
  const headroom = Math.max(0, rules.pensionAnnualAllowance - currentPension);
  if (headroom <= 0) return null;

  // Brief: "Saving = headroom × 0.20 (the extra relief beyond basic rate)".
  const estimatedSaving = headroom * 0.2;

  return {
    id: "higher-rate-pension",
    title: "Claim full higher-rate pension relief",
    estimatedSaving,
    category: "pension",
    priority: 75,
    why:
      `Your marginal tax rate is around ${percent(baseline.marginalRate)}, but ` +
      `pension contributions only attract 20% relief at source. You have to ` +
      `claim the extra relief via Self Assessment. You currently have ` +
      `${gbp(headroom)} of headroom under the £${rules.pensionAnnualAllowance.toLocaleString("en-GB")} ` +
      `annual allowance — at higher-rate, every extra £1 contributed up to that ` +
      `cap is worth roughly an extra 20p of tax saving on top of the basic-rate ` +
      `relief already given.`,
    action:
      `Top up pension contributions up to ${gbp(headroom)} (gross) before the ` +
      `tax year ends, then claim the higher-rate top-up via your Self Assessment ` +
      `return. Employer salary sacrifice can be an even more efficient route ` +
      `because it also saves NI.`,
    caveats: [
      "Pension money is locked until at least age 55 (rising to 57 from 2028).",
      "The £60,000 annual allowance is reduced for earners with income well above £200k (the tapered annual allowance).",
      "Unused allowance from the three preceding tax years can sometimes be carried forward, subject to your earnings and pension membership history.",
    ],
  };
};

/**
 * Priority 70 — move taxable savings/dividends into ISAs to shelter future
 * returns. Only relevant if there's actually taxable income of these kinds.
 */
const isaShelter: SuggestionFactory = (input, baseline) => {
  const sav = input.savingsIncome ?? 0;
  const divs = input.dividendIncome ?? 0;
  const total = sav + divs;
  if (total <= 0) return null;

  const rules = getRules(baseline.taxYear);
  // Brief: "Saving = (savingsIncome + dividendIncome) × marginalRate × 0.5".
  const estimatedSaving = total * baseline.marginalRate * 0.5;

  return {
    id: "isa-shelter",
    title: "Move taxable investments into an ISA",
    estimatedSaving,
    category: "isa",
    priority: 70,
    why:
      `You have around ${gbp(total)} of taxable savings interest and dividend ` +
      `income outside an ISA. Moving these holdings into a Stocks & Shares or ` +
      `Cash ISA over time would shelter future interest, dividends, and capital ` +
      `gains from tax. At your marginal rate (about ${percent(baseline.marginalRate)}) ` +
      `that's roughly ${gbp(estimatedSaving)} of avoidable tax per year as the ` +
      `position rolls forward.`,
    action:
      `Open or top up an ISA up to the ${gbp(rules.isaAllowance)} annual limit. ` +
      `For existing taxable holdings, brokers offer "Bed & ISA": sell outside and ` +
      `rebuy inside, doing it in tranches across years to manage CGT.`,
    caveats: [
      `The £${rules.isaAllowance.toLocaleString("en-GB")} ISA allowance is shared across all your ISAs (Cash, S&S, IFISA, LISA).`,
      "Selling existing holdings to fund an ISA can trigger CGT — stay within the annual exempt amount each year.",
      "Non-Flexible ISA contributions can't be withdrawn and re-added in the same tax year beyond the annual limit.",
    ],
  };
};

/**
 * Priority 40 — Gift Aid higher-rate top-up. Informational; estimated saving
 * is zero because we don't know what the user actually donates.
 */
const giftAid: SuggestionFactory = (input, baseline) => {
  if (baseline.marginalRate < 0.4) return null;
  if ((input.giftAidGross ?? 0) > 0) return null;

  return {
    id: "gift-aid",
    title: "Claim higher-rate relief on Gift Aid donations",
    estimatedSaving: 0,
    category: "charity",
    priority: 40,
    why:
      `As a higher-rate taxpayer (marginal ${percent(baseline.marginalRate)}), ` +
      `every £1 you give to a UK charity via Gift Aid is worth 25p to the ` +
      `charity (the basic-rate top-up) and another roughly 25p back to you ` +
      `(the extra relief above basic rate). If you donate regularly and you've ` +
      `never declared it, that relief is sitting on the table.`,
    action:
      "Keep a record of Gift Aid donations through the year and report them on your Self Assessment return. You can backdate claims up to four years.",
    caveats: [
      "You must have paid enough income or capital-gains tax in the year to cover the 25% basic-rate top-up the charity reclaims.",
      "Only donations to UK-registered (or qualifying overseas) charities count.",
      "Hold receipts or transaction records in case HMRC asks for evidence.",
    ],
  };
};

/**
 * Priority 30 — use the annual CGT exempt amount each year. Always shown.
 */
const cgtAea: SuggestionFactory = (_input, baseline) => {
  const rules = getRules(baseline.taxYear);
  // Brief: "Estimated saving = £3,000 × marginalRate × 0.5".
  const estimatedSaving =
    rules.cgtAnnualExemptAmount * baseline.marginalRate * 0.5;

  return {
    id: "cgt-aea",
    title: "Use your CGT annual exempt amount",
    estimatedSaving,
    category: "capital",
    priority: 30,
    why:
      `Every tax year you can realise up to ${gbp(rules.cgtAnnualExemptAmount)} ` +
      `of capital gains entirely tax-free. The allowance doesn't carry forward — ` +
      `if you don't use it before 5 April, it's gone. Holders of unwrapped ` +
      `investments can crystallise gains gradually each year so that long-run ` +
      `growth stays inside this annual exemption.`,
    action:
      `Before 5 April, review unwrapped investments and consider selling enough ` +
      `to realise gains of up to ${gbp(rules.cgtAnnualExemptAmount)}. Pair this ` +
      `with rebuying inside an ISA (Bed & ISA) to shelter future returns.`,
    caveats: [
      "The 30-day 'bed and breakfasting' rule prevents you from repurchasing the same asset within 30 days to crystallise a loss or gain.",
      "Gains above the allowance are taxed at 18% (basic-rate band) or 24% (higher/additional) for most assets.",
      "Selling and re-buying inside an ISA is fine, but selling and re-buying outside it within 30 days does not refresh your gain.",
    ],
  };
};

/**
 * Priority 20 — informational nudge about the £1,000 trading and property
 * allowances. Shown only to users plausibly affected (gross income under
 * £100k, which is where casual side-income relief is most useful).
 */
const tradingPropertyAllowance: SuggestionFactory = (_input, baseline) => {
  if (baseline.grossIncome >= 100000) return null;
  const rules = getRules(baseline.taxYear);

  return {
    id: "trading-property-allowance",
    title: "Use the £1,000 trading and property allowances",
    estimatedSaving: 0,
    category: "allowance",
    priority: 20,
    why:
      `If you have small side-income — eBay sales, occasional Airbnb, casual ` +
      `consulting, hobby income — you can earn up to ` +
      `${gbp(rules.tradingAllowance)} from trading and ` +
      `${gbp(rules.propertyAllowance)} from property each tax year without ` +
      `having to register for Self Assessment or report it. These allowances ` +
      `are an alternative to claiming actual expenses, whichever is more ` +
      `favourable to you.`,
    action:
      "Track casual side-income separately from your main job. If the annual total in each category stays below £1,000, rely on the allowance instead of claiming expenses.",
    caveats: [
      "You can choose the allowance OR claim actual expenses — not both for the same income stream.",
      "Trading income above £1,000 (or VAT-registered above £85,000) triggers full Self Assessment.",
      "The property allowance does not cover rent-a-room income above £7,500 — that has its own scheme.",
    ],
  };
};

// ─── Public entry point ────────────────────────────────────────────────────

/** All seven factories from the Sprint 4 brief, in declaration order. */
const FACTORIES: readonly SuggestionFactory[] = [
  pensionPaRecovery,
  marriageAllowance,
  higherRatePension,
  isaShelter,
  giftAid,
  cgtAea,
  tradingPropertyAllowance,
];

/**
 * Run every suggestion factory against the user's inputs and return the
 * applicable ones, sorted by priority (high first) then by estimated saving
 * (high first). The baseline TaxResult used to derive the suggestions is
 * returned alongside so the UI can show "current" + "with this change".
 */
export function generateSuggestions(input: IncomeInputs): SuggestionsResult {
  const baseline = calculateTax(input);
  const suggestions = FACTORIES.map((factory) => factory(input, baseline))
    .filter((s): s is Suggestion => s !== null)
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return b.estimatedSaving - a.estimatedSaving;
    });
  return { suggestions, baseline };
}
