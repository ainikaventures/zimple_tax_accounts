/* app/privacy/page.tsx — public privacy notice.
 *
 * Mirrors the long-form prose in docs/PRIVACY.md but is reachable from
 * the footer of every page. If you change the data-flow story, change
 * BOTH files. */

import Link from "next/link";

import { SiteFooter } from "@/src/components/SiteFooter";

export const metadata = {
  title: "Privacy — UK Tax Advisor",
  description:
    "What data this tool handles, what stays on your device, and what (if anything) leaves it.",
};

export default function PrivacyPage() {
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
            Privacy
          </p>
          <h1 className="font-serif font-semibold text-4xl sm:text-5xl tracking-tight leading-[1.05]">
            What we do — and do not — see
          </h1>
          <p className="mt-4 font-serif text-lg text-ink/80 max-w-2xl">
            UK Tax Advisor is engineered so that your personal financial data
            never leaves your device. This page explains exactly what runs
            where.
          </p>
        </header>

        <Section title="One-paragraph summary">
          <p>
            CSV statements are parsed in your browser. Calculation runs in
            your browser. Suggestions are generated in your browser. The
            chat assistant, by default, runs on your own machine via Ollama
            — also no network. PDF statements (added in v1.1) are extracted
            in your browser via PDF.js and then sent to your active AI
            provider for transaction extraction; if you stay on the default
            local Ollama, that step is also local. If you opt into a cloud
            LLM provider (Claude / OpenAI / Gemini / Groq) for either the
            chat or PDF extraction, your browser calls that provider
            directly with the API key you have personally pasted in; the
            server hosting this app is never involved.
          </p>
        </Section>

        <Section title="Bank statements — CSV">
          <p>
            CSV files you drop into the upload page are read using the
            browser&apos;s native File API. The parser, classifier, and
            income-inference logic all run inside your browser tab. None of
            the raw rows ever leave the device.
          </p>
          <p>
            Parsed transactions are persisted to your browser&apos;s
            localStorage under the key{" "}
            <code className="font-mono text-sm bg-ink/[0.04] px-1.5 py-0.5 rounded">
              uk-tax-advisor:statements
            </code>{" "}
            so a page reload doesn&apos;t lose your work. You can clear this
            at any time by clicking <em>Clear all</em> on the upload page
            or by clearing your browser&apos;s site data for this domain.
          </p>
        </Section>

        <Section title="Bank statements — PDF">
          <p>
            PDF statements are dropped onto the same upload page. Step one
            is in your browser: PDF.js extracts the text layer. Step two
            sends that text to your active AI provider with a prompt that
            asks it to emit a CSV. The returned CSV is then parsed by the
            same browser-side parser used for CSV uploads, and the
            classified transactions land in the same{" "}
            <code className="font-mono text-sm bg-ink/[0.04] px-1.5 py-0.5 rounded">
              uk-tax-advisor:statements
            </code>{" "}
            localStorage entry.
          </p>
          <p>
            <strong>Where the PDF text goes depends on your active
            provider.</strong> If it is the default <em>Ollama (local)</em>,
            the text travels to a process running on your own machine —
            still no network exposure. If it is a cloud provider
            (Claude / OpenAI / Gemini / Groq), the PDF text travels from
            your browser to that provider&apos;s servers, exactly the same
            shape as a chat message. A consent modal in the upload flow
            tells you which provider is about to receive the text and lets
            you cancel or pick a different provider.
          </p>
          <p>
            Scanned PDFs without an extractable text layer are not yet
            supported — the upload flow tells you so and stops; no OCR is
            performed locally or remotely.
          </p>
        </Section>

        <Section title="Tax calculation">
          <p>
            The income-tax engine runs entirely in the browser. It reads
            your inputs (combined with any inferred figures from the upload
            flow), produces a TaxResult including band-by-band breakdown,
            and persists the form inputs to{" "}
            <code className="font-mono text-sm bg-ink/[0.04] px-1.5 py-0.5 rounded">
              uk-tax-advisor:inputs
            </code>{" "}
            in localStorage. Same deal: you can wipe it whenever you want.
          </p>
        </Section>

        <Section title="AI chat assistant">
          <p>
            The chat panel is bring-your-own-key. You choose a provider in
            the settings modal, paste your own API key, and your browser
            calls that provider&apos;s API directly. The keys, your selected
            provider, and your selected model live in localStorage under{" "}
            <code className="font-mono text-sm bg-ink/[0.04] px-1.5 py-0.5 rounded">
              uk-tax-advisor:agent
            </code>
            . The server hosting this app does not see your chat traffic or
            your keys.
          </p>
          <p>
            The default provider is <strong>Ollama running on your own
            machine</strong> — that means even the chat itself is fully
            local with no third-party involvement. If you switch to
            Anthropic, OpenAI, Google Gemini, or Groq, those providers will
            see your chat messages (which include your computed tax figures
            so the AI can answer questions about them), under their own
            privacy policies, not ours.
          </p>
          <p>
            <strong>Caveat:</strong> API keys in localStorage are visible to
            any JavaScript running on this origin. A cross-site-scripting bug
            in this app could expose them. For a personal noncommercial tool
            this is acceptable with proper warning; we surface that warning
            in the agent settings modal too. If you have a heightened threat
            model, prefer Ollama (no keys) or rotate cloud-provider keys
            regularly.
          </p>
        </Section>

        <Section title="Exports">
          <p>
            Downloading JSON happens entirely client-side: the file is
            assembled in your browser via a Blob URL and saved to your
            disk. Nothing leaves the device.
          </p>
          <p>
            Downloading Excel POSTs your assembled export payload to a
            local <code className="font-mono text-sm bg-ink/[0.04] px-1.5 py-0.5 rounded">/api/export</code>{" "}
            route on the server running this app. The server uses SheetJS
            to construct the workbook and streams it back as the response
            body; the payload is held in memory for the duration of the
            request and is not logged, persisted, or forwarded anywhere.
            If you self-host, this is your own server; if you use a hosted
            deployment, this is the deployment&apos;s server.
          </p>
        </Section>

        <Section title="What we never see (when self-hosting)">
          <ul className="list-disc list-outside ml-5 space-y-1">
            <li>Bank statement CSV contents</li>
            <li>Transaction descriptions, dates, amounts, or balances</li>
            <li>Your inferred income figures or manual overrides</li>
            <li>Your tax position, marginal rate, or take-home</li>
            <li>Any chat messages you send to the AI assistant</li>
            <li>Your AI-provider API keys</li>
          </ul>
        </Section>

        <Section title="What the operator sees (hosted deployments)">
          <p>
            If you&apos;re using a hosted deployment rather than running the
            code yourself, the operator&apos;s web server sees ordinary HTTP
            request metadata (IP address, user-agent, the fact that you
            visited a page or hit the Excel-export endpoint), and the
            contents of any Excel-export POST while it is being processed.
            They do <em>not</em> see your bank-statement contents (those
            are never POSTed) or your AI chat (that goes browser-direct).
          </p>
          <p>
            Operators can choose to configure cookies, analytics, or logging
            — this is up to whoever runs the deployment, not the source code
            itself. The reference deployment ships with none of these.
          </p>
        </Section>

        <Section title="Clearing your data">
          <p>
            All persistent data lives in your browser&apos;s localStorage.
            To wipe everything for this app:
          </p>
          <ol className="list-decimal list-outside ml-5 space-y-1">
            <li>Open your browser&apos;s site-settings for this domain.</li>
            <li>Choose <em>Clear site data</em> (or equivalent).</li>
          </ol>
          <p>
            Or, per area, the upload page&apos;s <em>Clear all</em> button
            wipes statements, and the agent settings modal&apos;s{" "}
            <em>Forget all keys on this device</em> button wipes API keys.
          </p>
        </Section>

        <Section title="Reporting an issue">
          <p>
            If you find a bug or a behavior that surprises you, please file
            an issue at{" "}
            <Link
              href="https://github.com/ainikaventures/zimple_tax_accounts/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline underline-offset-4"
            >
              github.com/ainikaventures/zimple_tax_accounts/issues
            </Link>
            . Privacy-sensitive issues can also be reported privately to the
            email address in the{" "}
            <Link
              href="https://github.com/ainikaventures/zimple_tax_accounts/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline underline-offset-4"
            >
              LICENSE
            </Link>{" "}
            file&apos;s Required Notice block.
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
