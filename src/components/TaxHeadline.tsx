/* src/components/TaxHeadline.tsx — four hero numbers across the top of the
 * results panel. Total tax & NI, take-home, effective rate, marginal rate.
 * Serif display font, large; mobile collapses to a 2×2 grid. */

"use client";

import { gbp, percent1 } from "@/src/lib/format";
import type { TaxResult } from "@/src/lib/taxCalculator";

interface TaxHeadlineProps {
  result: TaxResult;
}

export function TaxHeadline({ result }: TaxHeadlineProps) {
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-6 border-b border-rule pb-6">
      <Tile label="Total tax & NI" value={gbp(result.totalTaxAndNI)} prominent />
      <Tile label="Take-home" value={gbp(result.takeHome)} prominent />
      <Tile label="Effective rate" value={percent1(result.effectiveRate)} />
      <Tile label="Marginal rate" value={percent1(result.marginalRate)} />
    </div>
  );
}

interface TileProps {
  label: string;
  value: string;
  prominent?: boolean;
}

function Tile({ label, value, prominent }: TileProps) {
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
