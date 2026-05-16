/* src/components/PdfExtractionProgress.tsx — full-screen modal that
 * displays during PDF→CSV extraction. Replaces the consent modal in
 * place so the user's eye doesn't have to hunt for a hidden inline
 * progress card after clicking "Send and extract".
 *
 * Renders an indeterminate animated bar (CSS keyframes in
 * app/globals.css), a three-step stepper with status indicators, live
 * counters during streaming, and a tailing CSV preview. Surfaces
 * errors with a Try Again option that returns to consent without
 * requiring a re-upload. */

"use client";

import { useMemo } from "react";

export type ExtractionStep =
  | "reading"
  | "awaiting-consent"
  | "extracting"
  | "parsing"
  | "done"
  | "error";

export interface ExtractionProgress {
  step: ExtractionStep;
  filename: string;
  /** PDF.js page count (set once reading completes). */
  pageCount?: number;
  /** Bytes of PDF text we sent for extraction. */
  charsSent?: number;
  /** Characters received from the LLM so far. */
  charsReceived?: number;
  /** Detected transactions so far during streaming. */
  transactionsStreamed?: number;
  /** Final imported transaction count (set when step = 'done'). */
  transactionCount?: number;
  /** Last 3 lines of CSV received so far (live preview). */
  preview?: string[];
  /** Time the extraction started, for elapsed-time display. */
  startedAt?: number;
  /** Time the extraction completed, used when step = 'done'. */
  completedAt?: number;
  errorMessage?: string;
  /** Number of extra files queued behind this one. Surfaced as
   *  "N more PDFs queued" so users know more is coming. */
  queueRemaining?: number;
}

interface PdfExtractionProgressProps {
  progress: ExtractionProgress;
  /** Close the modal entirely. Visible when done / error. */
  onDismiss: () => void;
  /** Reopen the consent modal for the same PDF. Visible on error. */
  onTryAgain?: () => void;
}

export function PdfExtractionProgress({
  progress,
  onDismiss,
  onTryAgain,
}: PdfExtractionProgressProps) {
  const isError = progress.step === "error";
  const isDone = progress.step === "done";
  const isInFlight =
    progress.step === "reading" ||
    progress.step === "extracting" ||
    progress.step === "parsing";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-extract-progress-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
    >
      <div className="w-full max-w-xl rounded bg-paper shadow-2xl overflow-hidden">
        <ProgressBar isInFlight={isInFlight} isDone={isDone} isError={isError} />

        <header className="px-6 py-4 border-b border-rule">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted">
            {isError
              ? "Extraction failed"
              : isDone
                ? "Extraction complete"
                : "Extracting from PDF"}
          </p>
          <h2
            id="pdf-extract-progress-title"
            className="mt-1 font-serif text-xl text-ink leading-tight"
          >
            {progress.filename}
          </h2>
          {progress.queueRemaining !== undefined &&
            progress.queueRemaining > 0 && (
              <p className="mt-1 text-xs text-muted">
                {progress.queueRemaining} more PDF
                {progress.queueRemaining === 1 ? "" : "s"} queued after this one.
              </p>
            )}
        </header>

        <div className="px-6 py-5">
          {isError ? (
            <p className="text-sm text-accent">
              {progress.errorMessage ?? "Unknown error."}
            </p>
          ) : (
            <Stepper progress={progress} />
          )}

          {progress.step === "extracting" &&
            progress.preview &&
            progress.preview.length > 0 && (
              <details className="mt-4 text-xs">
                <summary className="cursor-pointer text-muted hover:text-ink">
                  Preview of incoming CSV
                </summary>
                <pre className="mt-2 max-h-32 overflow-auto rounded border border-rule bg-ink/[0.02] p-2 font-mono text-[11px] text-ink/80 whitespace-pre-wrap break-words">
                  {progress.preview.join("\n")}
                </pre>
              </details>
            )}
        </div>

        {(isDone || isError) && (
          <footer className="px-6 py-3 border-t border-rule bg-ink/[0.02] flex items-center justify-end gap-2">
            {isError && onTryAgain && (
              <button
                type="button"
                onClick={onTryAgain}
                className="rounded-sm border border-rule bg-paper px-4 py-2 text-sm hover:border-ink/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Try again
              </button>
            )}
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-sm bg-accent text-paper px-4 py-2 text-sm font-medium hover:bg-accent-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
            >
              {isDone ? "Done" : "Close"}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

function ProgressBar({
  isInFlight,
  isDone,
  isError,
}: {
  isInFlight: boolean;
  isDone: boolean;
  isError: boolean;
}) {
  return (
    <div className="h-1 w-full bg-rule overflow-hidden relative">
      {isInFlight && (
        <div
          className="h-full w-1/4 bg-accent absolute top-0 left-0 animate-uta-indeterminate"
          aria-hidden
        />
      )}
      {isDone && <div className="h-full w-full bg-accent" aria-hidden />}
      {isError && (
        <div className="h-full w-full bg-accent-deep" aria-hidden />
      )}
    </div>
  );
}

function Stepper({ progress }: { progress: ExtractionProgress }) {
  const elapsedSec = useMemo(() => {
    if (!progress.startedAt) return 0;
    const end = progress.completedAt ?? Date.now();
    return Math.max(0, (end - progress.startedAt) / 1000);
  }, [progress.startedAt, progress.completedAt]);

  const stepStatus = (id: ExtractionStep): "done" | "active" | "pending" => {
    const order: ExtractionStep[] = [
      "reading",
      "awaiting-consent",
      "extracting",
      "parsing",
      "done",
    ];
    const currentIdx = order.indexOf(progress.step);
    const stepIdx = order.indexOf(id);
    if (stepIdx < currentIdx) return "done";
    if (stepIdx === currentIdx) return "active";
    return "pending";
  };

  return (
    <ol className="space-y-3 text-sm">
      <Step
        status={stepStatus("reading")}
        label="Read PDF text"
        detail={
          progress.pageCount
            ? `${progress.pageCount} page${progress.pageCount === 1 ? "" : "s"} · ${progress.charsSent?.toLocaleString() ?? 0} characters`
            : "Parsing PDF…"
        }
      />
      <Step
        status={
          progress.step === "awaiting-consent"
            ? "active"
            : stepStatus("extracting")
        }
        label={
          progress.step === "awaiting-consent"
            ? "Awaiting your consent"
            : "Extract transactions via LLM"
        }
        detail={
          progress.step === "extracting"
            ? `${(progress.charsReceived ?? 0).toLocaleString()} chars received · ${progress.transactionsStreamed ?? 0} transaction${progress.transactionsStreamed === 1 ? "" : "s"} so far`
            : progress.step === "awaiting-consent"
              ? "Click 'Send and extract' in the consent modal."
              : (progress.charsReceived ?? 0) > 0
                ? `${(progress.charsReceived ?? 0).toLocaleString()} characters received`
                : null
        }
      />
      <Step
        status={stepStatus("parsing")}
        label="Parse and classify rows"
        detail={
          progress.step === "done"
            ? `Imported ${progress.transactionCount ?? 0} transaction${progress.transactionCount === 1 ? "" : "s"} in ${elapsedSec.toFixed(1)}s`
            : null
        }
      />
    </ol>
  );
}

function Step({
  status,
  label,
  detail,
}: {
  status: "done" | "active" | "pending";
  label: string;
  detail: string | null;
}) {
  return (
    <li className="flex items-start gap-3">
      <StatusIndicator status={status} />
      <div className="min-w-0 flex-1">
        <p
          className={[
            "leading-tight",
            status === "pending" ? "text-muted" : "text-ink",
            status === "active" ? "font-medium" : "",
          ].join(" ")}
        >
          {label}
        </p>
        {detail && (
          <p className="mt-0.5 text-xs text-muted font-mono tabular-nums">
            {detail}
          </p>
        )}
      </div>
    </li>
  );
}

function StatusIndicator({ status }: { status: "done" | "active" | "pending" }) {
  if (status === "done") {
    return (
      <span
        className="flex-shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-full bg-accent text-paper text-[11px]"
        aria-label="Completed"
      >
        ✓
      </span>
    );
  }
  if (status === "active") {
    return (
      <span
        className="flex-shrink-0 inline-flex items-center justify-center h-5 w-5"
        aria-label="In progress"
      >
        <span className="h-3 w-3 rounded-full bg-accent animate-pulse" />
      </span>
    );
  }
  return (
    <span
      className="flex-shrink-0 inline-flex items-center justify-center h-5 w-5"
      aria-label="Pending"
    >
      <span className="h-2.5 w-2.5 rounded-full border border-rule" />
    </span>
  );
}
