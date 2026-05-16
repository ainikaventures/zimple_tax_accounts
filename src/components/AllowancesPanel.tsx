/* src/components/AllowancesPanel.tsx — four-up cards summarising the
 * allowances that shape this tax position: personal allowance (with
 * applied-vs-lost split), dividend allowance, personal savings allowance
 * (band-aware), and ISA annual headroom.
 *
 * Visual layout: 2×2 grid on tablet up; single column on phone. The PA
 * card has a small inline bar showing how much was tapered away — the
 * single most important "why does my tax look this way" signal for
 * anyone in the £100k–£125k band. */

"use client";

import { gbp } from "@/src/lib/format";
import type { TaxResult } from "@/src/lib/taxCalculator";
import type { YearRules } from "@/src/lib/taxRules";

interface AllowancesPanelProps {
  result: TaxResult;
  rules: YearRules;
}

export function AllowancesPanel({ result, rules }: AllowancesPanelProps) {
  const psa = personalSavingsAllowanceFor(result, rules);
  const standardPA = rules.personalAllowance;
  const appliedPA = result.personalAllowance;
  const lostPA = result.personalAllowanceLost;
  const appliedFraction =
    standardPA > 0 ? Math.max(0, Math.min(1, appliedPA / standardPA)) : 0;
  const lostFraction =
    standardPA > 0 ? Math.max(0, Math.min(1, lostPA / standardPA)) : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Card title="Personal allowance">
        <div
          className="h-1.5 w-full overflow-hidden rounded bg-rule"
          role="img"
          aria-label={`Applied ${gbp(appliedPA)} of ${gbp(standardPA)}; ${gbp(lostPA)} lost to taper`}
        >
          <div className="flex h-full">
            <span
              className="block h-full bg-ink/80"
              style={{ width: `${appliedFraction * 100}%` }}
            />
            <span
              className="block h-full bg-accent/70"
              style={{ width: `${lostFraction * 100}%` }}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted font-mono">
          {gbp(appliedPA)} applied
          {lostPA > 0 && ` · ${gbp(lostPA)} lost to taper`}
        </p>
      </Card>

      <Card title="Dividend allowance">
        <p className="font-serif text-2xl text-ink tabular-nums">
          {gbp(rules.dividendAllowance)}
        </p>
        <p className="text-xs text-muted">at 0% (still uses band space)</p>
      </Card>

      <Card title="Personal savings allowance">
        <p className="font-serif text-2xl text-ink tabular-nums">{gbp(psa)}</p>
        <p className="text-xs text-muted">
          {psa === rules.personalSavingsAllowance.basicRate
            ? "basic-rate band"
            : psa === rules.personalSavingsAllowance.higherRate
              ? "higher-rate band"
              : "additional-rate band"}
        </p>
      </Card>

      <Card title="ISA annual allowance">
        <p className="font-serif text-2xl text-ink tabular-nums">
          {gbp(rules.isaAllowance)}
        </p>
        <p className="text-xs text-muted">available this tax year</p>
      </Card>
    </div>
  );
}

interface CardProps {
  title: string;
  children: React.ReactNode;
}

function Card({ title, children }: CardProps) {
  return (
    <div className="rounded border border-rule bg-paper px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted mb-1">
        {title}
      </p>
      {children}
    </div>
  );
}

/**
 * PSA categorisation by the UK band the user's taxable earned tops out in.
 * Mirrors the logic in src/lib/taxCalculator.ts so the panel agrees with
 * the actual figure applied during the calculation.
 */
export function personalSavingsAllowanceFor(
  result: TaxResult,
  rules: YearRules,
): number {
  const ukBasicTop = rules.incomeTaxBandsEWN[0].to;
  const ukHigherTop = rules.incomeTaxBandsEWN[1].to;
  if (result.taxableEarned >= ukHigherTop) {
    return rules.personalSavingsAllowance.additionalRate;
  }
  if (result.taxableEarned >= ukBasicTop) {
    return rules.personalSavingsAllowance.higherRate;
  }
  return rules.personalSavingsAllowance.basicRate;
}
