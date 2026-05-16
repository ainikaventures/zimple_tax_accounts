/* src/lib/format.ts — small formatting helpers for currency, percent, and
 * date display. Centralised so every component renders amounts the same way
 * (£60,000 not £60000.00, percentages with consistent decimal places, etc.). */

const GBP_INTEGER = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

const GBP_PRECISE = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** £60,000 — for headline numbers in summaries / hero panels. */
export function gbp(amount: number): string {
  return GBP_INTEGER.format(Math.round(amount));
}

/** £60,000.00 — for breakdown rows where pennies matter. */
export function gbpPrecise(amount: number): string {
  return GBP_PRECISE.format(amount);
}

/** 0.42 → "42%" with no decimal places. */
export function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** 0.4237 → "42.4%" with one decimal place — used for effective rate display. */
export function percent1(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/** 2025-04-12 — short locale-independent date display for tables. */
export function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}
