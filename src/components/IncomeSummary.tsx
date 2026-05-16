/* src/components/IncomeSummary.tsx — card showing inferred / annualised /
 * manually-overridden incomes by category.
 *
 * For each income category we show:
 *   - the figure the user can edit in place (overrides take precedence)
 *   - the underlying inferred annualised figure as faint context
 *   - a Reset link to drop the override
 *
 * The "Continue to calculation →" button is rendered next to the card and
 * stays disabled until the effective earnedIncome is positive — Sprint 7
 * acceptance criterion. */

"use client";

import { useEffect, useState } from "react";

import { gbp } from "@/src/lib/format";
import type { InferredIncomes } from "@/src/lib/statementParser";

/**
 * Fields the user can override. Excludes `needsReview`, which is not a
 * number, and is kept here as a const so renaming a key in InferredIncomes
 * forces a TypeScript change on this list.
 */
const FIELDS = [
  { key: "earnedIncome", label: "Salary and wages" },
  { key: "selfEmploymentIncome", label: "Self-employment" },
  { key: "rentalIncome", label: "Rental income" },
  { key: "savingsIncome", label: "Savings interest" },
  { key: "dividendIncome", label: "Dividends" },
  { key: "pensionContributions", label: "Pension contributions" },
  { key: "charityDonations", label: "Charity donations (Gift Aid)" },
] as const satisfies readonly { key: NumericIncomeField; label: string }[];

export type NumericIncomeField = Exclude<keyof InferredIncomes, "needsReview">;

export type IncomeOverrides = Partial<Record<NumericIncomeField, number>>;

interface IncomeSummaryProps {
  inferred: InferredIncomes;
  overrides: IncomeOverrides;
  onOverride: (field: NumericIncomeField, value: number | null) => void;
  annualisationFactor: number;
}

export function IncomeSummary({
  inferred,
  overrides,
  onOverride,
  annualisationFactor,
}: IncomeSummaryProps) {
  return (
    <div className="rounded border border-rule bg-paper">
      <header className="border-b border-rule px-5 py-4">
        <h2 className="font-serif text-xl text-ink">Inferred annual income</h2>
        {annualisationFactor !== 1 && (
          <p className="mt-1 text-xs text-muted">
            Statements cover less than a year — figures are scaled up by ×
            {annualisationFactor.toFixed(2)} to approximate a full tax year.
            Override anything that doesn&apos;t look right.
          </p>
        )}
      </header>
      <dl className="divide-y divide-rule">
        {FIELDS.map(({ key, label }) => (
          <IncomeRow
            key={key}
            field={key}
            label={label}
            inferred={inferred[key]}
            override={overrides[key]}
            annualisationFactor={annualisationFactor}
            onOverride={onOverride}
          />
        ))}
      </dl>
      {inferred.needsReview.length > 0 && (
        <p className="border-t border-rule px-5 py-3 text-xs text-muted">
          {inferred.needsReview.length} transaction
          {inferred.needsReview.length === 1 ? "" : "s"} flagged for review
          below — classifier confidence was low and the amount was over £500.
        </p>
      )}
    </div>
  );
}

interface IncomeRowProps {
  field: NumericIncomeField;
  label: string;
  inferred: number;
  override: number | undefined;
  annualisationFactor: number;
  onOverride: (field: NumericIncomeField, value: number | null) => void;
}

function IncomeRow({
  field,
  label,
  inferred,
  override,
  annualisationFactor,
  onOverride,
}: IncomeRowProps) {
  const annualised = inferred * annualisationFactor;
  const effective = override !== undefined ? override : annualised;
  const isOverridden = override !== undefined;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(effective.toString());

  // Keep the draft in sync when an upstream change (different file dropped,
  // category recategorised, etc.) shifts the effective value while we're not
  // actively editing.
  useEffect(() => {
    if (!editing) setDraft(effective.toFixed(0));
  }, [effective, editing]);

  const commit = () => {
    const cleaned = draft.replace(/[£,\s]/g, "");
    const parsed = parseFloat(cleaned);
    if (Number.isFinite(parsed) && parsed >= 0) {
      onOverride(field, parsed);
    }
    setEditing(false);
  };

  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <dt className="text-sm text-ink">
        <span>{label}</span>
        {isOverridden && (
          <span className="ml-2 text-[10px] uppercase tracking-[0.14em] text-accent">
            edited
          </span>
        )}
      </dt>
      <dd className="flex items-center gap-3">
        {!isOverridden && annualisationFactor !== 1 && (
          <span
            className="text-[11px] text-muted font-mono whitespace-nowrap"
            title={`Inferred ${gbp(inferred)} × ${annualisationFactor.toFixed(2)}`}
          >
            from {gbp(inferred)}
          </span>
        )}
        {editing ? (
          <input
            type="number"
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setDraft(effective.toFixed(0));
                setEditing(false);
              }
            }}
            autoFocus
            min={0}
            step={50}
            className="w-32 rounded border border-rule bg-paper px-2 py-1 text-right font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            aria-label={`Override ${label}`}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(effective.toFixed(0));
              setEditing(true);
            }}
            className="font-mono text-sm text-ink hover:underline underline-offset-4 decoration-rule"
            aria-label={`Edit ${label} (currently ${gbp(effective)})`}
          >
            {gbp(effective)}
          </button>
        )}
        {isOverridden && (
          <button
            type="button"
            onClick={() => onOverride(field, null)}
            className="text-[11px] text-muted hover:text-accent underline-offset-4 hover:underline"
          >
            reset
          </button>
        )}
      </dd>
    </div>
  );
}

/**
 * Combine inferred incomes (annualised) with manual overrides into the
 * numbers downstream consumers (calculator, suggestions) should use.
 */
export function effectiveIncomes(
  inferred: InferredIncomes,
  overrides: IncomeOverrides,
  annualisationFactor: number,
): Record<NumericIncomeField, number> {
  const out = {} as Record<NumericIncomeField, number>;
  for (const { key } of FIELDS) {
    const override = overrides[key];
    out[key] = override !== undefined ? override : inferred[key] * annualisationFactor;
  }
  return out;
}
