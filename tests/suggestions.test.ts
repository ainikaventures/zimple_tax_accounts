/* tests/suggestions.test.ts — regression tests for src/lib/suggestions.ts.
 *
 * Covers the four scenarios in the Sprint 4 brief: PA-recovery is the top
 * suggestion for a £115k earner; it does NOT appear for a £30k earner;
 * a £200k earner with £10k of taxable savings gets both isa-shelter and
 * higher-rate-pension; a £10k earner gets marriage-allowance. */

import { generateSuggestions } from "../src/lib/suggestions";

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

// ─── £115k earner — PA recovery should be the top suggestion ───────────────

console.log("\n→ £115,000 earner (in PA-taper band)");
{
  const { suggestions, baseline } = generateSuggestions({ earnedIncome: 115000 });
  const top = suggestions[0];
  ok("Has at least one suggestion", suggestions.length > 0);
  eq("Top suggestion id", top?.id, "pension-pa-recovery");
  ok(
    "Top suggestion has the highest priority",
    suggestions.every((s) => s.priority <= top.priority),
  );
  ok(
    "Top suggestion has a non-trivial estimated saving",
    top.estimatedSaving > 0,
    `${top.estimatedSaving.toFixed(0)}`,
  );
  ok(
    "Baseline shows PA loss",
    baseline.personalAllowanceLost > 0,
    `PA lost £${baseline.personalAllowanceLost}`,
  );
  ok(
    "Top suggestion references the user's actual PA loss",
    top.why.includes("7,500") || top.why.includes("£7,500"),
    `why = ${top.why.slice(0, 80)}…`,
  );
}

// ─── £30k earner — PA recovery should NOT appear ───────────────────────────

console.log("\n→ £30,000 earner");
{
  const { suggestions } = generateSuggestions({ earnedIncome: 30000 });
  const ids = suggestions.map((s) => s.id);
  ok(
    "Does NOT include pension-pa-recovery",
    !ids.includes("pension-pa-recovery"),
    `ids = ${ids.join(", ")}`,
  );
  ok(
    "Does NOT include higher-rate-pension (basic-rate marginal)",
    !ids.includes("higher-rate-pension"),
    `ids = ${ids.join(", ")}`,
  );
  ok(
    "Does include cgt-aea (always shown)",
    ids.includes("cgt-aea"),
    `ids = ${ids.join(", ")}`,
  );
  ok(
    "Does include trading-property-allowance (gross < £100k)",
    ids.includes("trading-property-allowance"),
    `ids = ${ids.join(", ")}`,
  );
}

// ─── £200k + £10k savings — should include isa-shelter AND higher-rate-pension

console.log("\n→ £200,000 earner with £10,000 taxable savings");
{
  const { suggestions } = generateSuggestions({
    earnedIncome: 200000,
    savingsIncome: 10000,
  });
  const ids = suggestions.map((s) => s.id);
  ok("Includes isa-shelter", ids.includes("isa-shelter"), `ids = ${ids.join(", ")}`);
  ok(
    "Includes higher-rate-pension",
    ids.includes("higher-rate-pension"),
    `ids = ${ids.join(", ")}`,
  );
  ok(
    "Includes pension-pa-recovery (PA fully tapered)",
    ids.includes("pension-pa-recovery"),
    `ids = ${ids.join(", ")}`,
  );
  ok(
    "Suggestions are sorted by priority desc, then by saving desc",
    isSortedByPriorityThenSaving(suggestions),
  );
}

// ─── £10k earner — marriage-allowance should be present ────────────────────

console.log("\n→ £10,000 earner (gross income below PA)");
{
  const { suggestions } = generateSuggestions({ earnedIncome: 10000 });
  const ids = suggestions.map((s) => s.id);
  ok(
    "Includes marriage-allowance",
    ids.includes("marriage-allowance"),
    `ids = ${ids.join(", ")}`,
  );
  ok(
    "Does NOT include pension-pa-recovery",
    !ids.includes("pension-pa-recovery"),
  );
}

// ─── Marriage allowance must drop out when a flag is already set ───────────

console.log("\n→ £10,000 earner already transferring marriage allowance");
{
  const { suggestions } = generateSuggestions({
    earnedIncome: 10000,
    transfersMarriageAllowance: true,
  });
  const ids = suggestions.map((s) => s.id);
  ok(
    "Does NOT include marriage-allowance when already transferring",
    !ids.includes("marriage-allowance"),
    `ids = ${ids.join(", ")}`,
  );
}

// ─── Each suggestion must carry the structural fields the UI needs ─────────

console.log("\n→ Suggestion structure");
{
  const { suggestions } = generateSuggestions({
    earnedIncome: 115000,
    savingsIncome: 2000,
  });
  for (const s of suggestions) {
    ok(
      `${s.id} has title`,
      typeof s.title === "string" && s.title.length > 0,
    );
    ok(
      `${s.id} has why (>50 chars, mentions a £ amount)`,
      s.why.length > 50 && s.why.includes("£"),
    );
    ok(`${s.id} has action`, s.action.length > 0);
    ok(`${s.id} has 2+ caveats`, s.caveats.length >= 2);
    ok(
      `${s.id} estimatedSaving is finite and non-negative`,
      Number.isFinite(s.estimatedSaving) && s.estimatedSaving >= 0,
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function isSortedByPriorityThenSaving(suggestions: { priority: number; estimatedSaving: number }[]): boolean {
  for (let i = 1; i < suggestions.length; i++) {
    const prev = suggestions[i - 1];
    const curr = suggestions[i];
    if (prev.priority < curr.priority) return false;
    if (prev.priority === curr.priority && prev.estimatedSaving < curr.estimatedSaving) {
      return false;
    }
  }
  return true;
}

// ─── Summary ──────────────────────────────────────────────────────────────

console.log(
  `\n${passed}/${passed + failed} assertions passed` +
    (failed > 0 ? ` — ${failed} failed: ${failures.join(", ")}` : ""),
);
if (failed > 0) process.exit(1);
