/* app/calculate/page.tsx — real calculation page (Sprint 8).
 *
 * Pulls inferred income from the upload flow's localStorage on first
 * visit, lets the user adjust everything, and renders the tax position
 * live via TaxHeadline + BandBreakdownBar + AllowancesPanel + notes.
 *
 * Persistence: form state writes to `uk-tax-advisor:inputs`. If that key
 * is absent on mount, we seed from `uk-tax-advisor:statements` (the upload
 * flow's state); if that's absent too, we start with a zero form and a
 * banner that points back to /upload. */

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AgentChat } from "@/src/components/AgentChat";
import { AllowancesPanel } from "@/src/components/AllowancesPanel";
import { BandBreakdownBar } from "@/src/components/BandBreakdownBar";
import { CalculationForm } from "@/src/components/CalculationForm";
import { SuggestionCard } from "@/src/components/SuggestionCard";
import { TaxHeadline } from "@/src/components/TaxHeadline";
import { gbp } from "@/src/lib/format";
import {
  calculateTax,
  type IncomeInputs,
} from "@/src/lib/taxCalculator";
import { getRules } from "@/src/lib/taxRules";
import { generateSuggestions, type Suggestion } from "@/src/lib/suggestions";
import {
  inferIncomes,
  type ClassifiedTransaction,
  type InferredIncomes,
} from "@/src/lib/statementParser";

const INPUTS_KEY = "uk-tax-advisor:inputs";
const STATEMENTS_KEY = "uk-tax-advisor:statements";

const DEFAULT_INPUTS: IncomeInputs = {
  earnedIncome: 0,
  savingsIncome: 0,
  dividendIncome: 0,
  pensionContributionsGross: 0,
  giftAidGross: 0,
  taxYear: "2025/26",
  region: "england-wales-ni",
  receivesMarriageAllowance: false,
  transfersMarriageAllowance: false,
  blindPersonsAllowance: false,
};

/**
 * One active simulation — the snapshot of inputs before the user applied a
 * suggestion plus a short label for the banner. Cleared by Revert.
 */
interface Simulation {
  suggestionId: string;
  label: string;
  savedInputs: IncomeInputs;
}

export default function CalculatePage() {
  const [inputs, setInputs] = useState<IncomeInputs>(DEFAULT_INPUTS);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [seededFrom, setSeededFrom] = useState<
    "inputs" | "statements" | "empty"
  >("empty");

  // Hydrate.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawInputs = window.localStorage.getItem(INPUTS_KEY);
      if (rawInputs) {
        const parsed = JSON.parse(rawInputs) as IncomeInputs;
        setInputs({ ...DEFAULT_INPUTS, ...parsed });
        setSeededFrom("inputs");
      } else {
        const seeded = seedFromStatements();
        if (seeded) {
          setInputs(seeded);
          setSeededFrom("statements");
        }
      }
    } catch {
      // Ignore — start with defaults.
    } finally {
      setHydrated(true);
    }
  }, []);

  // Persist on change.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(INPUTS_KEY, JSON.stringify(inputs));
    } catch {
      // private mode or quota — fail silently
    }
  }, [inputs, hydrated]);

  const { suggestions, baseline: result } = useMemo(
    () => generateSuggestions(inputs),
    [inputs],
  );
  const rules = useMemo(
    () => getRules(inputs.taxYear ?? "2025/26"),
    [inputs.taxYear],
  );

  const handleChange = useCallback(
    <K extends keyof IncomeInputs>(key: K, value: IncomeInputs[K]) => {
      // A manual edit invalidates an active simulation — once the user has
      // tweaked anything, the "Revert" target is stale, so drop it.
      setSimulation(null);
      setInputs((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const applySuggestion = useCallback(
    (s: Suggestion) => {
      const applied = computeApplied(s, inputs);
      if (!applied) return;
      // If another simulation is already active, preserve its baseline so
      // Revert still restores all the way back rather than only one step.
      setSimulation((prev) => ({
        suggestionId: s.id,
        label: applied.label,
        savedInputs: prev?.savedInputs ?? inputs,
      }));
      setInputs(applied.nextInputs);
    },
    [inputs],
  );

  const revertSimulation = useCallback(() => {
    if (!simulation) return;
    setInputs(simulation.savedInputs);
    setSimulation(null);
  }, [simulation]);

  const hasIncome =
    (inputs.earnedIncome ?? 0) +
      (inputs.savingsIncome ?? 0) +
      (inputs.dividendIncome ?? 0) >
    0;

  // Avoid hydration mismatch — render nothing until we've inspected
  // localStorage on the client.
  if (!hydrated) {
    return <main className="min-h-screen" aria-busy="true" />;
  }

  return (
    <main className="min-h-screen flex flex-col">
      <PrivacyBanner />

      <div className="max-w-6xl mx-auto w-full px-6 sm:px-12 py-12 flex-1">
        <header className="mb-8">
          <p className="font-sans text-[11px] uppercase tracking-[0.18em] text-muted mb-3">
            Step 2 of 3 · Calculate
          </p>
          <h1 className="font-serif font-semibold text-4xl sm:text-5xl tracking-tight leading-[1.05]">
            Your tax position
          </h1>
          <p className="mt-4 font-serif text-lg text-ink/80 max-w-2xl">
            Adjust the inputs on the left — the panel on the right updates as
            you type. Estimates only; not regulated financial advice. Verify
            with HMRC or a chartered tax adviser before filing.
          </p>
          {seededFrom === "statements" && (
            <p className="mt-3 text-xs text-muted">
              Pre-filled from your uploaded bank statements.{" "}
              <Link href="/upload" className="underline underline-offset-4">
                Back to upload
              </Link>
            </p>
          )}
        </header>

        {!hasIncome && <NoIncomePrompt />}

        {simulation && (
          <SimulationBanner
            label={simulation.label}
            onRevert={revertSimulation}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-10 lg:gap-12">
          <section aria-label="Inputs">
            <CalculationForm inputs={inputs} onChange={handleChange} />
          </section>

          <section aria-label="Results" className="space-y-10">
            <TaxHeadline result={result} />

            <div>
              <h2 className="font-serif text-2xl mb-4 text-ink">
                Band breakdown
              </h2>
              <BandBreakdownBar breakdown={result.breakdown} />
            </div>

            <div>
              <h2 className="font-serif text-2xl mb-4 text-ink">Allowances</h2>
              <AllowancesPanel result={result} rules={rules} />
            </div>

            {result.notes.length > 0 && (
              <div>
                <h2 className="font-serif text-2xl mb-4 text-ink">Notes</h2>
                <ul className="space-y-2 text-sm text-ink/80">
                  {result.notes.map((note, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-accent" aria-hidden>
                        •
                      </span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>

        {suggestions.length > 0 && hasIncome && (
          <section className="mt-16" aria-label="Tax-saving suggestions">
            <header className="mb-6">
              <h2 className="font-serif font-semibold text-3xl tracking-tight text-ink">
                Ways to reduce your tax
              </h2>
              <p className="mt-2 text-sm text-muted max-w-2xl">
                Sorted by impact. Apply any suggestion to simulate the result
                instantly; revert from the banner to restore your inputs.
              </p>
            </header>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {suggestions.map((s) => {
                const applied = computeApplied(s, inputs);
                return (
                  <SuggestionCard
                    key={s.id}
                    suggestion={s}
                    isActive={simulation?.suggestionId === s.id}
                    onApply={applied ? () => applySuggestion(s) : undefined}
                    applyLabel={applied?.buttonLabel}
                  />
                );
              })}
            </div>
          </section>
        )}
      </div>

      <Footer />

      {hasIncome && (
        <AgentChat context={{ taxResult: result, suggestions, rules }} />
      )}
    </main>
  );
}

function SimulationBanner({
  label,
  onRevert,
}: {
  label: string;
  onRevert: () => void;
}) {
  return (
    <div
      className="mb-8 rounded border border-accent bg-accent/5 px-5 py-3 flex flex-wrap items-center justify-between gap-3"
      role="status"
      aria-live="polite"
    >
      <p className="text-sm text-ink">
        <span className="text-[11px] uppercase tracking-[0.14em] text-accent mr-2">
          Simulating
        </span>
        {label}
      </p>
      <button
        type="button"
        onClick={onRevert}
        className="inline-flex items-center gap-1.5 rounded-sm border border-rule bg-paper px-3 py-1.5 text-sm hover:border-ink/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      >
        Revert
      </button>
    </div>
  );
}

function PrivacyBanner() {
  return (
    <div className="bg-ink text-paper">
      <p className="max-w-6xl mx-auto px-6 sm:px-12 py-3 text-xs sm:text-sm text-paper/90">
        Your bank statements stay in your browser. They are never uploaded to
        any server.
      </p>
    </div>
  );
}

function NoIncomePrompt() {
  return (
    <div className="mb-10 rounded border border-rule bg-paper p-5">
      <p className="text-sm text-ink">
        No income yet —{" "}
        <Link href="/upload" className="text-accent underline underline-offset-4">
          upload bank statements
        </Link>{" "}
        to pre-fill these figures, or enter them manually below.
      </p>
    </div>
  );
}

function Footer() {
  return (
    <footer className="px-6 sm:px-12 pb-8">
      <div className="max-w-6xl mx-auto border-t border-rule pt-6 flex flex-col sm:flex-row gap-2 sm:gap-6 text-[12px] text-muted">
        <span>Free for personal use · Commercial licence required</span>
        <span aria-hidden className="hidden sm:inline">
          ·
        </span>
        <span>
          Not regulated financial advice. Verify with HMRC or a chartered tax
          adviser before filing.
        </span>
      </div>
    </footer>
  );
}

// ─── Seeding from /upload ──────────────────────────────────────────────────

interface PersistedStatementsState {
  transactions?: Array<Omit<ClassifiedTransaction, "date"> & { date: string }>;
  overrides?: Partial<Record<NumericIncomeField, number>>;
}

type NumericIncomeField = Exclude<keyof InferredIncomes, "needsReview">;

/**
 * Read uk-tax-advisor:statements (set by /upload) and convert it into a
 * starting IncomeInputs. Returns null when nothing's there or the JSON is
 * malformed. Logic mirrors the upload page's effectiveIncomes/annualisation
 * helpers exactly so the two pages stay consistent.
 */
function seedFromStatements(): IncomeInputs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STATEMENTS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedStatementsState;
    if (!Array.isArray(parsed.transactions) || parsed.transactions.length === 0) {
      return null;
    }
    const hydrated: ClassifiedTransaction[] = parsed.transactions.map((t) => ({
      ...t,
      date: new Date(t.date),
    }));
    const inferred = inferIncomes(hydrated);
    const factor = annualisationFactor(statementSpanDays(hydrated));
    const overrides = parsed.overrides ?? {};

    const value = (key: NumericIncomeField): number => {
      const o = overrides[key];
      if (o !== undefined) return o;
      const r = inferred[key];
      return typeof r === "number" ? r * factor : 0;
    };

    return {
      ...DEFAULT_INPUTS,
      earnedIncome:
        value("earnedIncome") +
        value("selfEmploymentIncome") +
        value("rentalIncome"),
      savingsIncome: value("savingsIncome"),
      dividendIncome: value("dividendIncome"),
      pensionContributionsGross: value("pensionContributions"),
      giftAidGross: value("charityDonations"),
    };
  } catch {
    return null;
  }
}

function statementSpanDays(transactions: ClassifiedTransaction[]): number {
  if (transactions.length < 2) return 0;
  const times = transactions.map((t) => t.date.getTime());
  return (Math.max(...times) - Math.min(...times)) / (1000 * 60 * 60 * 24);
}

function annualisationFactor(spanDays: number): number {
  if (spanDays < 28) return 1;
  if (spanDays >= 365) return 1;
  return 365 / spanDays;
}

// ─── Suggestion → input-mutation mapping ───────────────────────────────────

interface AppliedSuggestion {
  /** Inputs after the change. */
  nextInputs: IncomeInputs;
  /** Short banner label (e.g. "£15,000 gross pension contribution"). */
  label: string;
  /** Button label for the card. */
  buttonLabel: string;
}

/**
 * Translate a suggestion into a concrete `IncomeInputs` change. Returns null
 * for informational suggestions that have no numerical lever — those render
 * without an Apply button. Mirrors the factory logic in
 * src/lib/suggestions.ts so what we apply matches what the suggestion told
 * the user it would do.
 */
function computeApplied(
  s: Suggestion,
  inputs: IncomeInputs,
): AppliedSuggestion | null {
  const grossIncome =
    (inputs.earnedIncome ?? 0) +
    (inputs.savingsIncome ?? 0) +
    (inputs.dividendIncome ?? 0);
  const ani =
    grossIncome -
    (inputs.pensionContributionsGross ?? 0) -
    (inputs.giftAidGross ?? 0);

  switch (s.id) {
    case "pension-pa-recovery": {
      const extra = Math.max(0, ani - 100000);
      if (extra <= 0) return null;
      const next = (inputs.pensionContributionsGross ?? 0) + extra;
      return {
        nextInputs: { ...inputs, pensionContributionsGross: next },
        label: `additional ${gbp(extra)} gross pension contribution (total ${gbp(next)}).`,
        buttonLabel: `Add ${gbp(extra)} pension →`,
      };
    }
    case "higher-rate-pension": {
      // Mirrors the factory: top-up to the annual allowance.
      const rules = getRules(inputs.taxYear ?? "2025/26");
      const cap = rules.pensionAnnualAllowance;
      if ((inputs.pensionContributionsGross ?? 0) >= cap) return null;
      return {
        nextInputs: { ...inputs, pensionContributionsGross: cap },
        label: `pension topped up to the £${cap.toLocaleString("en-GB")} annual allowance.`,
        buttonLabel: `Max out to ${gbp(cap)} →`,
      };
    }
    case "marriage-allowance": {
      if (inputs.transfersMarriageAllowance) return null;
      return {
        nextInputs: {
          ...inputs,
          transfersMarriageAllowance: true,
          receivesMarriageAllowance: false,
        },
        label: "Marriage Allowance transferred (£1,260 of PA moved to your spouse).",
        buttonLabel: "Transfer Marriage Allowance →",
      };
    }
    default:
      return null;
  }
}
