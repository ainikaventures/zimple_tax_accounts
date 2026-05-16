/* src/components/SuggestionCard.tsx — one suggestion in the "Ways to reduce
 * your tax" list.
 *
 * Each card carries title + estimated-saving badge + collapsible "why" +
 * concrete action + caveats. Some suggestions have an Apply button that
 * mutates the form inputs to simulate the change; the parent decides
 * which suggestions are applicable and wires up onApply. */

"use client";

import { gbp } from "@/src/lib/format";
import type { Suggestion } from "@/src/lib/suggestions";

interface SuggestionCardProps {
  suggestion: Suggestion;
  /** Set when the user has clicked Apply for this suggestion. */
  isActive?: boolean;
  /** Provide to render an "Apply" button; omit for informational cards. */
  onApply?: () => void;
  /** Custom apply-button label; falls back to "Apply this →". */
  applyLabel?: string;
}

export function SuggestionCard({
  suggestion,
  isActive,
  onApply,
  applyLabel,
}: SuggestionCardProps) {
  const hasSaving = suggestion.estimatedSaving > 0;

  return (
    <article
      className={[
        "rounded border bg-paper transition-colors",
        isActive
          ? "border-accent ring-1 ring-accent/40"
          : "border-rule hover:border-ink/30",
      ].join(" ")}
    >
      <div className="px-5 py-4 flex flex-wrap items-start gap-x-4 gap-y-2 justify-between border-b border-rule">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted">
            {suggestion.category}
          </p>
          <h3 className="mt-1 font-serif text-xl text-ink leading-snug">
            {suggestion.title}
          </h3>
        </div>
        <div className="text-right">
          {hasSaving ? (
            <>
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted">
                Est. annual saving
              </p>
              <p className="font-serif text-2xl text-accent font-semibold tabular-nums">
                {gbp(suggestion.estimatedSaving)}
              </p>
            </>
          ) : (
            <span className="inline-block text-[11px] uppercase tracking-[0.14em] text-muted border border-rule rounded px-2 py-0.5">
              Informational
            </span>
          )}
        </div>
      </div>

      <details className="group">
        <summary
          className="cursor-pointer list-none px-5 py-3 text-sm text-ink/80 hover:bg-ink/[0.02] flex items-center gap-2 border-b border-rule"
          aria-label="Toggle why this applies"
        >
          <span
            className="inline-block text-muted transition-transform group-open:rotate-90"
            aria-hidden
          >
            ›
          </span>
          <span>Why this applies to you</span>
        </summary>
        <div className="px-5 py-4 text-sm text-ink/85 leading-relaxed border-b border-rule">
          {suggestion.why}
        </div>
      </details>

      <div className="px-5 py-4 border-b border-rule">
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted mb-1">
          What to do
        </p>
        <p className="text-sm text-ink leading-relaxed">{suggestion.action}</p>
      </div>

      {suggestion.caveats.length > 0 && (
        <ul className="px-5 py-3 space-y-1 text-xs text-muted">
          {suggestion.caveats.map((c, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden>·</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      )}

      {onApply && (
        <div className="px-5 py-3 border-t border-rule bg-ink/[0.02] flex items-center justify-between gap-3">
          <p className="text-xs text-muted">
            {isActive
              ? "This simulation is active. Revert from the banner above."
              : "Apply to simulate the result; revert any time."}
          </p>
          <button
            type="button"
            onClick={onApply}
            disabled={isActive}
            className={[
              "inline-flex items-center gap-1.5 rounded-sm px-4 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-rule text-muted cursor-not-allowed"
                : "bg-accent text-paper hover:bg-accent-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
            ].join(" ")}
          >
            {isActive ? "Applied" : applyLabel ?? "Apply this →"}
          </button>
        </div>
      )}
    </article>
  );
}
