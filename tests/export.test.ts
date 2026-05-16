/* tests/export.test.ts — regression tests for src/lib/export.ts.
 *
 * Sprint 5 acceptance: a non-empty workbook with all five sheets present,
 * Summary contains the expected total tax figure, transactions/suggestions
 * round-trip, and the JSON export parses back. */

import * as XLSX from "xlsx";

import { generateExcel, generateJSON, type ExportData } from "../src/lib/export";
import { calculateTax } from "../src/lib/taxCalculator";
import { generateSuggestions } from "../src/lib/suggestions";
import type {
  ClassifiedTransaction,
  InferredIncomes,
} from "../src/lib/statementParser";

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

// ─── Build a fixture ───────────────────────────────────────────────────────

const taxResult = calculateTax({
  earnedIncome: 60000,
  savingsIncome: 200,
  dividendIncome: 0,
});

const { suggestions } = generateSuggestions({
  earnedIncome: 60000,
  savingsIncome: 200,
});

const transactions: ClassifiedTransaction[] = [
  {
    date: new Date(2025, 4, 1),
    description: "Acme Salary Net pay",
    amount: 4250,
    raw: { Note: "row 1" },
    category: "salary",
    confidence: 0.95,
  },
  {
    date: new Date(2025, 4, 15),
    description: "HSBC Credit interest paid",
    amount: 16.67,
    raw: { Note: "row 2" },
    category: "savings-interest",
    confidence: 0.9,
  },
  {
    date: new Date(2025, 4, 3),
    description: "Tesco groceries",
    amount: -65.4,
    raw: { Note: "row 3" },
    category: "expense",
    confidence: 0.3,
  },
];

const incomes: InferredIncomes = {
  earnedIncome: 60000,
  savingsIncome: 200,
  dividendIncome: 0,
  rentalIncome: 0,
  selfEmploymentIncome: 0,
  pensionContributions: 0,
  charityDonations: 0,
  needsReview: [],
};

const data: ExportData = { taxResult, transactions, incomes, suggestions };

// ─── Excel ────────────────────────────────────────────────────────────────

console.log("\n→ generateExcel — workbook structure");
{
  const buf = generateExcel(data);
  ok("ArrayBuffer is non-empty", buf.byteLength > 0, `${buf.byteLength} bytes`);

  const wb = XLSX.read(buf, { type: "array" });
  const sheets = wb.SheetNames;

  ok("Has 5 sheets", sheets.length === 5, `sheets = ${sheets.join(", ")}`);
  for (const required of [
    "Summary",
    "Band Breakdown",
    "Transactions",
    "SA100 Helper",
    "Suggestions",
  ]) {
    ok(`Sheet present: ${required}`, sheets.includes(required));
  }

  // Summary should contain the expected total tax of £11,432 for £60k earner
  // (calculator regression — same as Sprint 2). Round-trip via sheet_to_json
  // gives us numbers; we look for the number anywhere in column B.
  const summary = wb.Sheets["Summary"];
  const summaryAoa = XLSX.utils.sheet_to_json(summary, {
    header: 1,
  }) as unknown[][];
  const flat = summaryAoa.flat();
  const hasTotalTax = flat.some(
    (c) => typeof c === "number" && Math.abs(c - 11432) < 0.01,
  );
  ok("Summary contains £11,432 total tax (£60k 2025/26 EWN)", hasTotalTax);

  // The "Take-home" should equal 60200 (gross) − 11432 (tax) − 3214.6 (NI on
  // 60000 only — savings income is not NI'd) ≈ 45553.4. Calculator computes
  // exactly; we just want to see the number is present.
  const hasTakeHome = flat.some(
    (c) =>
      typeof c === "number" && Math.abs(c - taxResult.takeHome) < 0.01,
  );
  ok("Summary contains the take-home figure", hasTakeHome);

  // SA100 Helper should mention the inferred salary figure.
  const sa = wb.Sheets["SA100 Helper"];
  const saAoa = XLSX.utils.sheet_to_json(sa, { header: 1 }) as unknown[][];
  const saFlat = saAoa.flat();
  ok(
    "SA100 Helper contains inferred earnedIncome (£60,000)",
    saFlat.some((c) => typeof c === "number" && Math.abs(c - 60000) < 0.01),
  );
  ok(
    "SA100 Helper contains the VERIFY notice",
    saFlat.some(
      (c) => typeof c === "string" && c.includes("VERIFY"),
    ),
  );

  // Transactions sheet should have a row per transaction plus header.
  const txSheet = wb.Sheets["Transactions"];
  const txAoa = XLSX.utils.sheet_to_json(txSheet, {
    header: 1,
  }) as unknown[][];
  // Rows: title, blank, header, then 3 transactions = 6 rows.
  ok(
    "Transactions sheet has expected row count",
    txAoa.length >= 5,
    `${txAoa.length} rows`,
  );

  // Suggestions sheet should have a row per suggestion plus header.
  const sugSheet = wb.Sheets["Suggestions"];
  const sugAoa = XLSX.utils.sheet_to_json(sugSheet, {
    header: 1,
  }) as unknown[][];
  ok(
    "Suggestions sheet has at least one suggestion row",
    sugAoa.length > 3,
    `${sugAoa.length} rows including title + header`,
  );

  // Band Breakdown should mirror taxResult.breakdown.length plus header rows.
  const bandsSheet = wb.Sheets["Band Breakdown"];
  const bandsAoa = XLSX.utils.sheet_to_json(bandsSheet, {
    header: 1,
  }) as unknown[][];
  ok(
    "Band Breakdown row count covers taxResult.breakdown",
    bandsAoa.length >= taxResult.breakdown.length + 2,
    `${bandsAoa.length} rows vs ${taxResult.breakdown.length} band entries`,
  );
}

// ─── JSON ─────────────────────────────────────────────────────────────────

console.log("\n→ generateJSON — round-trip");
{
  const json = generateJSON(data);
  ok("JSON string non-empty", json.length > 0);

  let parsed: ExportData & Record<string, unknown>;
  try {
    parsed = JSON.parse(json);
  } catch {
    parsed = {} as ExportData & Record<string, unknown>;
  }

  ok("JSON has taxResult", parsed.taxResult !== undefined);
  ok("JSON has transactions", Array.isArray(parsed.transactions));
  ok("JSON has incomes", parsed.incomes !== undefined);
  ok("JSON has suggestions", Array.isArray(parsed.suggestions));

  eq(
    "JSON preserves total income tax",
    parsed.taxResult?.totalIncomeTax,
    taxResult.totalIncomeTax,
  );
}

// ─── Summary ──────────────────────────────────────────────────────────────

console.log(
  `\n${passed}/${passed + failed} assertions passed` +
    (failed > 0 ? ` — ${failed} failed: ${failures.join(", ")}` : ""),
);
if (failed > 0) process.exit(1);
