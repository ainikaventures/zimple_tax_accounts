/* src/components/ExportPanel.tsx — Sprint 11 export controls.
 *
 * Two buttons:
 *   - Download Excel POSTs ExportData to /api/export and saves the
 *     resulting .xlsx via a Blob URL.
 *   - Download JSON serialises ExportData client-side (avoids pulling
 *     the SheetJS dependency into the browser bundle) and saves it as
 *     a .json file via a Blob URL.
 *
 * Below the buttons sit two collapsible sections per the brief:
 *   - "What's in this file?" — quick list of the five workbook sheets
 *     and what each one contains, so the user knows what they're
 *     downloading.
 *   - "SA100 helper preview" — the exact figures that will appear in
 *     the SA100 helper sheet, in a small table so the user can verify
 *     before opening the file. Mirrors src/lib/export.ts → buildSA100. */

"use client";

import { useState } from "react";

import { gbp } from "@/src/lib/format";
import type { ExportData } from "@/src/lib/export";

interface ExportPanelProps {
  data: ExportData;
}

export function ExportPanel({ data }: ExportPanelProps) {
  const [busy, setBusy] = useState<"excel" | "json" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const downloadExcel = async () => {
    setBusy("excel");
    setError(null);
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => response.statusText);
        throw new Error(`Excel export failed: ${response.status} ${text}`);
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? defaultFilename(data, "xlsx");
      triggerDownload(blob, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const downloadJSON = () => {
    setBusy("json");
    setError(null);
    try {
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      triggerDownload(blob, defaultFilename(data, "json"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      aria-label="Download tax data"
      className="rounded border border-rule bg-paper p-6 space-y-4"
    >
      <header>
        <h2 className="font-serif font-semibold text-2xl text-ink">
          Download your filing-ready data
        </h2>
        <p className="mt-1 text-sm text-muted max-w-2xl">
          Two formats: Excel for a five-sheet workbook (Summary, Band
          breakdown, Transactions, SA100 helper, Suggestions); JSON for
          a structured dump you can re-import elsewhere. Both are
          generated from the figures currently displayed above.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={downloadExcel}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-sm bg-accent text-paper px-4 py-2 text-sm font-medium hover:bg-accent-deep disabled:bg-rule disabled:text-muted disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          {busy === "excel" ? "Building…" : "Download Excel"}
        </button>
        <button
          type="button"
          onClick={downloadJSON}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-sm border border-rule bg-paper text-ink px-4 py-2 text-sm font-medium hover:border-ink/40 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy === "json" ? "Building…" : "Download JSON"}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-xs text-accent">
          {error}
        </p>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer list-none text-ink hover:text-accent flex items-center gap-2 select-none">
          <span className="text-muted transition-transform group-open:rotate-90" aria-hidden>
            ›
          </span>
          <span>What&apos;s in the Excel file?</span>
        </summary>
        <ul className="mt-3 ml-5 space-y-2 text-sm text-ink/85">
          <li>
            <strong>Summary</strong> — tax year, region, income breakdown,
            allowances applied, tax computation, effective + marginal rates,
            take-home.
          </li>
          <li>
            <strong>Band Breakdown</strong> — every entry from{" "}
            <code>taxResult.breakdown</code> with band name, amount in band,
            rate, and tax.
          </li>
          <li>
            <strong>Transactions</strong> — every classified transaction with
            date, description, amount, category, and classifier confidence.
          </li>
          <li>
            <strong>SA100 Helper</strong> — your figures pre-keyed to HMRC
            self-assessment box numbers (SA102 box 1, SA103S/F, SA105 box 20,
            SA100 interest/dividends, SA100 TR4) with a verify-against-source
            notice.
          </li>
          <li>
            <strong>Suggestions</strong> — every tax-saving suggestion with
            estimated annual saving, why it applies, and what to do.
          </li>
        </ul>
      </details>

      <details className="text-sm group">
        <summary className="cursor-pointer list-none text-ink hover:text-accent flex items-center gap-2 select-none">
          <span className="text-muted transition-transform group-open:rotate-90" aria-hidden>
            ›
          </span>
          <span>SA100 helper preview</span>
        </summary>
        <SA100Preview data={data} />
      </details>

      <p className="text-[11px] text-muted leading-snug">
        Files are generated from the figures above. The SA100 helper is a
        starting point, not a filed return — verify every figure against
        your original payslips, P60, dividend vouchers, and pension /
        charity statements before submitting to HMRC.
      </p>
    </section>
  );
}

function SA100Preview({ data }: { data: ExportData }) {
  const i = data.incomes;
  const rows = [
    {
      box: "SA102 box 1",
      label: "Pay from this employment (salary, gross)",
      value: i.earnedIncome,
    },
    {
      box: "SA103S box 9 / SA103F box 15",
      label: "Self-employment turnover",
      value: i.selfEmploymentIncome,
    },
    {
      box: "SA105 box 20",
      label: "Property income",
      value: i.rentalIncome,
    },
    {
      box: "SA100 (interest box)",
      label: "UK savings interest (excluding ISAs)",
      value: i.savingsIncome,
    },
    {
      box: "SA100 (dividends box)",
      label: "UK company dividends (excluding ISAs)",
      value: i.dividendIncome,
    },
    {
      box: "SA100 TR4 (Gift Aid)",
      label: "Gift Aid donations — verify net vs gross, ×1.25 if declared",
      value: i.charityDonations,
    },
    {
      box: "SA100 TR4 (pensions)",
      label: "Personal pension contributions — confirm net vs gross",
      value: i.pensionContributions,
    },
  ];

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-rule text-left text-[11px] uppercase tracking-[0.14em] text-muted">
            <th scope="col" className="py-2 pr-3 font-medium">
              Form / Box
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Description
            </th>
            <th scope="col" className="py-2 font-medium text-right">
              Inferred figure
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.box} className="border-b border-rule/60">
              <td className="py-2 pr-3 font-mono text-[12px] whitespace-nowrap">
                {row.box}
              </td>
              <td className="py-2 pr-3 text-ink/80">{row.label}</td>
              <td className="py-2 text-right font-mono tabular-nums whitespace-nowrap">
                {gbp(row.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-muted">
        Tax year: <span className="font-mono">{data.taxResult.taxYear}</span>{" "}
        · Region:{" "}
        <span className="font-mono">
          {data.taxResult.region === "scotland"
            ? "Scotland"
            : "England / Wales / NI"}
        </span>
      </p>
    </div>
  );
}

function defaultFilename(data: ExportData, ext: "xlsx" | "json"): string {
  const year = data.taxResult.taxYear.replace(/[\/\\:]/g, "-");
  return `uk-tax-${year}.${ext}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
