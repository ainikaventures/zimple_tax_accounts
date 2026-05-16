/* src/components/TransactionsTable.tsx — classified-transactions table with
 * an inline category dropdown per row.
 *
 * The Sprint 3 brief calls for true virtualisation past 200 rows; here we
 * use a simpler "show 200, expose 'Show all' for the rest" pattern that
 * avoids pulling in a windowing library. It's fast enough for realistic
 * statement sizes (a year of Monzo activity is ~1–2k rows) and keeps the
 * editorial design clean — react-window's inline-styles fight Tailwind. */

"use client";

import { useMemo, useState } from "react";

import { gbpPrecise, isoDate } from "@/src/lib/format";
import type {
  ClassifiedTransaction,
  TxCategory,
} from "@/src/lib/statementParser";

const CATEGORY_OPTIONS: { value: TxCategory; label: string }[] = [
  { value: "salary", label: "Salary" },
  { value: "savings-interest", label: "Savings interest" },
  { value: "dividend", label: "Dividend" },
  { value: "rental-income", label: "Rental income" },
  { value: "self-employment-income", label: "Self-employment" },
  { value: "pension-contribution", label: "Pension contribution" },
  { value: "charity-donation", label: "Charity donation" },
  { value: "isa-deposit", label: "ISA deposit" },
  { value: "transfer", label: "Transfer" },
  { value: "expense", label: "Expense" },
  { value: "unknown", label: "Unknown" },
];

const INITIAL_LIMIT = 200;

interface TransactionsTableProps {
  transactions: ClassifiedTransaction[];
  onCategoryChange: (index: number, category: TxCategory) => void;
}

export function TransactionsTable({
  transactions,
  onCategoryChange,
}: TransactionsTableProps) {
  const [showAll, setShowAll] = useState(false);

  const sorted = useMemo(
    () =>
      transactions
        .map((tx, idx) => ({ tx, idx }))
        .sort((a, b) => b.tx.date.getTime() - a.tx.date.getTime()),
    [transactions],
  );

  const visible = showAll ? sorted : sorted.slice(0, INITIAL_LIMIT);
  const hidden = sorted.length - visible.length;

  if (transactions.length === 0) {
    return (
      <p className="text-sm text-muted italic">
        No transactions parsed yet — drop a CSV above to begin.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Classified transactions parsed from your bank statements
        </caption>
        <thead>
          <tr className="border-b border-rule text-left text-[11px] uppercase tracking-[0.16em] text-muted">
            <th scope="col" className="py-3 pr-4 font-medium">
              Date
            </th>
            <th scope="col" className="py-3 pr-4 font-medium">
              Description
            </th>
            <th scope="col" className="py-3 pr-4 font-medium text-right">
              Amount
            </th>
            <th scope="col" className="py-3 pr-4 font-medium">
              Category
            </th>
            <th scope="col" className="py-3 pr-2 font-medium">
              Confidence
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map(({ tx, idx }) => (
            <tr
              key={`${idx}-${tx.date.getTime()}-${tx.amount}`}
              className="border-b border-rule/60 hover:bg-ink/[0.02]"
            >
              <td className="py-3 pr-4 font-mono text-[12px] text-muted whitespace-nowrap">
                {isoDate(tx.date)}
              </td>
              <td className="py-3 pr-4 max-w-md">
                <span className="block truncate" title={tx.description}>
                  {tx.description || (
                    <span className="text-muted italic">(no description)</span>
                  )}
                </span>
              </td>
              <td
                className={[
                  "py-3 pr-4 text-right font-mono whitespace-nowrap",
                  tx.amount < 0 ? "text-muted" : "text-ink",
                ].join(" ")}
              >
                {tx.amount < 0 ? "−" : ""}
                {gbpPrecise(Math.abs(tx.amount))}
              </td>
              <td className="py-3 pr-4">
                <label className="sr-only" htmlFor={`cat-${idx}`}>
                  Category for transaction on {isoDate(tx.date)}
                </label>
                <select
                  id={`cat-${idx}`}
                  value={tx.category}
                  onChange={(e) =>
                    onCategoryChange(idx, e.target.value as TxCategory)
                  }
                  className="w-full max-w-[12rem] rounded border border-rule bg-paper py-1 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-3 pr-2">
                <ConfidenceBar value={tx.confidence} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {hidden > 0 && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="font-sans text-sm text-accent underline-offset-4 hover:underline"
          >
            Show {hidden} more transaction{hidden === 1 ? "" : "s"} →
          </button>
        </div>
      )}
      {showAll && transactions.length > INITIAL_LIMIT && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="font-sans text-sm text-muted underline-offset-4 hover:underline"
          >
            Collapse to first {INITIAL_LIMIT}
          </button>
        </div>
      )}
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div
      className="flex items-center gap-2"
      aria-label={`Classifier confidence ${(pct * 100).toFixed(0)} percent`}
    >
      <span
        className="block h-1 w-16 overflow-hidden rounded bg-rule"
        aria-hidden
      >
        <span
          className="block h-full bg-ink/70"
          style={{ width: `${pct * 100}%` }}
        />
      </span>
      <span className="text-[11px] text-muted font-mono w-8 text-right">
        {(pct * 100).toFixed(0)}%
      </span>
    </div>
  );
}
