/* app/upload/page.tsx — first user-facing flow.
 *
 * Drop CSV bank statements → parse + classify in the browser → show
 * transactions and an inferred annual income summary → continue to
 * /calculate when at least salary income is set. State persists to
 * localStorage so a reload preserves work.
 *
 * Privacy: nothing on this page calls the network. CSV text is read with
 * the File API, parsed by src/lib/statementParser.ts, and stored locally. */

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FileDropzone, type UploadedFile } from "@/src/components/FileDropzone";
import { SiteFooter } from "@/src/components/SiteFooter";
import {
  effectiveIncomes,
  IncomeSummary,
  type IncomeOverrides,
  type NumericIncomeField,
} from "@/src/components/IncomeSummary";
import { TransactionsTable } from "@/src/components/TransactionsTable";
import { gbp } from "@/src/lib/format";
import {
  classify,
  inferIncomes,
  parseCSV,
  type BankFormat,
  type ClassifiedTransaction,
  type InferredIncomes,
  type TxCategory,
} from "@/src/lib/statementParser";

const STORAGE_KEY = "uk-tax-advisor:statements";

interface StatementMeta {
  filename: string;
  format: BankFormat;
  rowCount: number;
  uploadedAt: string;
}

interface PersistedState {
  statements: StatementMeta[];
  transactions: SerializedTransaction[];
  overrides: IncomeOverrides;
}

interface SerializedTransaction
  extends Omit<ClassifiedTransaction, "date" | "balance"> {
  date: string;
  balance?: number;
}

function serializeTx(tx: ClassifiedTransaction): SerializedTransaction {
  return { ...tx, date: tx.date.toISOString() };
}

function hydrateTx(tx: SerializedTransaction): ClassifiedTransaction {
  return { ...tx, date: new Date(tx.date) };
}

/** Days span from earliest to latest transaction, used for annualisation. */
function statementSpanDays(transactions: ClassifiedTransaction[]): number {
  if (transactions.length < 2) return 0;
  const times = transactions.map((t) => t.date.getTime());
  const span = Math.max(...times) - Math.min(...times);
  return span / (1000 * 60 * 60 * 24);
}

/** ×factor to annualise sub-12-month statements. 1 for short or full-year. */
function annualisationFactor(spanDays: number): number {
  if (spanDays < 28) return 1;
  if (spanDays >= 365) return 1;
  return 365 / spanDays;
}

export default function UploadPage() {
  const [statements, setStatements] = useState<StatementMeta[]>([]);
  const [transactions, setTransactions] = useState<ClassifiedTransaction[]>([]);
  const [overrides, setOverrides] = useState<IncomeOverrides>({});
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedState;
        if (Array.isArray(parsed.statements) && Array.isArray(parsed.transactions)) {
          setStatements(parsed.statements);
          setTransactions(parsed.transactions.map(hydrateTx));
          setOverrides(parsed.overrides ?? {});
        }
      }
    } catch {
      // Corrupt state — start clean.
    } finally {
      setHydrated(true);
    }
  }, []);

  // Persist on any change.
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const payload: PersistedState = {
      statements,
      transactions: transactions.map(serializeTx),
      overrides,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // localStorage may be unavailable (private mode, quota) — fail silently.
    }
  }, [statements, transactions, overrides, hydrated]);

  const handleFiles = useCallback((files: UploadedFile[]) => {
    const newStatements: StatementMeta[] = [];
    const newClassified: ClassifiedTransaction[] = [];
    for (const file of files) {
      const { format, transactions: parsed } = parseCSV(file.content);
      const classified = classify(parsed);
      newStatements.push({
        filename: file.name,
        format,
        rowCount: classified.length,
        uploadedAt: new Date().toISOString(),
      });
      newClassified.push(...classified);
    }
    setStatements((prev) => [...prev, ...newStatements]);
    setTransactions((prev) => [...prev, ...newClassified]);
  }, []);

  const handleCategoryChange = useCallback(
    (index: number, category: TxCategory) => {
      setTransactions((prev) =>
        prev.map((tx, i) =>
          // A manual recategorisation is an explicit confirmation, so we
          // also bump confidence to 1 — that drops the transaction out of
          // the "needs review" banner the moment the user resolves it.
          i === index ? { ...tx, category, confidence: 1 } : tx,
        ),
      );
    },
    [],
  );

  const handleOverride = useCallback(
    (field: NumericIncomeField, value: number | null) => {
      setOverrides((prev) => {
        const next = { ...prev };
        if (value === null) delete next[field];
        else next[field] = value;
        return next;
      });
    },
    [],
  );

  const clearAll = useCallback(() => {
    setStatements([]);
    setTransactions([]);
    setOverrides({});
  }, []);

  const inferred: InferredIncomes = useMemo(
    () => inferIncomes(transactions),
    [transactions],
  );
  const spanDays = useMemo(
    () => statementSpanDays(transactions),
    [transactions],
  );
  const factor = useMemo(() => annualisationFactor(spanDays), [spanDays]);
  const effective = useMemo(
    () => effectiveIncomes(inferred, overrides, factor),
    [inferred, overrides, factor],
  );

  const canContinue = effective.earnedIncome > 0;

  return (
    <main className="min-h-screen flex flex-col">
      <PrivacyBanner />

      <div className="max-w-4xl mx-auto w-full px-6 sm:px-12 py-12 flex-1">
        <header className="mb-10">
          <p className="font-sans text-[11px] uppercase tracking-[0.18em] text-muted mb-3">
            Step 1 of 3 · Upload
          </p>
          <h1 className="font-serif font-semibold text-4xl sm:text-5xl tracking-tight leading-[1.05]">
            Upload your bank statements
          </h1>
          <p className="mt-4 font-serif text-lg text-ink/80 max-w-2xl">
            Export CSVs from your bank and drop them below. Multiple files are
            fine — current account, savings, brokerage all in one go.
            Everything is parsed in your browser; nothing leaves the page.
          </p>
        </header>

        <section className="mb-10">
          <FileDropzone onFiles={handleFiles} />
          {statements.length > 0 && (
            <div className="mt-5 flex flex-wrap items-baseline justify-between gap-3">
              <ul className="text-sm text-muted space-y-1">
                {statements.map((s, i) => (
                  <li key={`${s.filename}-${i}`}>
                    <span className="font-mono text-ink">{s.filename}</span>
                    <span className="text-muted">
                      {" "}
                      — {formatBankLabel(s.format)} · {s.rowCount} transaction
                      {s.rowCount === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-muted underline underline-offset-4 hover:text-accent"
              >
                Clear all
              </button>
            </div>
          )}
        </section>

        {transactions.length > 0 && (
          <>
            <section className="mb-10">
              <IncomeSummary
                inferred={inferred}
                overrides={overrides}
                onOverride={handleOverride}
                annualisationFactor={factor}
              />
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">
                  Effective earned income for the calculator:{" "}
                  <span className="font-mono text-ink">
                    {gbp(effective.earnedIncome + effective.selfEmploymentIncome + effective.rentalIncome)}
                  </span>
                </p>
                <ContinueButton enabled={canContinue} />
              </div>
            </section>

            <section className="mb-10">
              <h2 className="font-serif text-2xl text-ink mb-4">
                Transactions
              </h2>
              <TransactionsTable
                transactions={transactions}
                onCategoryChange={handleCategoryChange}
              />
            </section>
          </>
        )}
      </div>

      <SiteFooter />
    </main>
  );
}

function PrivacyBanner() {
  return (
    <div className="bg-ink text-paper">
      <p className="max-w-4xl mx-auto px-6 sm:px-12 py-3 text-xs sm:text-sm text-paper/90">
        Your bank statements stay in your browser. They are never uploaded to
        any server.
      </p>
    </div>
  );
}

function ContinueButton({ enabled }: { enabled: boolean }) {
  if (!enabled) {
    return (
      <button
        type="button"
        disabled
        aria-disabled
        className="inline-flex items-center gap-2 rounded-sm border border-rule bg-paper px-5 py-2.5 text-sm text-muted cursor-not-allowed"
        title="Set at least your salary income to continue."
      >
        Continue to calculation →
      </button>
    );
  }
  return (
    <Link
      href="/calculate"
      className="inline-flex items-center gap-2 rounded-sm bg-accent px-5 py-2.5 text-sm font-medium text-paper hover:bg-accent-deep transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
    >
      Continue to calculation →
    </Link>
  );
}

function formatBankLabel(format: BankFormat): string {
  switch (format) {
    case "monzo":
      return "Monzo";
    case "starling":
      return "Starling";
    case "lloyds":
      return "Lloyds-style";
    default:
      return "Generic CSV";
  }
}
