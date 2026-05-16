/* app/upload/page.tsx — first user-facing flow.
 *
 * Drop CSV bank statements → parse + classify in the browser → show
 * transactions and an inferred annual income summary → continue to
 * /calculate when at least salary income is set. State persists to
 * localStorage so a reload preserves work.
 *
 * Privacy: nothing on this page calls the network. CSV text is read with
 * the File API, parsed by src/lib/statementParser.ts, and stored locally. */

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AgentSettings } from "@/src/components/AgentSettings";
import { FileDropzone, type UploadedFile } from "@/src/components/FileDropzone";
import {
  PdfExtractionProgress,
  type ExtractionProgress,
} from "@/src/components/PdfExtractionProgress";
import { SiteFooter } from "@/src/components/SiteFooter";
import { TaxYearGuidance } from "@/src/components/TaxYearGuidance";
import { UnknownsPanel } from "@/src/components/UnknownsPanel";
import { detectCoverage } from "@/src/lib/taxYearCoverage";
import {
  cleanExtractedCsv,
  extractTransactionsFromPdfText,
  extractTransactionsManaged,
  loadAgentConfig,
  MANAGED_MODE,
  modelFor,
  PROVIDERS,
  providerReady,
  type AgentClientConfig,
  type ProviderKey,
} from "@/src/lib/agentClient";
import { extractTextFromPdf } from "@/src/lib/pdfExtractor";
import {
  effectiveIncomes,
  IncomeSummary,
  type IncomeOverrides,
  type NumericIncomeField,
} from "@/src/components/IncomeSummary";
import { TransactionsTable } from "@/src/components/TransactionsTable";
import { gbp } from "@/src/lib/format";
import {
  classify,
  inferIncomes,
  parseCSV,
  type BankFormat,
  type ClassifiedTransaction,
  type InferredIncomes,
  type TxCategory,
} from "@/src/lib/statementParser";

const STORAGE_KEY = "uk-tax-advisor:statements";

interface StatementMeta {
  filename: string;
  format: BankFormat;
  rowCount: number;
  uploadedAt: string;
}

interface PersistedState {
  statements: StatementMeta[];
  transactions: SerializedTransaction[];
  overrides: IncomeOverrides;
}

interface SerializedTransaction
  extends Omit<ClassifiedTransaction, "date" | "balance"> {
  date: string;
  balance?: number;
}

function serializeTx(tx: ClassifiedTransaction): SerializedTransaction {
  return { ...tx, date: tx.date.toISOString() };
}

function hydrateTx(tx: SerializedTransaction): ClassifiedTransaction {
  return { ...tx, date: new Date(tx.date) };
}

/** Days span from earliest to latest transaction, used for annualisation. */
function statementSpanDays(transactions: ClassifiedTransaction[]): number {
  if (transactions.length < 2) return 0;
  const times = transactions.map((t) => t.date.getTime());
  const span = Math.max(...times) - Math.min(...times);
  return span / (1000 * 60 * 60 * 24);
}

/** ×factor to annualise sub-12-month statements. 1 for short or full-year. */
function annualisationFactor(spanDays: number): number {
  if (spanDays < 28) return 1;
  if (spanDays >= 365) return 1;
  return 365 / spanDays;
}

/** A PDF awaiting user consent before its text is sent to a cloud LLM. */
interface PendingPdf {
  filename: string;
  text: string;
  pageCount: number;
  truncated: boolean;
}

/** State for the "Apply to N other matching transactions?" banner. */
interface BulkPrompt {
  description: string;
  category: TxCategory;
  matchCount: number;
}

export default function UploadPage() {
  const [statements, setStatements] = useState<StatementMeta[]>([]);
  const [transactions, setTransactions] = useState<ClassifiedTransaction[]>([]);
  const [overrides, setOverrides] = useState<IncomeOverrides>({});
  const [hydrated, setHydrated] = useState(false);
  const [agentConfig, setAgentConfig] = useState<AgentClientConfig | null>(null);
  const [pendingPdf, setPendingPdf] = useState<PendingPdf | null>(null);
  const [progress, setProgress] = useState<ExtractionProgress | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [csvFlash, setCsvFlash] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bulkPrompt, setBulkPrompt] = useState<BulkPrompt | null>(null);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedState;
        if (Array.isArray(parsed.statements) && Array.isArray(parsed.transactions)) {
          setStatements(parsed.statements);
          setTransactions(parsed.transactions.map(hydrateTx));
          setOverrides(parsed.overrides ?? {});
        }
      }
    } catch {
      // Corrupt state — start clean.
    } finally {
      setHydrated(true);
    }
    setAgentConfig(loadAgentConfig());
  }, []);

  // Persist on any change.
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const payload: PersistedState = {
      statements,
      transactions: transactions.map(serializeTx),
      overrides,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // localStorage may be unavailable (private mode, quota) — fail silently.
    }
  }, [statements, transactions, overrides, hydrated]);

  const ingestCsv = useCallback((files: { name: string; content: string }[]) => {
    const newStatements: StatementMeta[] = [];
    const newClassified: ClassifiedTransaction[] = [];
    for (const file of files) {
      const { format, transactions: parsed } = parseCSV(file.content);
      const classified = classify(parsed);
      newStatements.push({
        filename: file.name,
        format,
        rowCount: classified.length,
        uploadedAt: new Date().toISOString(),
      });
      newClassified.push(...classified);
    }
    setStatements((prev) => [...prev, ...newStatements]);
    setTransactions((prev) => [...prev, ...newClassified]);

    // Brief on-screen confirmation so even instant CSV imports feel
    // acknowledged. Auto-clears after 4 seconds.
    if (newStatements.length > 0) {
      const total = newClassified.length;
      const filenames = newStatements.map((s) => s.filename).join(", ");
      setCsvFlash(
        `Imported ${total} transaction${total === 1 ? "" : "s"} from ${filenames}.`,
      );
      window.setTimeout(() => setCsvFlash(null), 4000);
    }
  }, []);

  const handleFiles = useCallback(
    async (files: UploadedFile[]) => {
      const csvs: { name: string; content: string }[] = [];
      const pdfs: { name: string; file: File }[] = [];
      for (const f of files) {
        if (f.kind === "csv") csvs.push({ name: f.name, content: f.content });
        else pdfs.push({ name: f.name, file: f.file });
      }
      if (csvs.length > 0) ingestCsv(csvs);

      for (const pdf of pdfs) {
        setExtractError(null);
        setProgress({
          step: "reading",
          filename: pdf.name,
          startedAt: Date.now(),
        });
        try {
          const { text, pageCount, truncated } = await extractTextFromPdf(
            pdf.file,
          );
          if (!text.trim()) {
            setProgress({
              step: "error",
              filename: pdf.name,
              pageCount,
              errorMessage: `No text layer found — is this a scanned PDF? OCR isn't supported yet.`,
            });
            continue;
          }
          setPendingPdf({ filename: pdf.name, text, pageCount, truncated });
          setProgress((prev) =>
            prev
              ? {
                  ...prev,
                  step: "awaiting-consent",
                  pageCount,
                  charsSent: text.length,
                }
              : null,
          );
          // Only show one consent modal at a time; the remaining PDFs in
          // this batch are deliberately dropped. Most users drop one at a
          // time anyway, and chaining LLM consents would be confusing.
          break;
        } catch (err) {
          setProgress({
            step: "error",
            filename: pdf.name,
            errorMessage:
              err instanceof Error
                ? `Could not read PDF: ${err.message}`
                : "Could not read PDF.",
          });
        }
      }
    },
    [ingestCsv],
  );

  const confirmPdfExtraction = useCallback(async () => {
    if (!pendingPdf) return;
    if (!MANAGED_MODE && !agentConfig) return;
    setExtractError(null);
    setPendingPdf(null); // close the consent modal immediately
    const filename = pendingPdf.filename;
    const startedAt = Date.now();

    setProgress({
      step: "extracting",
      filename,
      pageCount: pendingPdf.pageCount,
      charsSent: pendingPdf.text.length,
      charsReceived: 0,
      transactionsStreamed: 0,
      preview: [],
      startedAt,
    });

    let accumulated = "";
    let lastUpdate = Date.now();
    const countTxs = (text: string): number => {
      const lines = text.split("\n").filter((l) => l.trim().length > 0);
      // First line is the header; remaining lines are transactions.
      return Math.max(0, lines.length - 1);
    };

    try {
      const stream = MANAGED_MODE
        ? extractTransactionsManaged(pendingPdf.text, filename)
        : extractTransactionsFromPdfText(
            agentConfig!,
            pendingPdf.text,
            filename,
          );
      for await (const chunk of stream) {
        accumulated += chunk;
        // Throttle UI updates to ~4× per second to avoid re-render churn.
        if (Date.now() - lastUpdate > 250) {
          const lines = accumulated.split("\n").filter((l) => l.trim());
          setProgress({
            step: "extracting",
            filename,
            pageCount: pendingPdf.pageCount,
            charsSent: pendingPdf.text.length,
            charsReceived: accumulated.length,
            transactionsStreamed: countTxs(accumulated),
            preview: lines.slice(-3),
            startedAt,
          });
          lastUpdate = Date.now();
        }
      }
    } catch (err) {
      setProgress({
        step: "error",
        filename,
        pageCount: pendingPdf.pageCount,
        charsSent: pendingPdf.text.length,
        errorMessage:
          err instanceof Error
            ? `Extraction failed: ${err.message}`
            : "Extraction failed.",
      });
      return;
    }

    setProgress((prev) =>
      prev
        ? {
            ...prev,
            step: "parsing",
            charsReceived: accumulated.length,
            transactionsStreamed: countTxs(accumulated),
            preview: accumulated.split("\n").filter((l) => l.trim()).slice(-3),
          }
        : null,
    );

    const csv = cleanExtractedCsv(accumulated);
    if (!csv.toLowerCase().includes("date,description,amount")) {
      setProgress({
        step: "error",
        filename,
        pageCount: pendingPdf.pageCount,
        charsSent: pendingPdf.text.length,
        errorMessage:
          "The model returned no recognisable CSV header. Try a different model or try again.",
      });
      return;
    }

    const providerLabel = MANAGED_MODE
      ? "Claude (hosted)"
      : PROVIDERS[agentConfig!.activeProvider].label;

    try {
      const { format, transactions: parsed } = parseCSV(csv);
      const classified = classify(parsed);
      const baseLabel = filename.replace(/\.pdf$/i, "");
      setStatements((prev) => [
        ...prev,
        {
          filename: `${baseLabel} (extracted from PDF via ${providerLabel})`,
          format,
          rowCount: classified.length,
          uploadedAt: new Date().toISOString(),
        },
      ]);
      setTransactions((prev) => [...prev, ...classified]);
      setProgress({
        step: "done",
        filename,
        pageCount: pendingPdf.pageCount,
        charsSent: pendingPdf.text.length,
        charsReceived: accumulated.length,
        transactionsStreamed: classified.length,
        transactionCount: classified.length,
        startedAt,
        completedAt: Date.now(),
      });
    } catch (err) {
      setProgress({
        step: "error",
        filename,
        pageCount: pendingPdf.pageCount,
        charsSent: pendingPdf.text.length,
        errorMessage:
          err instanceof Error
            ? `Could not parse the extracted CSV: ${err.message}`
            : "Could not parse the extracted CSV.",
      });
    }
  }, [agentConfig, pendingPdf]);

  const cancelPdfExtraction = useCallback(() => {
    setPendingPdf(null);
    setProgress(null);
  }, []);

  const handleCategoryChange = useCallback(
    (index: number, category: TxCategory) => {
      let description = "";
      setTransactions((prev) => {
        description = prev[index]?.description ?? "";
        return prev.map((tx, i) =>
          // A manual recategorisation is an explicit confirmation, so we
          // also bump confidence to 1 — that drops the transaction out of
          // the "needs review" banner the moment the user resolves it.
          i === index ? { ...tx, category, confidence: 1 } : tx,
        );
      });
      // If there are other transactions with the same description, offer
      // to bulk-apply.
      const others = transactions.filter(
        (tx, i) => i !== index && tx.description === description,
      );
      if (others.length > 0) {
        setBulkPrompt({
          description,
          category,
          matchCount: others.length,
        });
      }
    },
    [transactions],
  );

  const handleBulkCategorise = useCallback(
    (description: string, category: TxCategory) => {
      setTransactions((prev) =>
        prev.map((tx) =>
          tx.description === description
            ? { ...tx, category, confidence: 1 }
            : tx,
        ),
      );
      setBulkPrompt(null);
    },
    [],
  );

  const handleOverride = useCallback(
    (field: NumericIncomeField, value: number | null) => {
      setOverrides((prev) => {
        const next = { ...prev };
        if (value === null) delete next[field];
        else next[field] = value;
        return next;
      });
    },
    [],
  );

  const clearAll = useCallback(() => {
    setStatements([]);
    setTransactions([]);
    setOverrides({});
  }, []);

  const inferred: InferredIncomes = useMemo(
    () => inferIncomes(transactions),
    [transactions],
  );
  const coverage = useMemo(() => detectCoverage(transactions), [transactions]);
  const spanDays = useMemo(
    () => statementSpanDays(transactions),
    [transactions],
  );
  const factor = useMemo(() => annualisationFactor(spanDays), [spanDays]);
  const effective = useMemo(
    () => effectiveIncomes(inferred, overrides, factor),
    [inferred, overrides, factor],
  );

  const canContinue = effective.earnedIncome > 0;

  return (
    <main className="min-h-screen flex flex-col">
      <PrivacyBanner />

      <div className="max-w-4xl mx-auto w-full px-6 sm:px-12 py-12 flex-1">
        <header className="mb-10">
          <p className="font-sans text-[11px] uppercase tracking-[0.18em] text-muted mb-3">
            Step 1 of 3 · Upload
          </p>
          <h1 className="font-serif font-semibold text-4xl sm:text-5xl tracking-tight leading-[1.05]">
            Upload your bank statements
          </h1>
          <p className="mt-4 font-serif text-lg text-ink/80 max-w-2xl">
            Export CSVs from your bank and drop them below. Multiple files are
            fine — current account, savings, brokerage all in one go.
            Everything is parsed in your browser; nothing leaves the page.
          </p>
        </header>

        <section className="mb-8">
          <TaxYearGuidance coverage={coverage} />
        </section>

        <section className="mb-10">
          <FileDropzone onFiles={handleFiles} />
          {MANAGED_MODE ? (
            <p className="mt-3 text-xs text-muted leading-relaxed">
              PDF extraction uses{" "}
              <strong className="text-ink">Claude (hosted)</strong>. PDF
              text leaves your browser for the server hosting this app.
            </p>
          ) : (
            agentConfig && (
              <ProviderStatus
                config={agentConfig}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            )
          )}
          {progress && (
            <PdfExtractionProgress
              progress={progress}
              onDismiss={
                progress.step === "done" || progress.step === "error"
                  ? () => setProgress(null)
                  : undefined
              }
            />
          )}
          {csvFlash && (
            <p
              className="mt-3 text-sm text-accent"
              role="status"
              aria-live="polite"
            >
              ✓ {csvFlash}
            </p>
          )}
          {extractError && (
            <p className="mt-3 text-sm text-accent" role="alert">
              {extractError}
            </p>
          )}
          {statements.length > 0 && (
            <div className="mt-5 flex flex-wrap items-baseline justify-between gap-3">
              <ul className="text-sm text-muted space-y-1">
                {statements.map((s, i) => (
                  <li key={`${s.filename}-${i}`}>
                    <span className="font-mono text-ink">{s.filename}</span>
                    <span className="text-muted">
                      {" "}
                      — {formatBankLabel(s.format)} · {s.rowCount} transaction
                      {s.rowCount === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-muted underline underline-offset-4 hover:text-accent"
              >
                Clear all
              </button>
            </div>
          )}
        </section>

        {transactions.length > 0 && (
          <>
            <section className="mb-10">
              <IncomeSummary
                inferred={inferred}
                overrides={overrides}
                onOverride={handleOverride}
                annualisationFactor={factor}
              />
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">
                  Effective earned income for the calculator:{" "}
                  <span className="font-mono text-ink">
                    {gbp(effective.earnedIncome + effective.selfEmploymentIncome + effective.rentalIncome)}
                  </span>
                </p>
                <ContinueButton enabled={canContinue} />
              </div>
            </section>

            <section className="mb-10">
              <UnknownsPanel
                transactions={transactions}
                onBulkCategorise={handleBulkCategorise}
              />
            </section>

            <section className="mb-10">
              <h2 className="font-serif text-2xl text-ink mb-4">
                Transactions
              </h2>
              {bulkPrompt && (
                <BulkApplyBanner
                  prompt={bulkPrompt}
                  onApplyAll={() =>
                    handleBulkCategorise(
                      bulkPrompt.description,
                      bulkPrompt.category,
                    )
                  }
                  onDismiss={() => setBulkPrompt(null)}
                />
              )}
              <TransactionsTable
                transactions={transactions}
                onCategoryChange={handleCategoryChange}
              />
            </section>
          </>
        )}
      </div>

      <SiteFooter />

      {pendingPdf && (
        <PdfConsentModal
          pdf={pendingPdf}
          config={agentConfig}
          ready={
            MANAGED_MODE ? true : agentConfig ? providerReady(agentConfig) : false
          }
          onCancel={cancelPdfExtraction}
          onConfirm={confirmPdfExtraction}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {!MANAGED_MODE && (
        <AgentSettings
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onChange={(c) => setAgentConfig(c)}
        />
      )}
    </main>
  );
}

function BulkApplyBanner({
  prompt,
  onApplyAll,
  onDismiss,
}: {
  prompt: BulkPrompt;
  onApplyAll: () => void;
  onDismiss: () => void;
}) {
  const label = CATEGORY_LABELS[prompt.category] ?? prompt.category;
  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded border border-accent bg-accent/5 px-4 py-3"
    >
      <p className="text-sm text-ink">
        Apply <strong>{label}</strong> to{" "}
        <strong>{prompt.matchCount}</strong> other transaction
        {prompt.matchCount === 1 ? "" : "s"} with the description{" "}
        <span className="font-mono text-ink/80">
          &ldquo;{prompt.description}&rdquo;
        </span>
        ?
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onApplyAll}
          className="rounded-sm bg-accent text-paper px-3 py-1.5 text-xs font-medium hover:bg-accent-deep"
        >
          Apply to all {prompt.matchCount}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-sm border border-rule bg-paper px-3 py-1.5 text-xs hover:border-ink/40"
        >
          Just this one
        </button>
      </div>
    </div>
  );
}

const CATEGORY_LABELS: Record<TxCategory, string> = {
  salary: "Salary",
  "savings-interest": "Savings interest",
  dividend: "Dividend",
  "rental-income": "Rental income",
  "self-employment-income": "Self-employment",
  "pension-contribution": "Pension contribution",
  "charity-donation": "Charity donation",
  "isa-deposit": "ISA deposit",
  transfer: "Transfer / personal help",
  expense: "Expense",
  unknown: "Unknown",
};

function ProviderStatus({
  config,
  onOpenSettings,
}: {
  config: AgentClientConfig;
  onOpenSettings: () => void;
}) {
  const provider = PROVIDERS[config.activeProvider];
  const isLocal = config.activeProvider === "ollama";
  const ready = providerReady(config);
  return (
    <p className="mt-3 text-xs text-muted leading-relaxed">
      PDF extraction uses your active AI provider:{" "}
      <strong className="text-ink">{provider.label}</strong> ·{" "}
      <span className="font-mono">{modelFor(config)}</span>
      {isLocal
        ? " — runs locally on your machine."
        : ready
          ? " — PDF text will leave your browser for this provider's servers."
          : " — needs an API key to extract."}{" "}
      <button
        type="button"
        onClick={onOpenSettings}
        className="text-accent underline underline-offset-4 hover:no-underline"
      >
        Change
      </button>
    </p>
  );
}

function PdfConsentModal({
  pdf,
  config,
  ready,
  onCancel,
  onConfirm,
  onOpenSettings,
}: {
  pdf: PendingPdf;
  config: AgentClientConfig | null;
  ready: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onOpenSettings: () => void;
}) {
  const providerLabel = MANAGED_MODE
    ? "Claude (hosted)"
    : config
      ? PROVIDERS[config.activeProvider].label
      : "(no provider)";
  const isLocal = !MANAGED_MODE && config?.activeProvider === "ollama";
  const modelLabel = MANAGED_MODE
    ? "claude-sonnet-4-5"
    : config
      ? modelFor(config)
      : "—";
  const preview = pdf.text.slice(0, 480).replace(/\s+/g, " ").trim();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-consent-title"
    >
      <div className="w-full max-w-xl rounded bg-paper shadow-2xl">
        <header className="px-6 py-4 border-b border-rule">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted">
            Extract transactions from PDF
          </p>
          <h2
            id="pdf-consent-title"
            className="mt-1 font-serif text-2xl text-ink"
          >
            {pdf.filename}
          </h2>
          <p className="mt-1 text-xs text-muted">
            {pdf.pageCount} page{pdf.pageCount === 1 ? "" : "s"} ·{" "}
            {pdf.text.length.toLocaleString()} characters of text
            {pdf.truncated && " · truncated to fit"}
          </p>
        </header>

        <div className="px-6 py-4 space-y-4 text-sm">
          <div
            className={[
              "rounded border p-3",
              isLocal
                ? "border-rule bg-ink/[0.02]"
                : "border-accent/40 bg-accent/5",
            ].join(" ")}
          >
            <p className="text-ink">
              {isLocal ? (
                <>
                  This PDF&apos;s text will be sent to{" "}
                  <strong>{providerLabel}</strong> running on your machine.
                  Nothing leaves your device.
                </>
              ) : MANAGED_MODE ? (
                <>
                  This PDF&apos;s text will be sent to{" "}
                  <strong>{providerLabel}</strong> via the server hosting
                  this app, which routes the request to Anthropic using a
                  server-side key.
                </>
              ) : (
                <>
                  This PDF&apos;s text will be sent to{" "}
                  <strong>{providerLabel}</strong> at{" "}
                  <span className="font-mono">{modelLabel}</span>. The data
                  will leave your browser and travel to that provider&apos;s
                  servers under their privacy policy.
                </>
              )}
            </p>
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-muted hover:text-ink">
              Preview the text that will be sent
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto rounded border border-rule bg-ink/[0.02] p-2 font-mono text-[11px] whitespace-pre-wrap break-words text-ink/80">
              {preview}
              {pdf.text.length > preview.length && " …"}
            </pre>
          </details>

          {!ready && !MANAGED_MODE && (
            <p className="text-xs text-accent">
              No API key configured for {providerLabel}.{" "}
              <button
                type="button"
                onClick={onOpenSettings}
                className="underline underline-offset-4 hover:no-underline"
              >
                Open settings to add one
              </button>
              .
            </p>
          )}
        </div>

        <footer className="px-6 py-3 border-t border-rule bg-ink/[0.02] flex items-center justify-between gap-3">
          {!MANAGED_MODE ? (
            <button
              type="button"
              onClick={onOpenSettings}
              className="text-xs text-muted underline underline-offset-4 hover:text-accent"
            >
              Use a different provider
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-sm border border-rule bg-paper px-4 py-2 text-sm hover:border-ink/40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!ready}
              className="rounded-sm bg-accent text-paper px-4 py-2 text-sm font-medium hover:bg-accent-deep disabled:bg-rule disabled:text-muted disabled:cursor-not-allowed"
            >
              {isLocal ? "Extract" : "Send and extract"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function PrivacyBanner() {
  return (
    <div className="bg-ink text-paper">
      <p className="max-w-4xl mx-auto px-6 sm:px-12 py-3 text-xs sm:text-sm text-paper/90">
        Your bank statements stay in your browser. They are never uploaded to
        any server.
      </p>
    </div>
  );
}

function ContinueButton({ enabled }: { enabled: boolean }) {
  if (!enabled) {
    return (
      <button
        type="button"
        disabled
        aria-disabled
        className="inline-flex items-center gap-2 rounded-sm border border-rule bg-paper px-5 py-2.5 text-sm text-muted cursor-not-allowed"
        title="Set at least your salary income to continue."
      >
        Continue to calculation →
      </button>
    );
  }
  return (
    <Link
      href="/calculate"
      className="inline-flex items-center gap-2 rounded-sm bg-accent px-5 py-2.5 text-sm font-medium text-paper hover:bg-accent-deep transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
    >
      Continue to calculation →
    </Link>
  );
}

function formatBankLabel(format: BankFormat): string {
  switch (format) {
    case "monzo":
      return "Monzo";
    case "starling":
      return "Starling";
    case "lloyds":
      return "Lloyds-style";
    default:
      return "Generic CSV";
  }
}
