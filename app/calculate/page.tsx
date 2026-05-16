/* app/calculate/page.tsx — placeholder while Sprint 8 is in flight.
 *
 * Sprint 7's upload flow links here once the user has set a salary; the
 * real calculation form, breakdown, and suggestions panel land in
 * Sprints 8–9. Until then this stub just acknowledges that we've received
 * the user and points them at the upload flow if they arrived directly. */

import Link from "next/link";

export default function CalculatePage() {
  return (
    <main className="min-h-screen flex flex-col">
      <div className="bg-ink text-paper">
        <p className="max-w-4xl mx-auto px-6 sm:px-12 py-3 text-xs sm:text-sm text-paper/90">
          Your bank statements stay in your browser. They are never uploaded
          to any server.
        </p>
      </div>
      <div className="flex-1 max-w-3xl mx-auto px-6 sm:px-12 py-16">
        <p className="font-sans text-[11px] uppercase tracking-[0.18em] text-muted mb-3">
          Step 2 of 3 · Calculate
        </p>
        <h1 className="font-serif font-semibold text-4xl sm:text-5xl tracking-tight leading-[1.05]">
          Calculation
        </h1>
        <p className="mt-4 font-serif text-lg text-ink/80 max-w-2xl">
          This page will show your full tax position — bands, allowances,
          marginal rate, take-home pay — and let you simulate pension and
          Gift Aid changes. Coming soon as Sprint 8 lands.
        </p>
        <p className="mt-8 text-sm">
          <Link
            href="/upload"
            className="text-accent underline underline-offset-4 hover:no-underline"
          >
            ← Back to upload
          </Link>
        </p>
      </div>
      <footer className="px-6 sm:px-12 pb-8">
        <div className="max-w-3xl mx-auto border-t border-rule pt-6 text-[12px] text-muted">
          Not regulated financial advice. Verify with HMRC or a chartered tax
          adviser before filing.
        </div>
      </footer>
    </main>
  );
}
