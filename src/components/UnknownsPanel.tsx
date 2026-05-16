/* src/components/UnknownsPanel.tsx — groups unclassified transactions by
 * description and offers a single category picker per group.
 *
 * Used right after parsing: most users will see (say) three different
 * "JOHN SMITH"-style transactions all marked "unknown" or "expense" and
 * want to label them all in one click. Per-row editing in the table below
 * still works for fine-grained corrections, but the grouped view drains
 * the obvious bulk work first. */

"use client";

import { useMemo, useState } from "react";

import { gbpPrecise } from "@/src/lib/format";
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
  { value: "transfer", label: "Transfer / personal help" },
  { value: "expense", label: "Expense" },
  { value: "unknown", label: "Leave as unknown" },
];

interface UnknownsPanelProps {
  transactions: ClassifiedTransaction[];
  /**
   * Apply `category` to every transaction whose description matches
   * `description` exactly. Parent updates state.
   */
  onBulkCategorise: (description: string, category: TxCategory) => void;
}

interface Group {
  description: string;
  count: number;
  netAmount: number;
  earliest: Date;
  latest: Date;
  category: TxCategory;
}

export function UnknownsPanel({
  transactions,
  onBulkCategorise,
}: UnknownsPanelProps) {
  const groups = useMemo(() => buildGroups(transactions), [transactions]);

  if (groups.length === 0) return null;

  const totalUnknowns = groups.reduce((sum, g) => sum + g.count, 0);

  return (
    <section
      aria-label="Unclassified transactions"
      className="rounded border border-rule bg-paper"
    >
      <header className="px-5 py-4 border-b border-rule">
        <h2 className="font-serif text-xl text-ink tracking-tight">
          Resolve unclassified transactions
        </h2>
        <p className="mt-1 text-sm text-muted">
          {totalUnknowns} transaction
          {totalUnknowns === 1 ? "" : "s"} across {groups.length} group
          {groups.length === 1 ? "" : "s"} — pick a category and we&apos;ll
          apply it to every row with that description. Transfers from
          friends, salary from a side gig, regular rent — group it once,
          tag it once.
        </p>
      </header>
      <ul className="divide-y divide-rule">
        {groups.map((group) => (
          <GroupRow
            key={group.description}
            group={group}
            onBulkCategorise={onBulkCategorise}
          />
        ))}
      </ul>
    </section>
  );
}

function GroupRow({
  group,
  onBulkCategorise,
}: {
  group: Group;
  onBulkCategorise: (description: string, category: TxCategory) => void;
}) {
  const [draftCategory, setDraftCategory] = useState<TxCategory>(
    group.category,
  );
  const sign = group.netAmount >= 0 ? "+" : "−";
  return (
    <li className="px-5 py-4 flex flex-wrap items-start gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink font-medium truncate">
          {group.description || (
            <span className="italic text-muted">(no description)</span>
          )}
        </p>
        <p className="mt-1 text-xs text-muted font-mono">
          {group.count}× · net {sign}
          {gbpPrecise(Math.abs(group.netAmount))} · {isoDate(group.earliest)} →{" "}
          {isoDate(group.latest)}
        </p>
      </div>
      <div className="flex items-stretch gap-2">
        <label className="sr-only" htmlFor={`group-${group.description}`}>
          Category for transactions matching {group.description}
        </label>
        <select
          id={`group-${group.description}`}
          value={draftCategory}
          onChange={(e) => setDraftCategory(e.target.value as TxCategory)}
          className="rounded border border-rule bg-paper px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onBulkCategorise(group.description, draftCategory)}
          disabled={draftCategory === group.category}
          className="rounded-sm bg-accent text-paper px-3 py-1.5 text-xs font-medium hover:bg-accent-deep disabled:bg-rule disabled:text-muted disabled:cursor-not-allowed"
        >
          Apply to all {group.count}
        </button>
      </div>
    </li>
  );
}

/**
 * Group all unknown- or expense-classified credits, plus any 'unknown'
 * tagged rows, by exact description. Sort by absolute net amount, biggest
 * first — that's the bang-for-buck order to resolve them.
 */
function buildGroups(transactions: ClassifiedTransaction[]): Group[] {
  const buckets = new Map<string, ClassifiedTransaction[]>();
  for (const tx of transactions) {
    // 'unknown' covers credits the classifier couldn't place.
    // 'expense' covers debits — most are real expenses but the user might
    // want to flag specific ones as pension / charity / transfer, so we
    // include them when there are repeats of the same description.
    if (tx.category !== "unknown" && tx.category !== "expense") continue;
    const key = tx.description.trim();
    const arr = buckets.get(key) ?? [];
    arr.push(tx);
    buckets.set(key, arr);
  }

  const groups: Group[] = [];
  for (const [description, txs] of buckets.entries()) {
    // Only surface groups with ≥2 transactions, OR with a single
    // transaction that's still "unknown" (an unmatched positive — the
    // user almost certainly wants to label it).
    const isMulti = txs.length >= 2;
    const isLonelyUnknown =
      txs.length === 1 && txs[0].category === "unknown";
    if (!isMulti && !isLonelyUnknown) continue;
    const dates = txs.map((t) => t.date.getTime()).sort();
    groups.push({
      description,
      count: txs.length,
      netAmount: txs.reduce((sum, t) => sum + t.amount, 0),
      earliest: new Date(dates[0]),
      latest: new Date(dates[dates.length - 1]),
      category: txs[0].category, // they all share, by construction
    });
  }

  groups.sort((a, b) => Math.abs(b.netAmount) - Math.abs(a.netAmount));
  return groups;
}

function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
