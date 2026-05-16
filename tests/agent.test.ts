/* tests/agent.test.ts — regression tests for src/lib/agent.ts.
 *
 * Covers the Sprint 6 acceptance: prompt construction includes the user's
 * gross income, the correct personal allowance for the requested tax year,
 * the user-region's tax bands, and the verify-with-HMRC closer; history
 * trimming keeps only the last 8 messages; the OllamaAgent stub throws.
 *
 * No live API calls — this is a pure prompt-construction test suite. */

import {
  buildSystemPrompt,
  trimHistory,
  OllamaAgent,
  HISTORY_LIMIT,
  type AgentContext,
  type AgentMessage,
} from "../src/lib/agent";
import { calculateTax } from "../src/lib/taxCalculator";
import { generateSuggestions } from "../src/lib/suggestions";
import { getRules } from "../src/lib/taxRules";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(label: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
    failures.push(label);
  }
}

function eq<T>(label: string, actual: T, expected: T): void {
  if (actual === expected) {
    console.log(`  ✓ ${label}: ${JSON.stringify(actual)}`);
    passed++;
  } else {
    console.log(
      `  ✗ ${label}: ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`,
    );
    failed++;
    failures.push(label);
  }
}

function makeContext(opts: {
  earnedIncome?: number;
  taxYear?: "2025/26" | "2026/27";
  region?: "england-wales-ni" | "scotland";
} = {}): AgentContext {
  const input = {
    earnedIncome: opts.earnedIncome ?? 60000,
    taxYear: opts.taxYear ?? ("2025/26" as const),
    region: opts.region ?? ("england-wales-ni" as const),
  };
  const taxResult = calculateTax(input);
  const { suggestions } = generateSuggestions(input);
  const rules = getRules(input.taxYear);
  return { taxResult, suggestions, rules };
}

// ─── System prompt construction ────────────────────────────────────────────

console.log("\n→ buildSystemPrompt — £60,000 earner (2025/26 EWN)");
{
  const ctx = makeContext({ earnedIncome: 60000 });
  const prompt = buildSystemPrompt(ctx);

  ok(
    "Prompt is long enough to exceed Sonnet's 1024-token cacheable minimum",
    prompt.length > 2000,
    `${prompt.length} chars`,
  );
  ok(
    "Prompt locks the agent to UK personal income tax for the tax year",
    prompt.includes("2025/26") && /UK personal income tax/i.test(prompt),
  );
  ok(
    "Prompt includes the user's grossIncome (60000) in the injected JSON",
    prompt.includes('"grossIncome": 60000') ||
      prompt.includes('"grossIncome":60000'),
  );
  ok(
    "Prompt includes the correct personal allowance for 2025/26 (£12,570)",
    prompt.includes("£12,570"),
  );
  ok(
    "Prompt includes the EWN higher-rate band threshold (£37,700)",
    prompt.includes("£37,700"),
  );
  ok(
    "Prompt includes the additional-rate threshold (£125,140)",
    prompt.includes("£125,140"),
  );
  ok(
    "Prompt includes the dividend allowance (£500)",
    prompt.includes("£500"),
  );
  ok(
    "Prompt includes the ISA allowance (£20,000)",
    prompt.includes("£20,000"),
  );
  ok(
    "Prompt includes the CGT annual exempt amount (£3,000)",
    prompt.includes("£3,000"),
  );
  ok(
    "Prompt forbids regulated financial advice",
    /regulated financial advice/i.test(prompt),
  );
  ok(
    "Prompt forbids IR35 specifics",
    /IR35/.test(prompt),
  );
  ok(
    "Prompt forbids DOTAS-flagged avoidance schemes",
    /DOTAS/i.test(prompt),
  );
  ok(
    "Prompt forbids overseas / non-resident matters",
    /overseas/i.test(prompt) && /non-?(uk-)?resident/i.test(prompt),
  );
  ok(
    "Prompt ends with the verify-with-HMRC closer",
    prompt.includes("Always verify with a chartered tax adviser or HMRC"),
  );
}

console.log("\n→ buildSystemPrompt — Scottish saver picks Scottish bands");
{
  const ctx = makeContext({ earnedIncome: 60000, region: "scotland" });
  const prompt = buildSystemPrompt(ctx);
  ok(
    "Prompt mentions Scotland for the region",
    prompt.includes("Scotland"),
  );
  ok(
    "Prompt includes a Scottish-specific band name (e.g. Intermediate or Advanced)",
    /Intermediate rate/.test(prompt) || /Advanced rate/.test(prompt),
  );
}

console.log("\n→ buildSystemPrompt — 2026/27 NI uprating reflected");
{
  const ctx = makeContext({ earnedIncome: 60000, taxYear: "2026/27" });
  const prompt = buildSystemPrompt(ctx);
  ok(
    "Prompt mentions the 2026/27 Class 1 primary threshold (£12,584)",
    prompt.includes("£12,584"),
  );
  ok(
    "Prompt mentions the 2026/27 Class 1 upper earnings limit (£50,284)",
    prompt.includes("£50,284"),
  );
}

// ─── History trimming ─────────────────────────────────────────────────────

console.log("\n→ trimHistory");
{
  const long: AgentMessage[] = [];
  for (let i = 0; i < 20; i++) {
    long.push({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i}`,
    });
  }
  const trimmed = trimHistory(long);

  eq("Trims to HISTORY_LIMIT (8) messages", trimmed.length, HISTORY_LIMIT);
  eq("Keeps the LAST 8 messages — first is Message 12", trimmed[0].content, "Message 12");
  eq("Keeps the LAST 8 messages — last is Message 19", trimmed[7].content, "Message 19");

  const short: AgentMessage[] = [
    { role: "user", content: "hello" },
    { role: "assistant", content: "hi" },
  ];
  const trimmedShort = trimHistory(short);
  eq("Short histories pass through unchanged", trimmedShort.length, 2);
  ok(
    "Short histories are a new array (not the same reference)",
    trimmedShort !== short,
  );
}

// ─── Ollama stub ──────────────────────────────────────────────────────────

console.log("\n→ OllamaAgent stub");

new OllamaAgent()
  .ask()
  .then(
    () => {
      ok("Ollama stub did throw", false, "ask() resolved instead of rejecting");
      finish();
    },
    (err: unknown) => {
      ok("Ollama stub did throw", true);
      ok(
        "Ollama stub throws a clear 'not implemented' error",
        err instanceof Error && /not implemented/i.test(err.message),
        err instanceof Error ? err.message : String(err),
      );
      finish();
    },
  );

// ─── Summary ──────────────────────────────────────────────────────────────

function finish(): void {
  console.log(
    `\n${passed}/${passed + failed} assertions passed` +
      (failed > 0 ? ` — ${failed} failed: ${failures.join(", ")}` : ""),
  );
  if (failed > 0) process.exit(1);
}
