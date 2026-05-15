/* tests/parser.test.ts — regression tests for src/lib/statementParser.ts.
 *
 * Covers the Sprint 3 acceptance: format detection for Monzo, Starling and
 * a generic CSV; at least five correctly-categorised transactions per
 * format; correct inferIncomes totals; a Monzo salary transaction with
 * confidence >= 0.9; CSV-parser corner cases (quoted commas, escaped
 * quotes, CRLF line endings).
 *
 * Same lightweight test harness as tests/calculator.test.ts: console.log
 * markers and a non-zero exit on the first failure. */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  parseCSV,
  classify,
  inferIncomes,
  type BankFormat,
  type ClassifiedTransaction,
  type InferredIncomes,
} from "../src/lib/statementParser";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = (name: string) => path.join(here, "fixtures", name);

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

function eqNumber(
  label: string,
  actual: number,
  expected: number,
  tol = 0.01,
): void {
  const diff = Math.abs(actual - expected);
  if (diff <= tol) {
    console.log(
      `  ✓ ${label}: ${actual.toFixed(2)} (expected ${expected.toFixed(2)})`,
    );
    passed++;
  } else {
    console.log(
      `  ✗ ${label}: ${actual.toFixed(2)} (expected ${expected.toFixed(2)}, diff ${diff.toFixed(4)})`,
    );
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

function expectIncomes(
  incomes: InferredIncomes,
  expected: Omit<InferredIncomes, "needsReview"> & { needsReviewCount: number },
): void {
  eqNumber("  earnedIncome", incomes.earnedIncome, expected.earnedIncome);
  eqNumber("  savingsIncome", incomes.savingsIncome, expected.savingsIncome);
  eqNumber("  dividendIncome", incomes.dividendIncome, expected.dividendIncome);
  eqNumber("  rentalIncome", incomes.rentalIncome, expected.rentalIncome);
  eqNumber(
    "  selfEmploymentIncome",
    incomes.selfEmploymentIncome,
    expected.selfEmploymentIncome,
  );
  eqNumber(
    "  pensionContributions",
    incomes.pensionContributions,
    expected.pensionContributions,
  );
  eqNumber(
    "  charityDonations",
    incomes.charityDonations,
    expected.charityDonations,
  );
  eq(
    "  needsReview count",
    incomes.needsReview.length,
    expected.needsReviewCount,
  );
}

function countClassifiedAs(
  classified: ClassifiedTransaction[],
  ...categories: ClassifiedTransaction["category"][]
): number {
  const set = new Set(categories);
  return classified.filter((tx) => set.has(tx.category)).length;
}

// ─── Monzo ─────────────────────────────────────────────────────────────────

console.log("\n→ Monzo CSV");
{
  const content = readFileSync(fixturePath("monzo-sample.csv"), "utf-8");
  const parsed = parseCSV(content);
  eq("Format detected", parsed.format, "monzo" as BankFormat);
  eq("Transactions parsed", parsed.transactions.length, 9);

  // Verify the CSV parser handled the quoted, comma-containing Name in tx_004.
  const oxfam = parsed.transactions.find((t) =>
    t.description.startsWith("Just Giving, Oxfam"),
  );
  ok(
    "Quoted comma in Name preserved",
    !!oxfam,
    oxfam?.description ?? "(not found)",
  );

  const classified = classify(parsed.transactions);
  const classifiedCount = countClassifiedAs(
    classified,
    "salary",
    "savings-interest",
    "dividend",
    "pension-contribution",
    "charity-donation",
    "rental-income",
    "self-employment-income",
  );
  ok(
    "At least 5 transactions classified into a real category",
    classifiedCount >= 5,
    `${classifiedCount} classified`,
  );

  const salary = classified.find((t) => t.category === "salary");
  ok(
    "Monzo salary detected with confidence ≥ 0.9",
    !!salary && salary.confidence >= 0.9,
    salary ? `confidence ${salary.confidence}` : "(not detected)",
  );

  const incomes = inferIncomes(classified);
  expectIncomes(incomes, {
    earnedIncome: 2800,
    savingsIncome: 12.5,
    dividendIncome: 75,
    rentalIncome: 800,
    selfEmploymentIncome: 0,
    pensionContributions: 200,
    charityDonations: 25,
    needsReviewCount: 1, // tx_009 — £1,500 unmatched
  });

  const largeUnknown = incomes.needsReview[0];
  ok(
    "Large unknown surfaces in needsReview",
    !!largeUnknown && largeUnknown.amount === 1500,
    largeUnknown
      ? `category=${largeUnknown.category}, conf=${largeUnknown.confidence}`
      : "(missing)",
  );
}

// ─── Starling ──────────────────────────────────────────────────────────────

console.log("\n→ Starling CSV");
{
  const content = readFileSync(fixturePath("starling-sample.csv"), "utf-8");
  const parsed = parseCSV(content);
  eq("Format detected", parsed.format, "starling" as BankFormat);
  eq("Transactions parsed", parsed.transactions.length, 7);

  const classified = classify(parsed.transactions);
  const classifiedCount = countClassifiedAs(
    classified,
    "salary",
    "savings-interest",
    "dividend",
    "pension-contribution",
    "charity-donation",
    "rental-income",
    "self-employment-income",
  );
  ok(
    "At least 5 transactions classified into a real category",
    classifiedCount >= 5,
    `${classifiedCount} classified`,
  );

  const incomes = inferIncomes(classified);
  expectIncomes(incomes, {
    earnedIncome: 2750,
    savingsIncome: 8.75,
    dividendIncome: 55,
    rentalIncome: 900,
    selfEmploymentIncome: 0,
    pensionContributions: 250,
    charityDonations: 15,
    needsReviewCount: 0,
  });
}

// ─── Generic ───────────────────────────────────────────────────────────────

console.log("\n→ Generic CSV");
{
  const content = readFileSync(fixturePath("generic-sample.csv"), "utf-8");
  const parsed = parseCSV(content);
  eq("Format detected", parsed.format, "generic" as BankFormat);
  eq("Transactions parsed", parsed.transactions.length, 8);

  const classified = classify(parsed.transactions);
  const classifiedCount = countClassifiedAs(
    classified,
    "salary",
    "savings-interest",
    "dividend",
    "pension-contribution",
    "charity-donation",
    "rental-income",
    "self-employment-income",
  );
  ok(
    "At least 5 transactions classified into a real category",
    classifiedCount >= 5,
    `${classifiedCount} classified`,
  );

  const incomes = inferIncomes(classified);
  expectIncomes(incomes, {
    earnedIncome: 2900,
    savingsIncome: 9.2,
    dividendIncome: 140,
    rentalIncome: 920,
    selfEmploymentIncome: 450,
    pensionContributions: 275,
    charityDonations: 20,
    needsReviewCount: 0,
  });
}

// ─── CSV parser corner cases ───────────────────────────────────────────────

console.log("\n→ CSV parser corner cases");
{
  // Escaped double quotes inside a quoted field.
  const csv =
    'Date,Description,Amount\r\n' +
    '05/05/2025,"Smith, John & Co",-50.00\r\n' +
    '05/05/2025,"Note ""quoted""",25.00\r\n';
  const parsed = parseCSV(csv);
  eq("CRLF + quoted comma + escaped quote: count", parsed.transactions.length, 2);
  eq(
    "Quoted comma description",
    parsed.transactions[0].description,
    "Smith, John & Co",
  );
  eq(
    "Escaped-quote description",
    parsed.transactions[1].description,
    'Note "quoted"',
  );
}

// ─── Summary ──────────────────────────────────────────────────────────────

console.log(
  `\n${passed}/${passed + failed} assertions passed` +
    (failed > 0 ? ` — ${failed} failed: ${failures.join(", ")}` : ""),
);
if (failed > 0) process.exit(1);
