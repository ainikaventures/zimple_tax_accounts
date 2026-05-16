/* src/components/TaxYearGuidance.tsx — two related pieces of UI:
 *
 * 1. An always-visible explainer: what the UK tax year is (6 Apr → 5 Apr)
 *    and why we want statements covering all twelve months. Collapsible so
 *    it doesn't shout at users who already know.
 *
 * 2. A detected-tax-year summary that appears once the user has uploaded
 *    at least one statement. Shows a monthly coverage timeline (covered
 *    months filled, missing months hollow) and lists the missing months
 *    plainly so the user knows what to upload next. */

"use client";

import type { TaxYearCoverage } from "@/src/lib/taxYearCoverage";

interface TaxYearGuidanceProps {
  coverage: TaxYearCoverage[];
}

export function TaxYearGuidance({ coverage }: TaxYearGuidanceProps) {
  return (
    <div className="space-y-4">
      <Explainer />
      {coverage.map((c) => (
        <CoverageCard key={c.taxYear} coverage={c} />
      ))}
    </div>
  );
}

function Explainer() {
  return (
    <details className="rounded border border-rule bg-paper open:bg-ink/[0.02]">
      <summary className="cursor-pointer list-none px-5 py-3 flex items-start gap-3 select-none">
        <span className="text-muted mt-0.5" aria-hidden>
          ›
        </span>
        <span className="flex-1">
          <p className="text-sm text-ink leading-relaxed">
            <strong>The UK tax year runs 6 April to 5 April.</strong> Upload
            statements covering every month of the year you want to calculate
            for — partial coverage gets annualised, which is less accurate
            than the real numbers.
          </p>
          <p className="mt-1 text-xs text-muted">Click for more.</p>
        </span>
      </summary>
      <div className="px-5 pb-5 pt-1 text-sm text-ink/85 leading-relaxed space-y-3 border-t border-rule">
        <p>
          HMRC&apos;s self-assessment tax year is the period from{" "}
          <strong>6 April</strong> one year to <strong>5 April</strong> the
          next. So the <em>2025/26 tax year</em> is 6 April 2025 to 5 April
          2026, and your filing deadlines are 31 October 2026 (paper) or 31
          January 2027 (online).
        </p>
        <p>
          For an accurate calculation we need to see your income across the
          whole year. If you upload only a few months, we&apos;ll scale the
          figures up to a 12-month equivalent — but that assumes the months
          you uploaded are typical, which often isn&apos;t true (bonuses,
          one-off payments, dividend dates, etc.).
        </p>
        <p>
          We auto-detect which tax year your first uploaded statement
          belongs to, then tell you which months are still missing. Drop
          additional CSV / PDF statements covering those months above.
        </p>
      </div>
    </details>
  );
}

function CoverageCard({ coverage }: { coverage: TaxYearCoverage }) {
  const monthsTotal = coverage.months.length;
  const monthsMissing = monthsTotal - coverage.monthsCovered;
  const isComplete = monthsMissing === 0;
  const missingLabels = coverage.months
    .filter((m) => !m.covered)
    .map((m) => m.label);

  return (
    <section
      className="rounded border border-rule bg-paper p-5"
      aria-label={`Coverage for tax year ${coverage.taxYear}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted">
            Detected tax year
          </p>
          <h3 className="font-serif text-xl text-ink tracking-tight">
            {coverage.taxYear}{" "}
            <span className="text-sm font-sans text-muted">
              · 6 Apr {coverage.taxYear.slice(0, 4)} to 5 Apr 20
              {coverage.taxYear.slice(5)}
            </span>
          </h3>
        </div>
        <p
          className={[
            "text-xs font-mono tabular-nums",
            isComplete ? "text-accent" : "text-muted",
          ].join(" ")}
        >
          {coverage.monthsCovered}/{monthsTotal} months covered
        </p>
      </header>

      <ol
        className="grid grid-cols-12 gap-1 list-none p-0"
        aria-label="Monthly coverage timeline"
      >
        {coverage.months.map((m) => (
          <li
            key={m.key}
            className="flex flex-col items-center text-[10px]"
            aria-label={`${m.label}: ${m.covered ? "covered" : "missing"}`}
          >
            <span
              className={[
                "block h-3 w-full rounded-sm",
                m.covered ? "bg-accent" : "bg-rule",
              ].join(" ")}
              aria-hidden
            />
            <span
              className={[
                "mt-1 font-mono tracking-tight",
                m.covered ? "text-ink" : "text-muted",
              ].join(" ")}
            >
              {m.label.slice(0, 3)}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-sm text-ink/85 leading-relaxed">
        {isComplete ? (
          <span>
            Full tax year covered. You&apos;re ready to calculate.
          </span>
        ) : (
          <span>
            <strong>{monthsMissing}</strong> month
            {monthsMissing === 1 ? "" : "s"} still missing:{" "}
            <span className="text-muted">{missingLabels.join(" · ")}</span>.
            Drop additional statements above for a complete picture.
          </span>
        )}
      </p>
    </section>
  );
}
