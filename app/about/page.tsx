/* app/about/page.tsx — public "about" page.
 *
 * Linked from the footer on every page. Repeats the project description,
 * the disclaimer, and a privacy summary, so anyone who clicks "About"
 * gets the full picture without having to read the README. */

import Link from "next/link";

import { SiteFooter } from "@/src/components/SiteFooter";

export const metadata = {
  title: "About — UK Tax Advisor",
  description:
    "What this tool does, what it does not do, and why your data stays in your browser.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <div className="bg-ink text-paper">
        <p className="max-w-3xl mx-auto px-6 sm:px-12 py-3 text-xs sm:text-sm text-paper/90">
          Your bank statements stay in your browser. They are never uploaded
          to any server.
        </p>
      </div>

      <article className="flex-1 max-w-3xl mx-auto w-full px-6 sm:px-12 py-12">
        <header className="mb-10">
          <p className="font-sans text-[11px] uppercase tracking-[0.18em] text-muted mb-3">
            About
          </p>
          <h1 className="font-serif font-semibold text-4xl sm:text-5xl tracking-tight leading-[1.05]">
            What this is, and what it isn&apos;t
          </h1>
        </header>

        <Section title="What it is">
          <p>
            UK Tax Advisor is a small, source-available tool that takes your
            UK bank-statement CSVs, classifies the transactions, and computes
            your personal income tax position for the 2025/26 and 2026/27 tax
            years. It also surfaces a ranked list of tax-saving suggestions
            and, optionally, a built-in AI assistant grounded in your actual
            figures and the published HMRC and gov.scot rules.
          </p>
          <p>
            Every figure shown comes from{" "}
            <Link
              href="https://github.com/ainikaventures/zimple_tax_accounts/blob/main/src/lib/taxRules.ts"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline underline-offset-4"
            >
              one canonical rules module
            </Link>{" "}
            with citations to House of Commons Library briefings (CBP-10237
            for 2025/26, CBP-10618 for 2026/27) and the Scottish Government
            tax-bands page.
          </p>
        </Section>

        <Section title="What it isn't">
          <p>
            <strong>It is not regulated financial advice.</strong> No
            chartered tax adviser, accountant, or financial planner has
            reviewed your specific situation. The numbers it produces are
            estimates based on the inputs you provide and the published
            rules; they may be wrong for your specific circumstances, and
            edge cases (very high income, complex residency, share schemes,
            IR35 contracting, non-UK income) are intentionally out of scope.
          </p>
          <p>
            <strong>You remain responsible for your own tax filings.</strong>{" "}
            Always verify any figure against your original payslips, P60,
            dividend vouchers, charity receipts, and pension statements
            before submitting anything to HMRC.
          </p>
        </Section>

        <Section title="Privacy in a paragraph">
          <p>
            Bank statements are parsed entirely in your browser. The
            calculation runs in your browser. Tax-saving suggestions are
            generated in your browser. The only network calls that might
            include any of your data are to whichever AI provider you
            configure for the chat (defaults to local Ollama on your own
            machine — zero network exposure). Even those calls are routed
            directly from your browser to the provider; the server hosting
            this app is never in the loop.{" "}
            <Link
              href="/privacy"
              className="text-accent underline underline-offset-4"
            >
              Read the full privacy notice →
            </Link>
          </p>
        </Section>

        <Section title="Licence">
          <p>
            Source-available under the{" "}
            <Link
              href="https://github.com/ainikaventures/zimple_tax_accounts/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline underline-offset-4"
            >
              PolyForm Noncommercial Licence 1.0.0
            </Link>
            . Free for personal use, hobby use, charitable use, and any other
            noncommercial purpose. Commercial use — including any hosted or
            paid offering of the software, or use by an accountancy practice
            for client work — requires a separate commercial licence from
            the copyright holder. See the LICENSE file for the formal terms
            and the Required Notice block for contact details.
          </p>
        </Section>

        <Section title="Get involved">
          <p>
            The project is on GitHub at{" "}
            <Link
              href="https://github.com/ainikaventures/zimple_tax_accounts"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline underline-offset-4"
            >
              ainikaventures/zimple_tax_accounts
            </Link>
            . Issues, pull requests, and bank-format contributions are all
            welcome — see{" "}
            <Link
              href="https://github.com/ainikaventures/zimple_tax_accounts/blob/main/CONTRIBUTING.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline underline-offset-4"
            >
              CONTRIBUTING.md
            </Link>{" "}
            for the playbook.
          </p>
        </Section>
      </article>

      <SiteFooter maxWidthClass="max-w-3xl" />
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="font-serif text-2xl text-ink mb-3 tracking-tight">
        {title}
      </h2>
      <div className="space-y-3 text-ink/85 leading-relaxed">{children}</div>
    </section>
  );
}
