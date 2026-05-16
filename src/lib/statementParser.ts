/* src/lib/statementParser.ts — CSV bank-statement parser, transaction
 * classifier, and annual-income inference for UK personal banking.
 *
 * Pure functions: takes raw CSV text, returns typed Transactions; takes
 * Transactions, returns ClassifiedTransactions; takes those and returns the
 * income aggregates the calculator (src/lib/taxCalculator.ts) consumes.
 *
 * Format support (per the Sprint 3 brief in info/PROJECT_BRIEF.md):
 *   - Monzo  — detected by the trio of `Amount`, `Name`, `Category` headers.
 *   - Starling — detected by `Amount (GBP)`.
 *   - Lloyds-style — detected by separate `Debit Amount` / `Credit Amount`
 *     (or `Money Out` / `Money In`) columns.
 *   - Generic — the fallback for HSBC, NatWest, Barclays, Revolut, etc.
 *     (single `Amount` column with positive/negative values).
 *
 * The CSV parser is a small RFC-4180-style state machine that handles quoted
 * fields, embedded commas, escaped quotes ("") and \r\n line endings without
 * pulling in a dependency.
 *
 * The classifier applies a list of regexes in first-match-wins order
 * (positive-only rules for income-shaped flows, negative-only rules for
 * outflows). Confidence values come straight from the brief — they are
 * intentionally rough so the UI can surface low-confidence transactions for
 * the user to confirm.
 *
 * Privacy: nothing in this module performs I/O. CSV text is passed in and
 * inferred figures are returned out — statements never leave the device. */

// ─── Public types ──────────────────────────────────────────────────────────

/**
 * One row from a bank statement, normalised into a structure the rest of the
 * app can consume regardless of which bank produced the CSV.
 */
export interface Transaction {
  /** Calendar date of the transaction. */
  date: Date;
  /** Best-effort human-readable description (counterparty + reference / notes). */
  description: string;
  /** Positive = credit (money in), negative = debit (money out), in pounds. */
  amount: number;
  /** Account balance after the transaction, if the bank provides one. */
  balance?: number;
  /** Original column-keyed row, kept for debugging and "needs review" UX. */
  raw: Record<string, string>;
}

/**
 * Income / expense categories the classifier can assign. Categories beyond
 * `expense` and `unknown` correspond to a specific tax-relevant flow.
 */
export type TxCategory =
  | "salary"
  | "savings-interest"
  | "dividend"
  | "pension-contribution"
  | "charity-donation"
  | "rental-income"
  | "self-employment-income"
  | "isa-deposit"
  | "transfer"
  | "expense"
  | "unknown";

/**
 * A transaction enriched with the classifier's verdict.
 */
export interface ClassifiedTransaction extends Transaction {
  category: TxCategory;
  /** 0–1 confidence score; values below 0.6 mark "needs review" candidates. */
  confidence: number;
}

/**
 * The annual-income summary downstream code (calculator, suggestions, UI)
 * consumes. Pension and charity totals are positive amounts even though the
 * underlying transactions are debits — the calculator wants gross amounts.
 */
export interface InferredIncomes {
  earnedIncome: number;
  savingsIncome: number;
  dividendIncome: number;
  rentalIncome: number;
  selfEmploymentIncome: number;
  pensionContributions: number;
  charityDonations: number;
  /** Low-confidence transactions large enough to matter (>£500). */
  needsReview: ClassifiedTransaction[];
}

/**
 * Which CSV layout the parser identified. Exposed so the UI can show
 * "Detected: Monzo" and so the test suite can assert detection.
 */
export type BankFormat = "monzo" | "starling" | "lloyds" | "generic";

/**
 * Result of parsing a single CSV blob.
 */
export interface ParseResult {
  format: BankFormat;
  transactions: Transaction[];
}

// ─── CSV parser (RFC-4180-ish, hand-rolled to avoid a dependency) ───────────

/**
 * Split CSV text into rows of fields. Handles quoted fields, embedded commas,
 * `""` as an escaped quote, and `\r\n` line endings. Strips a leading UTF-8
 * BOM if present. Empty trailing lines are dropped.
 */
function parseCSVText(content: string): string[][] {
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const flushRow = () => {
    if (row.length === 0) return;
    if (row.length === 1 && row[0] === "") return;
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];

    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      field = "";
      flushRow();
    } else if (ch === "\r") {
      // Skip; the following \n triggers the row flush.
    } else {
      field += ch;
    }
  }

  // Trailing field without a final newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    flushRow();
  }

  return rows;
}

// ─── Date parsing ──────────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/**
 * Parse a UK-style date. Recognises DD/MM/YYYY, DD-MM-YYYY, DD MMM YYYY, plus
 * anything `new Date()` can handle (ISO 8601 etc.) as a last-resort fallback.
 * Two-digit years are assumed to be in the 21st century. Returns null rather
 * than throwing so the caller can skip the row gracefully.
 */
function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const s = value.trim();
  if (!s) return null;

  const slashOrDash = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(s);
  if (slashOrDash) {
    const day = parseInt(slashOrDash[1], 10);
    const month = parseInt(slashOrDash[2], 10) - 1;
    let year = parseInt(slashOrDash[3], 10);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
  }

  const monthName = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})$/.exec(s);
  if (monthName) {
    const day = parseInt(monthName[1], 10);
    const monthKey = monthName[2].toLowerCase().slice(0, 3);
    const month = MONTH_NAMES[monthKey];
    let year = parseInt(monthName[3], 10);
    if (year < 100) year += 2000;
    if (month !== undefined) {
      const d = new Date(year, month, day);
      return isNaN(d.getTime()) ? null : d;
    }
  }

  const native = new Date(s);
  return isNaN(native.getTime()) ? null : native;
}

// ─── Helpers for per-format extractors ─────────────────────────────────────

/**
 * Find the index of a header by case-insensitive exact match against any of
 * the given candidate names. Returns -1 when none match. Trims both sides
 * before comparing so headers from PDF-extracted CSVs ("Date, Description,
 * Amount" — with the space the model inserts after each comma) still match.
 */
function findHeader(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const lc = candidate.trim().toLowerCase();
    const idx = headers.findIndex((h) => h.trim().toLowerCase() === lc);
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * Parse a numeric field, tolerating currency symbols, commas, and whitespace.
 * Returns NaN for empty or unparseable values so callers can decide how to
 * react (Lloyds-style debit/credit pairs use this to detect "no value here").
 */
function asNumber(value: string | undefined): number {
  if (value === undefined) return NaN;
  const cleaned = value.replace(/[£$,\s]/g, "");
  if (cleaned === "") return NaN;
  const n = parseFloat(cleaned);
  return n;
}

/** Build a `Transaction.raw` map for the original column-keyed row. */
function rawRecord(headers: string[], cols: string[]): Record<string, string> {
  const r: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    r[headers[i]] = cols[i] ?? "";
  }
  return r;
}

// ─── Format detection ──────────────────────────────────────────────────────

/**
 * Inspect the header row to decide which extractor to dispatch to. Order
 * matters: Monzo and Starling are distinguished by their specific column
 * names; Lloyds by the presence of separate debit/credit columns; otherwise
 * we treat the file as a generic single-Amount-column statement.
 */
function detectFormat(headers: string[]): BankFormat {
  const lc = headers.map((h) => h.trim().toLowerCase());

  const hasMonzoTriple =
    lc.includes("amount") && lc.includes("name") && lc.includes("category");
  if (hasMonzoTriple) return "monzo";

  if (lc.includes("amount (gbp)")) return "starling";

  if (lc.includes("debit amount") || lc.includes("money out")) {
    return "lloyds";
  }

  return "generic";
}

// ─── Per-format extractors ─────────────────────────────────────────────────

function extractMonzo(headers: string[], rows: string[][]): Transaction[] {
  const dateIdx = findHeader(headers, ["Date"]);
  const nameIdx = findHeader(headers, ["Name"]);
  const amountIdx = findHeader(headers, ["Amount"]);
  const balanceIdx = findHeader(headers, ["Balance"]);
  const descIdx = findHeader(headers, [
    "Description",
    "Notes and #tags",
    "Notes",
  ]);

  const out: Transaction[] = [];
  for (const cols of rows) {
    const date = parseDate(cols[dateIdx]);
    if (!date) continue;
    const name = cols[nameIdx] ?? "";
    const extra = descIdx >= 0 ? (cols[descIdx] ?? "") : "";
    const description = [name, extra].filter((s) => s.length > 0).join(" ").trim();
    const amount = asNumber(cols[amountIdx]);
    if (isNaN(amount)) continue;
    const balance = balanceIdx >= 0 ? asNumber(cols[balanceIdx]) : NaN;
    out.push({
      date,
      description,
      amount,
      balance: isNaN(balance) ? undefined : balance,
      raw: rawRecord(headers, cols),
    });
  }
  return out;
}

function extractStarling(headers: string[], rows: string[][]): Transaction[] {
  const dateIdx = findHeader(headers, ["Date"]);
  const counterIdx = findHeader(headers, ["Counter Party", "Counterparty"]);
  const refIdx = findHeader(headers, ["Reference"]);
  const amountIdx = findHeader(headers, ["Amount (GBP)"]);
  const balanceIdx = findHeader(headers, ["Balance (GBP)", "Balance"]);

  const out: Transaction[] = [];
  for (const cols of rows) {
    const date = parseDate(cols[dateIdx]);
    if (!date) continue;
    const counter = counterIdx >= 0 ? (cols[counterIdx] ?? "") : "";
    const ref = refIdx >= 0 ? (cols[refIdx] ?? "") : "";
    const description = [counter, ref].filter((s) => s.length > 0).join(" ").trim();
    const amount = asNumber(cols[amountIdx]);
    if (isNaN(amount)) continue;
    const balance = balanceIdx >= 0 ? asNumber(cols[balanceIdx]) : NaN;
    out.push({
      date,
      description,
      amount,
      balance: isNaN(balance) ? undefined : balance,
      raw: rawRecord(headers, cols),
    });
  }
  return out;
}

function extractLloyds(headers: string[], rows: string[][]): Transaction[] {
  const dateIdx = findHeader(headers, ["Transaction Date", "Date"]);
  const descIdx = findHeader(headers, [
    "Transaction Description",
    "Description",
    "Details",
  ]);
  const debitIdx = findHeader(headers, ["Debit Amount", "Money Out"]);
  const creditIdx = findHeader(headers, ["Credit Amount", "Money In"]);
  const balanceIdx = findHeader(headers, ["Balance"]);

  const out: Transaction[] = [];
  for (const cols of rows) {
    const date = parseDate(cols[dateIdx]);
    if (!date) continue;
    const debit = debitIdx >= 0 ? asNumber(cols[debitIdx]) : NaN;
    const credit = creditIdx >= 0 ? asNumber(cols[creditIdx]) : NaN;
    let amount: number;
    if (!isNaN(credit) && credit > 0) amount = credit;
    else if (!isNaN(debit) && debit > 0) amount = -debit;
    else continue;
    const balance = balanceIdx >= 0 ? asNumber(cols[balanceIdx]) : NaN;
    out.push({
      date,
      description: (descIdx >= 0 ? cols[descIdx] : "") ?? "",
      amount,
      balance: isNaN(balance) ? undefined : balance,
      raw: rawRecord(headers, cols),
    });
  }
  return out;
}

function extractGeneric(headers: string[], rows: string[][]): Transaction[] {
  const dateIdx = findHeader(headers, ["Date", "Transaction Date"]);
  const descIdx = findHeader(headers, [
    "Description",
    "Details",
    "Memo",
    "Narrative",
  ]);
  const amountIdx = findHeader(headers, ["Amount", "Value"]);
  const balanceIdx = findHeader(headers, ["Balance"]);

  const out: Transaction[] = [];
  for (const cols of rows) {
    const date = parseDate(cols[dateIdx]);
    if (!date) continue;
    const amount = asNumber(cols[amountIdx]);
    if (isNaN(amount)) continue;
    const balance = balanceIdx >= 0 ? asNumber(cols[balanceIdx]) : NaN;
    out.push({
      date,
      description: (descIdx >= 0 ? cols[descIdx] : "") ?? "",
      amount,
      balance: isNaN(balance) ? undefined : balance,
      raw: rawRecord(headers, cols),
    });
  }
  return out;
}

// ─── Public parser ─────────────────────────────────────────────────────────

/**
 * Parse a CSV bank-statement blob into a typed transaction list. Auto-detects
 * the format from the header row and dispatches to the right extractor.
 */
export function parseCSV(content: string): ParseResult {
  const rows = parseCSVText(content);
  if (rows.length < 2) {
    return { format: "generic", transactions: [] };
  }
  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);
  const format = detectFormat(headers);

  let transactions: Transaction[];
  switch (format) {
    case "monzo":
      transactions = extractMonzo(headers, dataRows);
      break;
    case "starling":
      transactions = extractStarling(headers, dataRows);
      break;
    case "lloyds":
      transactions = extractLloyds(headers, dataRows);
      break;
    default:
      transactions = extractGeneric(headers, dataRows);
      break;
  }
  return { format, transactions };
}

// ─── Classifier ────────────────────────────────────────────────────────────

interface ClassifierRule {
  category: TxCategory;
  regex: RegExp;
  /** "positive" matches credits only; "negative" matches debits only; omit
   *  to match either sign. */
  sign?: "positive" | "negative";
  confidence: number;
}

/**
 * First-match-wins classifier rules straight from the Sprint 3 brief. Order
 * here is significant: more specific patterns appear before fallbacks. The
 * `transfer` rule sits last among the keyword rules because "transfer" can
 * appear in genuinely-classifiable transactions (e.g. "Bank transfer from
 * salary") that other rules should catch first.
 */
const RULES: readonly ClassifierRule[] = [
  {
    category: "salary",
    regex: /\b(salary|wages|payroll|net pay|monthly pay)\b/i,
    sign: "positive",
    confidence: 0.95,
  },
  {
    category: "savings-interest",
    regex: /\b(interest|int\.|credit interest|gross int)\b/i,
    sign: "positive",
    confidence: 0.9,
  },
  {
    category: "dividend",
    regex: /\b(dividend|div\.?|ord div|distribution)\b/i,
    sign: "positive",
    confidence: 0.9,
  },
  {
    category: "pension-contribution",
    regex: /\b(pension|sipp|aviva|nest|hl pension|vanguard pension)\b/i,
    sign: "negative",
    confidence: 0.85,
  },
  {
    category: "charity-donation",
    regex: /\b(donation|charity|gift aid|just ?giving|oxfam|red cross|rspca|cancer research)\b/i,
    sign: "negative",
    confidence: 0.8,
  },
  {
    category: "isa-deposit",
    regex: /\b(isa|stocks ?& ?shares|s&s isa)\b/i,
    sign: "negative",
    confidence: 0.75,
  },
  {
    category: "rental-income",
    regex: /\b(rent|rental|landlord)\b/i,
    sign: "positive",
    confidence: 0.85,
  },
  {
    category: "self-employment-income",
    regex: /\b(invoice|freelance|consult|self ?employ|stripe|paypal|wise)\b/i,
    sign: "positive",
    confidence: 0.7,
  },
  {
    category: "transfer",
    regex: /\b(transfer|tfr|to savings|from savings)\b/i,
    confidence: 0.6,
  },
];

/**
 * Classify each transaction. Falls back to `unknown` for unmatched credits
 * and `expense` for unmatched debits, both at confidence 0.3.
 */
export function classify(txs: Transaction[]): ClassifiedTransaction[] {
  return txs.map((tx) => {
    const isPositive = tx.amount > 0;
    for (const rule of RULES) {
      if (rule.sign === "positive" && !isPositive) continue;
      if (rule.sign === "negative" && isPositive) continue;
      if (rule.regex.test(tx.description)) {
        return { ...tx, category: rule.category, confidence: rule.confidence };
      }
    }
    return {
      ...tx,
      category: isPositive ? "unknown" : "expense",
      confidence: 0.3,
    };
  });
}

// ─── Income inference ──────────────────────────────────────────────────────

/**
 * Aggregate classified transactions into the income summary the rest of the
 * app consumes. Pension and charity totals are returned as positive amounts
 * (the underlying transactions are negative debits, but the calculator
 * expects gross contribution figures).
 *
 * `needsReview` lists low-confidence transactions worth at least £500 — the
 * UI surfaces these for the user to confirm or recategorise.
 */
export function inferIncomes(
  classified: ClassifiedTransaction[],
): InferredIncomes {
  const totals: Record<TxCategory, number> = {
    salary: 0,
    "savings-interest": 0,
    dividend: 0,
    "pension-contribution": 0,
    "charity-donation": 0,
    "rental-income": 0,
    "self-employment-income": 0,
    "isa-deposit": 0,
    transfer: 0,
    expense: 0,
    unknown: 0,
  };

  for (const tx of classified) {
    totals[tx.category] += tx.amount;
  }

  const needsReview = classified.filter(
    (tx) => tx.confidence < 0.6 && Math.abs(tx.amount) > 500,
  );

  return {
    earnedIncome: totals.salary,
    savingsIncome: totals["savings-interest"],
    dividendIncome: totals.dividend,
    rentalIncome: totals["rental-income"],
    selfEmploymentIncome: totals["self-employment-income"],
    pensionContributions: Math.abs(totals["pension-contribution"]),
    charityDonations: Math.abs(totals["charity-donation"]),
    needsReview,
  };
}
