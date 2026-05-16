/* src/components/PdfExtractionProgress.tsx — visible, ongoing progress UI
 * for the PDF extraction flow on /upload.
 *
 * The PDF flow has three slow steps (read PDF text, stream LLM extraction,
 * parse + classify); without something to look at, the panel feels frozen
 * for 10–30 seconds. This component renders a small stepper with live
 * counters and a tailing preview of the latest CSV rows so the user can
 * see something is actually happening. */

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
}

interface PdfExtractionProgressProps {
  progress: ExtractionProgress;
  onDismiss?: () => void;
}

export function PdfExtractionProgress({
  progress,
  onDismiss,
}: PdfExtractionProgressProps) {
  const isError = progress.step === "error";
  const isDone = progress.step === "done";

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        "rounded border my-4 px-5 py-4",
        isError
          ? "border-accent bg-accent/5"
          : isDone
            ? "border-rule bg-paper"
            : "border-accent/50 bg-accent/[0.03]",
      ].join(" ")}
    >
      <header className="flex items-baseline justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted">
            {isError
              ? "Extraction failed"
              : isDone
                ? "Extraction complete"
                : "Extracting from PDF"}
          </p>
          <p className="font-mono text-sm text-ink truncate">
            {progress.filename}
          </p>
        </div>
        {(isDone || isError) && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-muted hover:text-ink text-lg leading-none"
            aria-label="Dismiss progress"
          >
            ×
          </button>
        )}
      </header>

      {isError ? (
        <p className="text-sm text-accent">
          {progress.errorMessage ?? "Unknown error."}
        </p>
      ) : (
        <Stepper progress={progress} />
      )}

      {progress.step === "extracting" && progress.preview && progress.preview.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-muted hover:text-ink">
            Preview of incoming CSV
          </summary>
          <pre className="mt-2 max-h-32 overflow-auto rounded border border-rule bg-ink/[0.02] p-2 font-mono text-[11px] text-ink/80 whitespace-pre-wrap break-words">
            {progress.preview.join("\n")}
          </pre>
        </details>
      )}
    </div>
  );
}

function Stepper({ progress }: { progress: ExtractionProgress }) {
  const elapsedSec = useMemo(() => {
    if (!progress.startedAt) return 0;
    const end = progress.completedAt ?? Date.now();
    return Math.max(0, (end - progress.startedAt) / 1000);
  }, [progress.startedAt, progress.completedAt, progress.step]);

  const stepStatus = (id: ExtractionStep): "done" | "active" | "pending" => {
    if (progress.step === "error") {
      // Errors freeze the stepper at the failing step.
      return "pending";
    }
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
    <ol className="space-y-2 text-sm">
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
          progress.step === "awaiting-consent" ? "active" : stepStatus("extracting")
        }
        label={
          progress.step === "awaiting-consent"
            ? "Awaiting your consent"
            : "Extract transactions via LLM"
        }
        detail={
          progress.step === "extracting"
            ? `${(progress.charsReceived ?? 0).toLocaleString()} characters received · ${progress.transactionsStreamed ?? 0} transaction${progress.transactionsStreamed === 1 ? "" : "s"} parsed so far`
            : progress.step === "awaiting-consent"
              ? "Click 'Send and extract' in the modal."
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
