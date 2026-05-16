/* src/lib/export.ts — generate filing-ready Excel workbooks and JSON.
 *
 * `generateExcel` returns an ArrayBuffer suitable for a browser Blob download
 * or a Next.js API response body. The workbook has five sheets:
 *
 *   1. Summary       — headline figures: tax year, region, income breakdown,
 *                      allowances applied, tax computation, take-home,
 *                      effective + marginal rates. Plus a disclaimer.
 *   2. Band Breakdown — every entry in `taxResult.breakdown` with band name,
 *                      amount in that band, rate, and tax paid in that band.
 *   3. Transactions  — every classified transaction with date, description,
 *                      amount, category, and confidence.
 *   4. SA100 Helper  — figures pre-keyed to HMRC self-assessment boxes
 *                      (SA102 box 1, SA103S/F, SA105 box 20, SA100 interest /
 *                      dividends / TR4) so the user can transcribe them. Tops
 *                      with a verify-against-source notice.
 *   5. Suggestions   — the suggestion list with title, category, estimated
 *                      saving, why, action, and caveats.
 *
 * `generateJSON` returns the same ExportData serialised with two-space
 * indentation — handy for programmatic re-import or for users who want their
 * own analysis in another tool.
 *
 * Implementation note: this module uses the npm `xlsx` package (SheetJS
 * community edition). The npm distribution is older than the maintainers'
 * preferred CDN release; for production deployments consider pinning to the
 * CDN tarball. For the Sprint 5 sheet shapes — values plus column widths and
 * currency / percent number formats — the npm version is sufficient. */

import * as XLSX from "xlsx";

import type { TaxResult } from "./taxCalculator";
import type {
  ClassifiedTransaction,
  InferredIncomes,
} from "./statementParser";
import type { Suggestion } from "./suggestions";
import { getRules } from "./taxRules";

// ─── Public types ──────────────────────────────────────────────────────────

/**
 * Everything the export module needs to build a workbook or JSON file.
 * Constructed by the caller from the running React state in Sprint 11.
 */
export interface ExportData {
  taxResult: TaxResult;
  transactions: ClassifiedTransaction[];
  incomes: InferredIncomes;
  suggestions: Suggestion[];
}

// ─── Cell-building helpers ─────────────────────────────────────────────────

const CURRENCY_FMT = '"£"#,##0.00';
const PERCENT_FMT = "0.00%";
const DATE_FMT = "yyyy-mm-dd";

type CellValue = string | number | Date | null | undefined;

/** Build a single text cell. */
function textCell(value: string): XLSX.CellObject {
  return { v: value, t: "s" };
}

/** Build a single number cell with a currency or percent format. */
function numberCell(
  value: number,
  fmt: typeof CURRENCY_FMT | typeof PERCENT_FMT | undefined,
): XLSX.CellObject {
  const cell: XLSX.CellObject = { v: value, t: "n" };
  if (fmt) cell.z = fmt;
  return cell;
}

function dateCell(value: Date): XLSX.CellObject {
  return { v: value, t: "d", z: DATE_FMT };
}

/** Convert a (zero-indexed row, zero-indexed column) into an A1 reference. */
function addr(row: number, col: number): string {
  return XLSX.utils.encode_cell({ r: row, c: col });
}

/**
 * Build a worksheet from an array-of-arrays of "specs". Each spec is either:
 *   - undefined / null : skip the cell (leave blank)
 *   - string           : text cell
 *   - number           : number cell (callers wrap in `currency` / `percent`
 *                        to attach a format)
 *   - Date             : date cell
 *   - { v, t, z }      : a pre-built CellObject
 *
 * We avoid `XLSX.utils.aoa_to_sheet` because we want per-cell number formats
 * (currency, percent, dates) which the AOA helper does not preserve.
 */
type Spec =
  | CellValue
  | { currency: number }
  | { percent: number }
  | XLSX.CellObject;

function buildSheet(rows: Spec[][]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  let maxCol = 0;
  let maxRow = 0;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const spec = row[c];
      let cell: XLSX.CellObject | null = null;

      if (spec === null || spec === undefined || spec === "") {
        cell = null;
      } else if (typeof spec === "string") {
        cell = textCell(spec);
      } else if (typeof spec === "number") {
        cell = numberCell(spec, undefined);
      } else if (spec instanceof Date) {
        cell = dateCell(spec);
      } else if (typeof spec === "object" && "currency" in spec) {
        cell = numberCell(spec.currency, CURRENCY_FMT);
      } else if (typeof spec === "object" && "percent" in spec) {
        cell = numberCell(spec.percent, PERCENT_FMT);
      } else if (typeof spec === "object" && "v" in spec) {
        cell = spec as XLSX.CellObject;
      }

      if (cell !== null) {
        ws[addr(r, c)] = cell;
        if (c > maxCol) maxCol = c;
        if (r > maxRow) maxRow = r;
      }
    }
  }

  ws["!ref"] = `A1:${XLSX.utils.encode_cell({ r: maxRow, c: maxCol })}`;
  return ws;
}

/** Convenience: mark a numeric value as currency-formatted. */
function gbp(value: number): { currency: number } {
  return { currency: value };
}

/** Convenience: mark a numeric value as percent-formatted (0.20 → 20.00%). */
function pct(value: number): { percent: number } {
  return { percent: value };
}

// ─── Sheet builders ────────────────────────────────────────────────────────

function buildSummary(data: ExportData): XLSX.WorkSheet {
  const { taxResult: r, incomes: i } = data;
  const rules = getRules(r.taxYear);
  const regionLabel =
    r.region === "scotland" ? "Scotland" : "England / Wales / Northern Ireland";

  const rows: Spec[][] = [
    ["UK Tax Advisor — Summary"],
    [],
    ["Tax year", r.taxYear],
    ["Region", regionLabel],
    [],
    ["Income breakdown"],
    ["  Salary (earned)", gbp(i.earnedIncome)],
    ["  Self-employment", gbp(i.selfEmploymentIncome)],
    ["  Rental income", gbp(i.rentalIncome)],
    ["  Savings interest", gbp(i.savingsIncome)],
    ["  Dividend income", gbp(i.dividendIncome)],
    ["  Gross income", gbp(r.grossIncome)],
    [],
    ["Allowances"],
    ["  Personal allowance applied", gbp(r.personalAllowance)],
    ["  Personal allowance lost (taper)", gbp(r.personalAllowanceLost)],
    ["  Dividend allowance", gbp(rules.dividendAllowance)],
    ["  Starting rate for savings band", gbp(rules.startingRateForSavings)],
    ["  ISA annual allowance", gbp(rules.isaAllowance)],
    ["  Pension annual allowance", gbp(rules.pensionAnnualAllowance)],
    [],
    ["Tax computation"],
    ["  Income tax on earned", gbp(r.incomeTaxOnEarned)],
    ["  Income tax on savings", gbp(r.incomeTaxOnSavings)],
    ["  Income tax on dividends", gbp(r.incomeTaxOnDividends)],
    ["  Total income tax", gbp(r.totalIncomeTax)],
    ["  National insurance (Class 1)", gbp(r.nationalInsurance)],
    ["  Total tax and NI", gbp(r.totalTaxAndNI)],
    [],
    ["Position"],
    ["  Effective rate", pct(r.effectiveRate)],
    ["  Marginal rate (next £ of earned)", pct(r.marginalRate)],
    ["  Take-home", gbp(r.takeHome)],
    [],
    ["Disclaimer"],
    [
      "These figures are estimates produced by a software tool. They are NOT regulated financial advice. Verify against HMRC, your P60, payslips, dividend vouchers and any other supporting documents before relying on them for filing.",
    ],
  ];

  const ws = buildSheet(rows);
  ws["!cols"] = [{ wch: 42 }, { wch: 22 }];
  return ws;
}

function buildBands(taxResult: TaxResult): XLSX.WorkSheet {
  const rows: Spec[][] = [
    ["UK Tax Advisor — Band breakdown"],
    [],
    ["Band", "Taxable in band", "Rate", "Tax in band"],
  ];

  for (const entry of taxResult.breakdown) {
    rows.push([
      entry.bandName,
      gbp(entry.taxableInBand),
      pct(entry.rate),
      gbp(entry.tax),
    ]);
  }

  rows.push([]);
  rows.push([
    "Total income tax",
    gbp(taxResult.taxableEarned + taxResult.taxableSavings + taxResult.taxableDividends),
    null,
    gbp(taxResult.totalIncomeTax),
  ]);

  const ws = buildSheet(rows);
  ws["!cols"] = [
    { wch: 38 },
    { wch: 18 },
    { wch: 10 },
    { wch: 16 },
  ];
  return ws;
}

function buildTransactions(
  transactions: ClassifiedTransaction[],
): XLSX.WorkSheet {
  const rows: Spec[][] = [
    ["UK Tax Advisor — Classified transactions"],
    [],
    ["Date", "Description", "Amount", "Category", "Confidence"],
  ];

  for (const tx of transactions) {
    rows.push([
      tx.date,
      tx.description,
      gbp(tx.amount),
      tx.category,
      tx.confidence,
    ]);
  }

  const ws = buildSheet(rows);
  ws["!cols"] = [
    { wch: 12 },
    { wch: 42 },
    { wch: 14 },
    { wch: 22 },
    { wch: 12 },
  ];
  return ws;
}

function buildSA100(data: ExportData): XLSX.WorkSheet {
  const { incomes: i } = data;

  const rows: Spec[][] = [
    ["UK Tax Advisor — Self-Assessment helper"],
    [],
    [
      "VERIFY EVERY FIGURE BELOW against your original payslips, P60, dividend vouchers, charity receipts and pension statements. These are the calculator's inferences from your bank statements — they ARE NOT a substitute for HMRC source documents. This is not a filed return.",
    ],
    [],
    ["Form / Box", "Description", "Inferred figure"],
    [
      "SA102 box 1",
      "Pay from this employment (salary, gross)",
      gbp(i.earnedIncome),
    ],
    [
      "SA103S box 9 / SA103F box 15",
      "Self-employment turnover",
      gbp(i.selfEmploymentIncome),
    ],
    ["SA105 box 20", "Property income", gbp(i.rentalIncome)],
    [
      "SA100 (interest box)",
      "UK savings interest (excluding ISAs)",
      gbp(i.savingsIncome),
    ],
    [
      "SA100 (dividends box)",
      "UK company dividends (excluding ISAs)",
      gbp(i.dividendIncome),
    ],
    [
      "SA100 TR4 (Gift Aid)",
      "Gift Aid donations — verify these are NET payments and gross up by × 1.25 if you declared Gift Aid",
      gbp(i.charityDonations),
    ],
    [
      "SA100 TR4 (pensions)",
      "Personal pension contributions — confirm whether these are net (relief at source) or gross",
      gbp(i.pensionContributions),
    ],
  ];

  const ws = buildSheet(rows);
  ws["!cols"] = [{ wch: 30 }, { wch: 60 }, { wch: 18 }];
  return ws;
}

function buildSuggestions(suggestions: Suggestion[]): XLSX.WorkSheet {
  const rows: Spec[][] = [
    ["UK Tax Advisor — Tax-saving suggestions"],
    [],
    [
      "Title",
      "Category",
      "Estimated annual saving",
      "Why this applies",
      "What to do",
      "Caveats",
    ],
  ];

  for (const s of suggestions) {
    rows.push([
      s.title,
      s.category,
      gbp(s.estimatedSaving),
      s.why,
      s.action,
      s.caveats.join(" • "),
    ]);
  }

  const ws = buildSheet(rows);
  ws["!cols"] = [
    { wch: 42 },
    { wch: 14 },
    { wch: 18 },
    { wch: 64 },
    { wch: 48 },
    { wch: 60 },
  ];
  return ws;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Generate a 5-sheet Excel workbook from `data`. Returns an ArrayBuffer
 * suitable for use as a Blob or as the body of an HTTP response.
 */
export function generateExcel(data: ExportData): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSummary(data), "Summary");
  XLSX.utils.book_append_sheet(wb, buildBands(data.taxResult), "Band Breakdown");
  XLSX.utils.book_append_sheet(
    wb,
    buildTransactions(data.transactions),
    "Transactions",
  );
  XLSX.utils.book_append_sheet(wb, buildSA100(data), "SA100 Helper");
  XLSX.utils.book_append_sheet(
    wb,
    buildSuggestions(data.suggestions),
    "Suggestions",
  );
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  // XLSX.write with type:'array' returns Uint8Array under the hood in some
  // versions; normalise to ArrayBuffer for consistent downstream typing.
  if (out instanceof ArrayBuffer) return out;
  return (out as Uint8Array).buffer.slice(
    (out as Uint8Array).byteOffset,
    (out as Uint8Array).byteOffset + (out as Uint8Array).byteLength,
  ) as ArrayBuffer;
}

/**
 * Generate a machine-readable JSON dump of the same export data. Two-space
 * indentation for legibility; Date fields serialise as ISO strings.
 */
export function generateJSON(data: ExportData): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Sanitise a tax-year string into something safe for a filename
 * (`2025/26` → `2025-26`).
 */
export function sanitiseTaxYearForFilename(taxYear: string): string {
  return taxYear.replace(/[\/\\:]/g, "-");
}
