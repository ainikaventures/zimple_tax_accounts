/* src/lib/agentPrompt.ts — pure prompt-construction helpers shared between
 * the server-side ClaudeAgent (src/lib/agent.ts) and the browser-side
 * multi-provider chat client (src/lib/agentClient.ts).
 *
 * Has NO Anthropic SDK import — that way the chat panel doesn't drag
 * the SDK into the client bundle when it isn't needed. */

import type { Suggestion } from "./suggestions";
import type { TaxResult } from "./taxCalculator";
import type { TaxBand, TaxYear, YearRules } from "./taxRules";

// ─── Types ─────────────────────────────────────────────────────────────────

/**
 * Everything the agent needs to ground its replies in the user's actual
 * position. Assembled by the caller from React state.
 */
export interface AgentContext {
  taxResult: TaxResult;
  suggestions: Suggestion[];
  rules: YearRules;
}

/**
 * One turn of conversation history. `content` is plain text.
 */
export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

/** Brief: "Trim history to last 8 turns before sending to API." */
export const HISTORY_LIMIT = 8;

/** Brief: "Max tokens 1024." */
export const AGENT_MAX_TOKENS = 1024;

/**
 * Output cap for PDF→CSV extraction. The chat agent's 1024-token ceiling
 * is far too low for a full bank statement: one month of transactions can
 * easily be 50+ rows, and at ~15 tokens per row a single month already
 * approaches 1000 tokens before the header. 8192 is the current
 * Claude 4.x default max_output_tokens and gives the model headroom for
 * ~500 transactions before truncation.
 */
export const EXTRACTION_MAX_TOKENS = 8192;

// ─── Helpers ───────────────────────────────────────────────────────────────

export function trimHistory(
  history: AgentMessage[],
  limit: number = HISTORY_LIMIT,
): AgentMessage[] {
  if (history.length <= limit) return [...history];
  return history.slice(history.length - limit);
}

function gbp(value: number): string {
  return `£${value.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
}

function pct(value: number, dp = 1): string {
  return `${(value * 100).toFixed(dp)}%`;
}

function bandToString(band: TaxBand): string {
  const to = band.to === Infinity ? "∞" : gbp(band.to);
  return `  - ${band.name} (${pct(band.rate)}): taxable ${gbp(band.from)} to ${to}`;
}

function rulesBlock(rules: YearRules, region: TaxResult["region"]): string {
  const bands =
    region === "scotland"
      ? rules.incomeTaxBandsScotland
      : rules.incomeTaxBandsEWN;
  const bandLines = bands.map(bandToString).join("\n");

  return [
    `Tax year: ${rules.taxYear}.  Region used for income-tax bands: ${region === "scotland" ? "Scotland" : "England / Wales / Northern Ireland"}.`,
    "",
    `Personal allowance: ${gbp(rules.personalAllowance)} (tapers £1 for every £2 of *adjusted net income* above ${gbp(rules.personalAllowanceTaperStart)}; fully exhausted at ${gbp(rules.personalAllowanceTaperEnd)}).`,
    "",
    "Income-tax bands (defined in TAXABLE income, i.e. after PA):",
    bandLines,
    "",
    `Dividend allowance: ${gbp(rules.dividendAllowance)} at 0% (still consumes band space).`,
    `Dividend rates above the allowance: ${pct(rules.dividendRates.basic, 2)} basic / ${pct(rules.dividendRates.higher, 2)} higher / ${pct(rules.dividendRates.additional, 2)} additional.`,
    "",
    `Personal savings allowance: ${gbp(rules.personalSavingsAllowance.basicRate)} (basic-rate) / ${gbp(rules.personalSavingsAllowance.higherRate)} (higher-rate) / ${gbp(rules.personalSavingsAllowance.additionalRate)} (additional-rate).`,
    `Starting rate for savings: ${gbp(rules.startingRateForSavings)} at 0%, reduced £-for-£ by taxable non-savings income.`,
    "",
    `ISA annual allowance: ${gbp(rules.isaAllowance)}.  Pension annual allowance: ${gbp(rules.pensionAnnualAllowance)}.`,
    `Marriage allowance transferable: ${gbp(rules.marriageAllowance)}.  Blind person's allowance: ${gbp(rules.blindPersonsAllowance)}.`,
    `Trading and property allowances: ${gbp(rules.tradingAllowance)} each.`,
    "",
    `CGT annual exempt amount: ${gbp(rules.cgtAnnualExemptAmount)}.  Non-residential CGT rates: ${pct(rules.cgtRates.basicRate)} (basic) / ${pct(rules.cgtRates.higherRate)} (higher).  Residential CGT rates: ${pct(rules.cgtRates.residentialBasicRate)} / ${pct(rules.cgtRates.residentialHigherRate)}.`,
    "",
    `NI Class 1 (employee): primary threshold ${gbp(rules.ni.primaryThreshold)} / upper earnings limit ${gbp(rules.ni.upperEarningsLimit)} / main rate ${pct(rules.ni.mainRate)} / above-UEL rate ${pct(rules.ni.higherRate)}.`,
    `NI Class 4 (self-employed): lower profits limit ${gbp(rules.niClass4.lowerProfitsLimit)} / upper profits limit ${gbp(rules.niClass4.upperProfitsLimit)} / main rate ${pct(rules.niClass4.mainRate)} / above-UPL rate ${pct(rules.niClass4.higherRate)}.`,
  ].join("\n");
}

/**
 * Build the system prompt for this taxpayer. Exported for tests and for
 * direct use by both server and browser callers.
 */
export function buildSystemPrompt(context: AgentContext): string {
  const { taxResult, suggestions, rules } = context;

  const taxYear: TaxYear = taxResult.taxYear;
  const taxResultJSON = JSON.stringify(taxResult, null, 2);

  const suggestionsBlock = suggestions
    .map(
      (s, i) =>
        `${i + 1}. [${s.id}] ${s.title} — estimated saving ${gbp(s.estimatedSaving)} (category: ${s.category}, priority: ${s.priority}).`,
    )
    .join("\n");

  return [
    `You are a friendly, careful UK personal income tax assistant for the ${taxYear} tax year. You are answering questions for ONE specific taxpayer whose calculated position is below. Stay focused on personal income tax in the UK — that is the only thing you advise on.`,
    "",
    "USER'S CURRENT TAX POSITION (authoritative — calculated locally; do not invent contrary figures):",
    "```json",
    taxResultJSON,
    "```",
    "",
    suggestions.length > 0
      ? `Tax-saving suggestions already surfaced to this user:\n${suggestionsBlock}`
      : "No tax-saving suggestions have been generated for this user.",
    "",
    `KEY RULES FOR ${taxYear} (use these — do not hallucinate alternative numbers):`,
    rulesBlock(rules, taxResult.region),
    "",
    "RULES OF ENGAGEMENT:",
    "- Use plain, accessible language. If you use a technical term (e.g. 'taper', 'marginal rate', 'gross-up'), define it in the same sentence.",
    "- When the user asks 'how is X calculated?', show your working step by step using the figures in the JSON above. Be explicit about which band each slice of income falls into.",
    "- Cite the user's *actual* figures whenever you can. Vague answers are unhelpful — point at the number that matters.",
    "- Be honest about uncertainty. If a question depends on facts you don't have (e.g. residency, employer contributions, share-scheme details), say so and tell the user what to check.",
    "",
    "STRICT PROHIBITIONS — do not advise on any of these, even if asked directly. Refuse politely, explain why, and suggest where to seek qualified help.",
    "- Regulated financial advice (investment selection, pension product recommendations, insurance, mortgages).",
    "- Aggressive or marketed tax-avoidance schemes, including anything that would be DOTAS-disclosable.",
    "- Overseas tax, double-taxation treaties, or non-UK residency questions.",
    "- IR35 / off-payroll-working determinations and contractor employment-status questions.",
    "- Non-resident status, split-year treatment, remittance basis, or any other non-UK-resident specifics.",
    "",
    "Format: answers should be short and direct unless the user explicitly asks for detail. Bullet points and short numbered lists are fine; long essays are not.",
    "",
    "End every reply with this exact line on its own paragraph: \"Always verify with a chartered tax adviser or HMRC for your exact situation.\"",
  ].join("\n");
}
