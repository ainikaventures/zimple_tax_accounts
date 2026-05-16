/* app/take-home/page.tsx — simplified gross → take-home calculator.
 *
 * Most UK employees come at the tax question from the opposite end of
 * the full /calculate page: "if my CTC is £X, what's my actual
 * take-home each month?". This page is the same calculator engine
 * underneath (src/lib/taxCalculator.ts), framed for that question:
 * one input field for annual gross salary, plus tax year + region +
 * an optional pension contribution slider, and the output is the
 * net pay broken down monthly and annually. No bank statement
 * upload, no suggestions panel, no chat. */

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { SiteFooter } from "@/src/components/SiteFooter";
import {
  DEFAULT_EMPLOYMENT_STATUS,
  EMPLOYMENT_OPTIONS,
  helpTextFor,
  loadEmploymentStatus,
  saveEmploymentStatus,
  type EmploymentStatus,
} from "@/src/lib/employmentStatus";
import { gbp, gbpPrecise, percent1 } from "@/src/lib/format";
import {
  calculateTax,
  type IncomeInputs,
} from "@/src/lib/taxCalculator";
import type { Region, TaxYear } from "@/src/lib/taxRules";

const STORAGE_KEY = "uk-tax-advisor:take-home";

interface FormState {
  grossSalary: number;
  taxYear: TaxYear;
  region: Region;
  pensionContributionsGross: number;
}

const DEFAULT_STATE: FormState = {
  grossSalary: 0,
  taxYear: "2025/26",
  region: "england-wales-ni",
  pensionContributionsGross: 0,
};

export default function TakeHomePage() {
  const [state, setState] = useState<FormState>(DEFAULT_STATE);
  const [employmentStatus, setEmploymentStatus] = useState<EmploymentStatus>(
    DEFAULT_EMPLOYMENT_STATUS,
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setEmploymentStatus(loadEmploymentStatus());
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as FormState;
        setState({ ...DEFAULT_STATE, ...parsed });
      }
    } catch {
      // ignore
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [state, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveEmploymentStatus(employmentStatus);
  }, [employmentStatus, hydrated]);

  const inputs: IncomeInputs = useMemo(
    () => ({
      earnedIncome: state.grossSalary,
      savingsIncome: 0,
      dividendIncome: 0,
      pensionContributionsGross: state.pensionContributionsGross,
      giftAidGross: 0,
      taxYear: state.taxYear,
      region: state.region,
      receivesMarriageAllowance: false,
      transfersMarriageAllowance: false,
      blindPersonsAllowance: false,
    }),
    [state],
  );

  const result = useMemo(() => calculateTax(inputs), [inputs]);

  const monthly = (annual: number) => annual / 12;
  const weekly = (annual: number) => annual / 52;

  if (!hydrated) {
    return <main className="min-h-screen" aria-busy="true" />;
  }

  return (
    <main className="min-h-screen flex flex-col">
      <div className="bg-ink text-paper">
        <p className="max-w-4xl mx-auto px-6 sm:px-12 py-3 text-xs sm:text-sm text-paper/90">
          Take-home calculator · runs entirely in your browser.
        </p>
      </div>

      <div className="max-w-4xl mx-auto w-full px-6 sm:px-12 py-12 flex-1">
        <header className="mb-8">
          <p className="font-sans text-[11px] uppercase tracking-[0.18em] text-muted mb-3">
            Take-home calculator
          </p>
          <h1 className="font-serif font-semibold text-4xl sm:text-5xl tracking-tight leading-[1.05]">
            What will you actually take home?
          </h1>
          <p className="mt-4 font-serif text-lg text-ink/80 max-w-2xl">
            Enter your gross annual salary (CTC) and see your monthly
            take-home pay, how much tax and NI is deducted, and your
            effective and marginal rates. For something more detailed —
            multiple income sources, savings, dividends, suggestions —
            use the{" "}
            <Link
              href="/calculate"
              className="text-accent underline underline-offset-4 hover:no-underline"
            >
              full tax calculator
            </Link>
            .
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-10">
          <section aria-label="Inputs">
            <form
              className="space-y-6"
              onSubmit={(e) => e.preventDefault()}
              aria-label="Take-home inputs"
            >
              <RadioGroup
                name="employment-status"
                label="How do you earn?"
                value={employmentStatus}
                options={EMPLOYMENT_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
                onChange={(v) => setEmploymentStatus(v as EmploymentStatus)}
              />

              <NumberField
                label="Annual gross salary (CTC)"
                hint="The amount your employer pays before tax — from your contract, P60, or payslip."
                value={state.grossSalary}
                step={1000}
                onChange={(v) => setState((s) => ({ ...s, grossSalary: v }))}
              />

              <NumberField
                label="Pension contributions (gross, annual)"
                hint="Gross amount including 20% relief at source. Leave at 0 if your pension is via salary sacrifice (already excluded from your gross salary)."
                value={state.pensionContributionsGross}
                step={500}
                onChange={(v) =>
                  setState((s) => ({ ...s, pensionContributionsGross: v }))
                }
              />

              <RadioGroup
                name="taxYear"
                label="Tax year"
                value={state.taxYear}
                options={[
                  { value: "2025/26", label: "2025/26" },
                  { value: "2026/27", label: "2026/27" },
                ]}
                onChange={(v) =>
                  setState((s) => ({ ...s, taxYear: v as TaxYear }))
                }
              />

              <RadioGroup
                name="region"
                label="Tax residency"
                value={state.region}
                options={[
                  { value: "england-wales-ni", label: "England, Wales or NI" },
                  { value: "scotland", label: "Scotland" },
                ]}
                onChange={(v) =>
                  setState((s) => ({ ...s, region: v as Region }))
                }
              />
            </form>

            <p className="mt-6 text-xs text-muted leading-relaxed">
              Estimates only. Doesn&apos;t model student loans, salary
              sacrifice, taxable benefits, taper of pension annual
              allowance, IR35, or non-UK income. Verify with HMRC.
            </p>
          </section>

          <section aria-label="Results" className="space-y-8">
            <div className="grid grid-cols-2 gap-x-8 gap-y-6 border-b border-rule pb-6">
              <Tile
                label="Monthly take-home"
                value={gbp(monthly(result.takeHome))}
                prominent
              />
              <Tile
                label="Annual take-home"
                value={gbp(result.takeHome)}
                prominent
              />
              <Tile
                label="Effective rate"
                value={percent1(result.effectiveRate)}
              />
              <Tile
                label="Marginal rate"
                value={percent1(result.marginalRate)}
              />
            </div>

            <p
              className="text-xs text-muted leading-relaxed"
              role="note"
              aria-live="polite"
            >
              {helpTextFor(employmentStatus)}
              {employmentStatus !== "salaried" && (
                <>
                  {" "}
                  This calculator assumes Class 1 (employee) NI; for full
                  self-employed treatment use the{" "}
                  <Link
                    href="/calculate"
                    className="text-accent underline underline-offset-4 hover:no-underline"
                  >
                    detailed calculator
                  </Link>
                  .
                </>
              )}
            </p>

            <div>
              <h2 className="text-[11px] uppercase tracking-[0.16em] text-muted mb-3">
                What&apos;s deducted
              </h2>
              <dl className="divide-y divide-rule text-sm">
                <Row
                  label="Income tax"
                  monthly={monthly(result.totalIncomeTax)}
                  annual={result.totalIncomeTax}
                />
                <Row
                  label="National insurance"
                  monthly={monthly(result.nationalInsurance)}
                  annual={result.nationalInsurance}
                />
                {state.pensionContributionsGross > 0 && (
                  <Row
                    label="Pension (gross)"
                    monthly={monthly(state.pensionContributionsGross)}
                    annual={state.pensionContributionsGross}
                    note="Reduces taxable income; not deducted from take-home"
                  />
                )}
                <Row
                  label="Total deductions"
                  monthly={monthly(result.totalTaxAndNI)}
                  annual={result.totalTaxAndNI}
                  bold
                />
              </dl>
            </div>

            <div>
              <h2 className="text-[11px] uppercase tracking-[0.16em] text-muted mb-3">
                Position summary
              </h2>
              <dl className="divide-y divide-rule text-sm">
                <Row
                  label="Gross income"
                  monthly={monthly(result.grossIncome)}
                  annual={result.grossIncome}
                />
                <Row
                  label="Personal allowance applied"
                  monthly={monthly(result.personalAllowance)}
                  annual={result.personalAllowance}
                />
                {result.personalAllowanceLost > 0 && (
                  <Row
                    label="Personal allowance lost to taper"
                    monthly={monthly(result.personalAllowanceLost)}
                    annual={result.personalAllowanceLost}
                    note="ANI is above £100,000"
                  />
                )}
                <Row
                  label="Weekly take-home"
                  monthly={weekly(result.takeHome) * (52 / 12)}
                  annual={weekly(result.takeHome) * 52}
                  altLabel="annual / weekly"
                />
              </dl>
            </div>

            {result.notes.length > 0 && (
              <div>
                <h2 className="text-[11px] uppercase tracking-[0.16em] text-muted mb-3">
                  Notes
                </h2>
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
      </div>

      <SiteFooter />
    </main>
  );
}

// ─── Small UI helpers ────────────────────────────────────────────────────

function Tile({
  label,
  value,
  prominent,
}: {
  label: string;
  value: string;
  prominent?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <p
        className={[
          "mt-1 font-serif tracking-tight tabular-nums",
          prominent ? "text-4xl sm:text-5xl font-semibold" : "text-2xl",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

function Row({
  label,
  monthly,
  annual,
  note,
  bold,
  altLabel,
}: {
  label: string;
  monthly: number;
  annual: number;
  note?: string;
  bold?: boolean;
  altLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
      <dt
        className={["text-ink", bold ? "font-semibold" : ""].join(" ")}
      >
        {label}
        {note && (
          <span className="ml-2 text-[11px] text-muted font-normal">{note}</span>
        )}
      </dt>
      <dd className="flex items-baseline gap-4 font-mono tabular-nums">
        <span className="text-muted text-xs whitespace-nowrap">
          {altLabel ?? "monthly"} {gbpPrecise(monthly)}
        </span>
        <span
          className={[
            "whitespace-nowrap",
            bold ? "font-semibold text-ink" : "text-ink",
          ].join(" ")}
        >
          {gbp(annual)}
        </span>
      </dd>
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  step = 100,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="block text-sm text-ink mb-1">{label}</span>
      <div className="flex items-stretch">
        <span
          aria-hidden
          className="inline-flex items-center px-2.5 text-sm text-muted border border-r-0 border-rule rounded-l bg-paper"
        >
          £
        </span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={step}
          value={value === 0 ? "" : value}
          onChange={(e) => {
            const raw = e.target.value.replace(/[£,\s]/g, "");
            if (raw === "") return onChange(0);
            const parsed = parseFloat(raw);
            if (Number.isFinite(parsed) && parsed >= 0) onChange(parsed);
          }}
          className="flex-1 min-w-0 px-3 py-2 text-right font-mono text-sm border border-rule rounded-r focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent bg-paper"
          placeholder="0"
        />
      </div>
      {hint && <span className="block mt-1 text-xs text-muted">{hint}</span>}
    </label>
  );
}

function RadioGroup({
  name,
  label,
  value,
  options,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div role="group" aria-label={label}>
      <span className="block text-sm text-ink mb-2">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <label
              key={opt.value}
              className={[
                "inline-flex items-center gap-2 rounded border px-3 py-1.5 text-sm cursor-pointer transition-colors",
                selected
                  ? "border-accent bg-accent/5 text-ink"
                  : "border-rule text-muted hover:border-ink/40 hover:text-ink",
              ].join(" ")}
            >
              <input
                type="radio"
                name={name}
                value={opt.value}
                checked={selected}
                onChange={(e) => onChange(e.target.value)}
                className="sr-only"
              />
              <span>{opt.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
