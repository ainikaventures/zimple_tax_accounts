/* app/layout.tsx — root layout for the uk-tax-advisor app.
 *
 * Loads the editorial typography (Source Serif 4 for display, IBM Plex Sans for
 * body) via next/font/google as CSS variables, so Tailwind's font-serif and
 * font-sans utilities resolve correctly through the tokens declared in
 * globals.css. Sets global page metadata. Pages render inside <main>. */

import type { Metadata } from "next";
import { Source_Serif_4, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const serifDisplay = Source_Serif_4({
  variable: "--font-serif-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const sansBody = IBM_Plex_Sans({
  variable: "--font-sans-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "UK Tax Advisor",
  description:
    "Open-source UK personal income tax calculator, suggestions, and AI assistant. Not regulated financial advice.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${serifDisplay.variable} ${sansBody.variable} bg-paper text-ink font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
