/* src/components/BandBreakdownBar.tsx — horizontal stacked bar visualising
 * how taxable income spreads across the bands, plus a legend table.
 *
 * Pure SVG (no chart dep) per the Sprint 8 brief. The colour ramp goes
 * paler-burgundy → burgundy → deep-burgundy as the band rate climbs, with
 * the rule colour for 0% allowance carve-outs (dividend allowance, PSA,
 * starting rate for savings). Hover surfaces a native browser tooltip
 * via <title>; the legend below repeats every figure for users who
 * can't hover. */

"use client";

import { gbpPrecise } from "@/src/lib/format";
import type { BandBreakdown } from "@/src/lib/taxCalculator";

interface BandBreakdownBarProps {
  breakdown: BandBreakdown[];
}

export function BandBreakdownBar({ breakdown }: BandBreakdownBarProps) {
  const total = breakdown.reduce((sum, b) => sum + b.taxableInBand, 0);

  if (total === 0 || breakdown.length === 0) {
    return (
      <p className="text-sm text-muted italic">
        No taxable income — your allowances cover everything.
      </p>
    );
  }

  let cursor = 0;
  const segments = breakdown.map((band, i) => {
    const width = (band.taxableInBand / total) * 100;
    const seg = { x: cursor, width, band, key: i };
    cursor += width;
    return seg;
  });

  return (
    <div>
      <svg
        viewBox="0 0 100 8"
        preserveAspectRatio="none"
        className="w-full h-10 block rounded-sm overflow-hidden"
        role="img"
        aria-label="Tax bands stacked breakdown"
      >
        {segments.map(({ x, width, band, key }) => (
          <rect
            key={key}
            x={x}
            y={0}
            width={Math.max(width, 0.3)}
            height={8}
            fill={colorForBand(band)}
          >
            <title>
              {band.bandName}: {gbpPrecise(band.taxableInBand)} at{" "}
              {(band.rate * 100).toFixed(2)}% → {gbpPrecise(band.tax)} tax
            </title>
          </rect>
        ))}
      </svg>

      <ul className="mt-4 divide-y divide-rule text-sm">
        {breakdown.map((band, i) => (
          <li
            key={i}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
          >
            <span
              className="block h-3 w-3 rounded-sm flex-shrink-0"
              style={{ background: colorForBand(band) }}
              aria-hidden
            />
            <span className="flex-1 min-w-0 truncate">{band.bandName}</span>
            <span className="font-mono text-muted whitespace-nowrap tabular-nums">
              {gbpPrecise(band.taxableInBand)}
            </span>
            <span className="font-mono text-muted whitespace-nowrap tabular-nums">
              @ {(band.rate * 100).toFixed(2)}%
            </span>
            <span className="font-mono text-ink whitespace-nowrap text-right w-24 tabular-nums">
              → {gbpPrecise(band.tax)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Map a band to a colour: rule-grey for 0% carve-outs, then a three-step
 * burgundy ramp by marginal rate. Inline hex values to keep the SVG
 * portable (Tailwind's arbitrary-value classes can't reach SVG fill).
 */
function colorForBand(band: BandBreakdown): string {
  if (band.rate === 0) return "#d9d4cb"; // --color-rule
  if (band.rate <= 0.21) return "#c98f9d"; // pale burgundy — basic / starter / intermediate
  if (band.rate <= 0.42) return "#7a1f2b"; // --color-accent — higher
  return "#5e1620"; // --color-accent-deep — additional / advanced / top
}
