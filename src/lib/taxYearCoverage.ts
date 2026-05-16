/* src/lib/taxYearCoverage.ts — work out which UK tax years a set of
 * transactions covers, and how complete each tax year's coverage is by
 * month.
 *
 * Two callers:
 *   - the upload page, which uses this to render the "detected tax year"
 *     summary and the monthly coverage timeline;
 *   - the calculate page (future), which could use it to gate accurate
 *     annualisation. */

import type { ClassifiedTransaction } from "./statementParser";
import { taxYearForDate, type TaxYear } from "./taxRules";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Coverage detail for one UK tax year. */
export interface TaxYearCoverage {
  taxYear: TaxYear;
  /** Twelve consecutive months from April Y through March Y+1, in order. */
  months: MonthCoverage[];
  /** How many of those twelve months have at least one transaction. */
  monthsCovered: number;
  /** Transactions counted into this tax year. */
  transactionCount: number;
  /** The earliest and latest transaction dates falling in this year. */
  earliest?: Date;
  latest?: Date;
}

export interface MonthCoverage {
  /** "YYYY-MM" key. */
  key: string;
  /** Human-readable label like "Apr 2025". */
  label: string;
  /** True if at least one transaction falls in that calendar month. */
  covered: boolean;
}

/**
 * Compute coverage for every UK tax year touched by the transactions.
 * Returns one entry per tax year that had any transactions in it; sorted
 * by tax year ascending. Transactions outside the encoded year range
 * (currently 2025/26 and 2026/27) are silently ignored.
 */
export function detectCoverage(
  transactions: ClassifiedTransaction[],
): TaxYearCoverage[] {
  const byYear = new Map<
    TaxYear,
    { covered: Set<string>; txs: ClassifiedTransaction[] }
  >();

  for (const tx of transactions) {
    let year: TaxYear;
    try {
      year = taxYearForDate(tx.date);
    } catch {
      continue;
    }
    const bucket = byYear.get(year) ?? {
      covered: new Set<string>(),
      txs: [] as ClassifiedTransaction[],
    };
    bucket.covered.add(monthKey(tx.date));
    bucket.txs.push(tx);
    byYear.set(year, bucket);
  }

  const result: TaxYearCoverage[] = [];
  for (const [taxYear, { covered, txs }] of byYear.entries()) {
    const months = monthsInTaxYear(taxYear).map((m) => ({
      ...m,
      covered: covered.has(m.key),
    }));
    const sorted = txs.slice().sort((a, b) => a.date.getTime() - b.date.getTime());
    result.push({
      taxYear,
      months,
      monthsCovered: covered.size,
      transactionCount: txs.length,
      earliest: sorted[0]?.date,
      latest: sorted[sorted.length - 1]?.date,
    });
  }

  result.sort((a, b) => a.taxYear.localeCompare(b.taxYear));
  return result;
}

/** Pick the tax year with the most coverage; used to suggest a default. */
export function primaryTaxYear(
  coverage: TaxYearCoverage[],
): TaxYearCoverage | null {
  if (coverage.length === 0) return null;
  return coverage.reduce((best, c) =>
    c.transactionCount > best.transactionCount ? c : best,
  );
}

/**
 * True if `date` falls inside the UK tax year named by `year` — i.e.
 * between 6 April Y inclusive and 5 April Y+1 inclusive.
 */
export function isInTaxYear(date: Date, year: TaxYear): boolean {
  try {
    return taxYearForDate(date) === year;
  } catch {
    return false;
  }
}

/** Filter transactions down to those falling within the given tax year. */
export function filterToTaxYear(
  transactions: ClassifiedTransaction[],
  year: TaxYear,
): ClassifiedTransaction[] {
  return transactions.filter((t) => isInTaxYear(t.date, year));
}

/**
 * The twelve calendar months of a UK tax year (Apr Y → Mar Y+1).
 */
function monthsInTaxYear(year: TaxYear): { key: string; label: string }[] {
  const [startYearStr] = year.split("/");
  const startYear = parseInt(startYearStr, 10);
  const months: { key: string; label: string }[] = [];
  for (let m = 4; m <= 12; m++) {
    months.push({
      key: `${startYear}-${String(m).padStart(2, "0")}`,
      label: `${MONTH_LABELS[m - 1]} ${startYear}`,
    });
  }
  const nextYear = startYear + 1;
  for (let m = 1; m <= 3; m++) {
    months.push({
      key: `${nextYear}-${String(m).padStart(2, "0")}`,
      label: `${MONTH_LABELS[m - 1]} ${nextYear}`,
    });
  }
  return months;
}

function monthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
