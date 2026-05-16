/* src/components/SiteFooter.tsx — consistent footer across every page.
 *
 * Three things on every page: licence reminder, "not financial advice"
 * disclaimer, and links to GitHub / About / Privacy. Centralised here so
 * any change (e.g. licence update) lands in one file. */

import Link from "next/link";

const REPO_URL = "https://github.com/ainikaventures/zimple_tax_accounts";

interface SiteFooterProps {
  /** Width of the inner container — match the page it lives on. */
  maxWidthClass?: string;
}

export function SiteFooter({
  maxWidthClass = "max-w-4xl",
}: SiteFooterProps) {
  return (
    <footer className="px-6 sm:px-12 pb-8">
      <div
        className={`${maxWidthClass} mx-auto border-t border-rule pt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-muted`}
      >
        <span>Free for personal use · Commercial licence required</span>
        <span aria-hidden>·</span>
        <span>Not regulated financial advice</span>
        <span className="ml-auto flex items-center gap-4">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-accent underline-offset-4 hover:underline"
          >
            GitHub
          </a>
          <Link
            href="/about"
            className="hover:text-accent underline-offset-4 hover:underline"
          >
            About
          </Link>
          <Link
            href="/privacy"
            className="hover:text-accent underline-offset-4 hover:underline"
          >
            Privacy
          </Link>
        </span>
      </div>
    </footer>
  );
}
