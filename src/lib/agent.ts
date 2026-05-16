/* src/lib/agent.ts — Claude-powered conversational tax assistant.
 *
 * Exposes `askAgent(ctx, history, message)`: the single entry point used by
 * the `/api/agent` route. The agent is grounded in the user's actual tax
 * result and a curated set of UK tax rules so it cites real figures rather
 * than hallucinating numbers. The implementation lives behind an
 * `AgentProvider` interface so that an Ollama or other local-LLM provider
 * can be swapped in later without touching the API route.
 *
 * Notes on the system prompt:
 *
 *   - The user's `TaxResult` is injected as structured JSON. The LLM has
 *     concrete numbers — gross income, personal allowance, tax, NI,
 *     effective and marginal rates, the band-by-band breakdown — and is
 *     instructed to cite them when answering "how is X calculated?".
 *   - A curated rules block (PA + taper + bands + dividend allowance + PSA
 *     + starting-rate-for-savings + ISA + CGT AEA + NI thresholds) prevents
 *     the model from inventing rate numbers, especially around edge cases
 *     like the 60% trap and the Scottish bands.
 *   - Hard prohibitions: regulated financial advice, DOTAS-flagged or
 *     aggressive tax-avoidance schemes, overseas tax, non-UK residency,
 *     and IR35 specifics. Every reply ends with the verify-with-HMRC line.
 *   - History is trimmed to the last 8 messages before sending — keeps
 *     latency and cost bounded across long chat sessions. Sprint 10's UI
 *     caps state at 16 and lets the API trim again here, mirroring the
 *     belt-and-braces shape requested in the brief.
 *
 * The system prompt is sized to exceed Claude Sonnet 4.5's 1024-token
 * cacheable-prefix minimum, so `cache_control: { type: 'ephemeral' }` on
 * `messages.create()` lets every follow-up turn in a chat session read the
 * prefix back from cache for ~0.1× the input cost.
 *
 * Model and parameters come from the Sprint 6 spec in info/PROJECT_BRIEF.md:
 * `claude-sonnet-4-5` (still active), `max_tokens` 1024. */

import Anthropic from "@anthropic-ai/sdk";

import type { Suggestion } from "./suggestions";
import type { TaxResult } from "./taxCalculator";
import type { TaxBand, TaxYear, YearRules } from "./taxRules";

// ─── Public types ──────────────────────────────────────────────────────────

/**
 * Everything the agent needs to ground its replies in the user's actual
 * position. The caller assembles this from the React state in Sprint 10.
 */
export interface AgentContext {
  taxResult: TaxResult;
  suggestions: Suggestion[];
  rules: YearRules;
}

/**
 * One turn of conversation history. `content` is plain text; the UI is
 * responsible for stripping any markdown / formatting it cannot render
 * before passing it in.
 */
export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * The provider abstraction. `ask` is the only method the API route depends
 * on, so a swap to a local-LLM backend in a later release is purely a
 * `getProvider()` change — no UI or route changes required.
 */
export interface AgentProvider {
  ask(
    context: AgentContext,
    history: AgentMessage[],
    message: string,
  ): Promise<string>;
}

// ─── Constants ─────────────────────────────────────────────────────────────

/** Brief: "Model: `claude-sonnet-4-5`. Max tokens 1024." */
export const AGENT_MODEL = "claude-sonnet-4-5";
export const AGENT_MAX_TOKENS = 1024;

/** Brief: "Trim history to last 8 turns before sending to API." */
export const HISTORY_LIMIT = 8;

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Keep only the last `limit` messages of the conversation history. Used to
 * cap latency and cost on long chats; the system prompt + injected context
 * provides the durable grounding so trimming earlier turns is safe.
 */
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

/** Format the rules schedule into a short, prompt-friendly bullet list. */
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
 * Build the full system prompt for this taxpayer. Exported for unit testing —
 * the tests assert that the user's gross income and the correct PA for the
 * tax year both appear in the prompt without making any API call.
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

// ─── Claude provider ───────────────────────────────────────────────────────

/**
 * Concrete `AgentProvider` backed by the Anthropic Claude API. Reads the key
 * from `process.env.ANTHROPIC_API_KEY` by default (or accepts an explicit
 * key for tests).
 */
export class ClaudeAgent implements AgentProvider {
  private readonly client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey });
  }

  async ask(
    context: AgentContext,
    history: AgentMessage[],
    message: string,
  ): Promise<string> {
    const systemPrompt = buildSystemPrompt(context);
    const trimmed = trimHistory(history, HISTORY_LIMIT);

    const apiMessages: Anthropic.MessageParam[] = trimmed.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    apiMessages.push({ role: "user", content: message });

    const response = await this.client.messages.create({
      model: AGENT_MODEL,
      max_tokens: AGENT_MAX_TOKENS,
      system: [
        {
          type: "text",
          text: systemPrompt,
          // 5-minute ephemeral cache: in a chat session the prefix is
          // identical for every turn, so this trims input cost ~10×.
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: apiMessages,
    });

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
  }
}

// ─── Ollama stub (deliberately not implemented) ────────────────────────────

/**
 * Placeholder for a future local-LLM provider. Throws on use — the API
 * route only reaches this code path if `AGENT_PROVIDER=ollama` is set.
 */
export class OllamaAgent implements AgentProvider {
  async ask(): Promise<string> {
    throw new Error(
      "Ollama agent provider is not implemented yet. Unset AGENT_PROVIDER, or set it to 'claude', to use the Claude provider.",
    );
  }
}

// ─── Provider selection ────────────────────────────────────────────────────

/**
 * Pick a provider by name. Defaults to "claude" when nothing is set. The
 * API route is the only intended caller; tests construct providers
 * directly to avoid coupling to environment variables.
 */
export function getProvider(name?: string): AgentProvider {
  const resolved = (name ?? process.env.AGENT_PROVIDER ?? "claude").toLowerCase();
  if (resolved === "ollama") return new OllamaAgent();
  if (resolved === "claude") return new ClaudeAgent();
  throw new Error(`Unknown agent provider: ${resolved}`);
}

/**
 * The function the API route calls. Selects a provider, trims history, and
 * dispatches.
 */
export async function askAgent(
  context: AgentContext,
  history: AgentMessage[],
  message: string,
): Promise<string> {
  const provider = getProvider();
  return provider.ask(context, history, message);
}
