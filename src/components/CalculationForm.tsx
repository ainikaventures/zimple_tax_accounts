/* src/components/CalculationForm.tsx — fully-controlled tax-input form.
 *
 * Fires `onChange(key, value)` on every keystroke / click; the parent runs
 * `calculateTax` synchronously so figures update without debounce. All
 * inputs are accessible: every field has a real <label>, fieldsets group
 * related controls, focus rings are visible, and number inputs accept
 * keyboard arrow keys.
 *
 * Marriage Allowance is rendered as a single 3-way radio (None / Receives /
 * Transfers) — it's the cleanest way to express the mutually-exclusive
 * receivesMarriageAllowance / transfersMarriageAllowance pair without
 * letting the user pick both. */

"use client";

import { type ChangeEvent } from "react";

import type { IncomeInputs } from "@/src/lib/taxCalculator";
import type { Region, TaxYear } from "@/src/lib/taxRules";

interface CalculationFormProps {
  inputs: IncomeInputs;
  onChange: <K extends keyof IncomeInputs>(key: K, value: IncomeInputs[K]) => void;
}

type StudentLoanPlan = NonNullable<IncomeInputs["studentLoanPlan"]>;
type MaMode = "none" | "receives" | "transfers";

export function CalculationForm({ inputs, onChange }: CalculationFormProps) {
  const maMode: MaMode = inputs.receivesMarriageAllowance
    ? "receives"
    : inputs.transfersMarriageAllowance
      ? "transfers"
      : "none";

  const handleMa = (mode: MaMode) => {
    onChange("receivesMarriageAllowance", mode === "receives");
    onChange("transfersMarriageAllowance", mode === "transfers");
  };

  const handleStudentLoan = (value: string) => {
    if (value === "none") {
      onChange("studentLoanPlan", undefined);
    } else {
      onChange("studentLoanPlan", value as StudentLoanPlan);
    }
  };

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => e.preventDefault()}
      aria-label="Tax calculation inputs"
    >
      <Fieldset legend="Income (gross, annual)">
        <p className="text-xs text-muted leading-relaxed -mt-1">
          Enter <strong className="text-ink">gross</strong> figures (before
          tax). If you&apos;re employed under PAYE, copy your salary from
          your P60 / payslip — <strong className="text-ink">not</strong> the
          net amount that lands in your bank account.
        </p>
        <NumberField
          label="Salary, self-employment, and rental income"
          hint="The calculator sums these as non-savings non-dividend income."
          value={inputs.earnedIncome}
          onChange={(v) => onChange("earnedIncome", v)}
        />
        <NumberField
          label="Savings interest"
          value={inputs.savingsIncome ?? 0}
          onChange={(v) => onChange("savingsIncome", v)}
        />
        <NumberField
          label="Dividend income"
          value={inputs.dividendIncome ?? 0}
          onChange={(v) => onChange("dividendIncome", v)}
        />
      </Fieldset>

      <Fieldset legend="Tax year and region">
        <RadioGroup
          name="taxYear"
          label="Tax year"
          value={inputs.taxYear ?? "2025/26"}
          options={[
            { value: "2025/26", label: "2025/26" },
            { value: "2026/27", label: "2026/27" },
          ]}
          onChange={(v) => onChange("taxYear", v as TaxYear)}
        />
        <RadioGroup
          name="region"
          label="Tax residency"
          value={inputs.region ?? "england-wales-ni"}
          options={[
            { value: "england-wales-ni", label: "England, Wales or NI" },
            { value: "scotland", label: "Scotland" },
          ]}
          onChange={(v) => onChange("region", v as Region)}
        />
      </Fieldset>

      <Fieldset legend="Pension and Gift Aid (gross, annual)">
        <NumberField
          label="Pension contributions"
          hint="Gross amount including the 20% relief at source."
          value={inputs.pensionContributionsGross ?? 0}
          onChange={(v) => onChange("pensionContributionsGross", v)}
          step={500}
        />
        <NumberField
          label="Gift Aid donations"
          hint="Gross amount — multiply net donations by 1.25 if Gift Aid was declared."
          value={inputs.giftAidGross ?? 0}
          onChange={(v) => onChange("giftAidGross", v)}
          step={100}
        />
      </Fieldset>

      <Fieldset legend="Additional allowances">
        <RadioGroup
          name="ma"
          label="Marriage allowance"
          value={maMode}
          options={[
            { value: "none", label: "Neither" },
            { value: "receives", label: "I receive (+£1,260 PA)" },
            { value: "transfers", label: "I transfer (−£1,260 PA)" },
          ]}
          onChange={(v) => handleMa(v as MaMode)}
        />
        <Checkbox
          label="Blind person's allowance (+£3,130 PA)"
          checked={inputs.blindPersonsAllowance ?? false}
          onChange={(v) => onChange("blindPersonsAllowance", v)}
        />
      </Fieldset>

      <Fieldset legend="Student loan">
        <SelectField
          label="Plan"
          hint="Recorded but not yet reflected in the calculation (Sprint 12)."
          value={inputs.studentLoanPlan ?? "none"}
          options={[
            { value: "none", label: "No student loan" },
            { value: "1", label: "Plan 1" },
            { value: "2", label: "Plan 2" },
            { value: "4", label: "Plan 4 (Scotland)" },
            { value: "5", label: "Plan 5" },
            { value: "postgrad", label: "Postgraduate" },
          ]}
          onChange={handleStudentLoan}
        />
      </Fieldset>
    </form>
  );
}

// ─── Building blocks ───────────────────────────────────────────────────────

interface FieldsetProps {
  legend: string;
  children: React.ReactNode;
}

function Fieldset({ legend, children }: FieldsetProps) {
  return (
    <fieldset className="border border-rule rounded p-5">
      <legend className="px-2 -ml-2 text-[11px] uppercase tracking-[0.18em] text-muted">
        {legend}
      </legend>
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}

interface NumberFieldProps {
  label: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}

function NumberField({ label, hint, value, onChange, step = 100 }: NumberFieldProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "" || raw === "-") {
      onChange(0);
      return;
    }
    const cleaned = raw.replace(/[£,\s]/g, "");
    const parsed = parseFloat(cleaned);
    if (Number.isFinite(parsed) && parsed >= 0) {
      onChange(parsed);
    }
  };

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
          onChange={handleChange}
          className="flex-1 min-w-0 px-3 py-2 text-right font-mono text-sm border border-rule rounded-r focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent bg-paper"
          placeholder="0"
        />
      </div>
      {hint && <span className="block mt-1 text-xs text-muted">{hint}</span>}
    </label>
  );
}

interface RadioGroupProps {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

function RadioGroup({ name, label, value, options, onChange }: RadioGroupProps) {
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

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function Checkbox({ label, checked, onChange }: CheckboxProps) {
  return (
    <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-rule text-accent focus:ring-accent"
      />
      <span>{label}</span>
    </label>
  );
}

interface SelectFieldProps {
  label: string;
  hint?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

function SelectField({ label, hint, value, options, onChange }: SelectFieldProps) {
  return (
    <label className="block">
      <span className="block text-sm text-ink mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-rule rounded focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent bg-paper"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {hint && <span className="block mt-1 text-xs text-muted">{hint}</span>}
    </label>
  );
}
