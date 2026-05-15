/* tests/calculator.test.ts — regression tests for src/lib/taxCalculator.ts.
 *
 * Covers every scenario in the Sprint 2 acceptance table of the project
 * brief (info/PROJECT_BRIEF.md). The pension-relief case is checked at £0.01
 * tolerance — it is the canary for incorrect band extension, which is the
 * most common bug in calculators of this kind. The other cases use a £1
 * tolerance to absorb harmless floating-point drift.
 *
 * Tests are written as a self-contained script: no framework, just
 * console.log markers and a non-zero exit on failure. Run with
 * `npm run test`. */

import {
  calculateTax,
  type IncomeInputs,
  type TaxResult,
} from "../src/lib/taxCalculator";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function expect(label: string, actual: number, expected: number, tolerance = 1): void {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    console.log(
      `  ✓ ${label}: ${actual.toFixed(2)} (expected ${expected.toFixed(2)}, tol ±${tolerance})`,
    );
    passed++;
  } else {
    console.log(
      `  ✗ ${label}: ${actual.toFixed(2)} (expected ${expected.toFixed(2)}, diff ${diff.toFixed(2)})`,
    );
    failed++;
    failures.push(label);
  }
}

function scenario(
  name: string,
  input: IncomeInputs,
  assertions: (result: TaxResult) => void,
): void {
  console.log(`\n→ ${name}`);
  const result = calculateTax(input);
  assertions(result);
}

// ─── Sprint 2 acceptance table ─────────────────────────────────────────────

scenario("£10,000 earned (2025/26 EWN)", { earnedIncome: 10000 }, (r) => {
  expect("Total income tax", r.totalIncomeTax, 0);
  expect("National Insurance", r.nationalInsurance, 0);
  expect("Personal allowance applied", r.personalAllowance, 12570, 0.01);
  expect("Taxable earned", r.taxableEarned, 0, 0.01);
});

scenario("£30,000 earned (2025/26 EWN)", { earnedIncome: 30000 }, (r) => {
  expect("Total income tax", r.totalIncomeTax, 3486);
  expect("National Insurance", r.nationalInsurance, 1394.4);
});

scenario("£60,000 earned (2025/26 EWN)", { earnedIncome: 60000 }, (r) => {
  expect("Total income tax", r.totalIncomeTax, 11432);
  expect("National Insurance", r.nationalInsurance, 3210.6);
});

scenario(
  "£115,000 earned (2025/26 EWN — PA taper)",
  { earnedIncome: 115000 },
  (r) => {
    expect("Personal allowance applied", r.personalAllowance, 5070, 0.01);
    expect("Personal allowance lost", r.personalAllowanceLost, 7500, 0.01);
    expect("Total income tax", r.totalIncomeTax, 36432);
  },
);

scenario(
  "£160,000 earned (2025/26 EWN — PA fully tapered)",
  { earnedIncome: 160000 },
  (r) => {
    expect("Personal allowance applied", r.personalAllowance, 0, 0.01);
    expect("Total income tax", r.totalIncomeTax, 58203);
  },
);

scenario(
  "£115,000 earned + £15,000 gross pension (PA recovery + band extension)",
  { earnedIncome: 115000, pensionContributionsGross: 15000 },
  (r) => {
    expect("Personal allowance fully restored", r.personalAllowance, 12570, 0.01);
    expect("Personal allowance lost", r.personalAllowanceLost, 0, 0.01);
    // Baseline tax for £115k earner: £36,432. Expected saving: exactly £6,000.
    // Pension-extended tax: £30,432. Exact 1p tolerance — this is the canary.
    expect("Total income tax", r.totalIncomeTax, 30432, 0.01);
    expect("Income-tax saving vs baseline", 36432 - r.totalIncomeTax, 6000, 0.01);
  },
);

scenario(
  "£50,000 earned + £5,000 dividends (dividend allowance band-space)",
  { earnedIncome: 50000, dividendIncome: 5000 },
  (r) => {
    // £37,430 earned in basic at 20% = £7,486.
    // Dividend allowance £500 at 0% advances cursor: £270 in basic +
    // £230 in higher rate space. Remaining £4,500 at higher-rate dividend
    // (33.75%) = £1,518.75. Total income tax £9,004.75.
    expect("Total income tax", r.totalIncomeTax, 9004.75);
  },
);

scenario(
  "£50,000 earned (Scotland 2025/26)",
  { earnedIncome: 50000, region: "scotland" },
  (r) => {
    // Scottish bands on taxable £37,430: starter 2,827 @ 19% + basic 12,094
    // @ 20% + intermediate 16,171 @ 21% + higher 6,338 @ 42% = £9,013.80.
    expect("Total income tax", r.totalIncomeTax, 9013.8);
  },
);

scenario(
  "£30,000 earned (2026/27 EWN — bands unchanged)",
  { earnedIncome: 30000, taxYear: "2026/27" },
  (r) => {
    expect("Total income tax", r.totalIncomeTax, 3486);
  },
);

// ─── Summary ────────────────────────────────────────────────────────────────

console.log(
  `\n${passed}/${passed + failed} assertions passed` +
    (failed > 0 ? ` — ${failed} failed: ${failures.join(", ")}` : ""),
);

if (failed > 0) {
  process.exit(1);
}
