/* app/page.tsx — placeholder homepage for early-sprint development.
 *
 * Establishes the editorial design language (serif display headline, off-white
 * paper background, restrained burgundy accent, hairline rule) so the toolchain
 * and typography can be verified end-to-end. Replaced by real entry points
 * (upload, calculate) in later sprints. */

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 sm:px-12 pt-10">
        <p className="font-sans text-[11px] uppercase tracking-[0.18em] text-muted">
          Open source · UK personal income tax
        </p>
      </header>

      <section className="flex-1 flex flex-col justify-center max-w-3xl mx-auto px-6 sm:px-12 py-16">
        <h1 className="font-serif font-semibold text-5xl sm:text-6xl md:text-7xl leading-[1.05] tracking-tight">
          UK Tax Advisor
        </h1>
        <p className="mt-6 font-serif text-xl sm:text-2xl text-ink/80 leading-snug max-w-2xl">
          A clear-eyed tool for understanding your UK personal income tax —
          calculation, savings suggestions, and an assistant that knows the
          rules.
        </p>
        <p className="mt-4 text-base text-muted max-w-2xl">
          Coming soon. The repository is under active construction; features
          land progressively per the sprint plan.
        </p>
        <div className="mt-10 flex items-center gap-3">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-accent"
            aria-hidden
          />
          <span className="font-sans uppercase tracking-[0.16em] text-[11px] text-accent">
            Status: under construction
          </span>
        </div>
      </section>

      <footer className="px-6 sm:px-12 pb-8">
        <div className="max-w-3xl mx-auto border-t border-rule pt-6 flex flex-col sm:flex-row gap-2 sm:gap-6 text-[12px] text-muted">
          <span>Open source · AGPL 3.0</span>
          <span aria-hidden className="hidden sm:inline">
            ·
          </span>
          <span>
            Not regulated financial advice. Verify with HMRC or a chartered tax
            adviser before filing.
          </span>
        </div>
      </footer>
    </main>
  );
}
