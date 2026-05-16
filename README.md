# uk-tax-advisor

Source-available UK personal income tax web app. Drop your bank statements
in, get a tax position you can verify line by line, see ranked tax-saving
suggestions, ask an AI assistant grounded in the actual rules, and download
filing-ready Excel.

Everything runs in your browser. Bank statements never leave the device.

```
┌────────────┐    ┌─────────────┐    ┌────────────┐    ┌────────────┐
│  Upload    │──▶ │  Calculate  │──▶ │ Suggest    │──▶ │  Export    │
│  CSVs      │    │  Tax        │    │ + Chat     │    │  XLSX/JSON │
└────────────┘    └─────────────┘    └────────────┘    └────────────┘
       │                 │                 │                 │
       └─── all in your browser; no server round-trip ───────┘
```

## Features

- **Bank statement parser** — auto-detects Monzo, Starling, Lloyds-style
  (separate debit/credit columns) and a generic single-amount-column
  fallback that covers HSBC, NatWest, Barclays, Revolut, and Tide. CSV
  parser handles quoted commas, escaped quotes, and CRLF.
- **Transaction classifier** — first-match-wins regex rules tag rows as
  salary, savings interest, dividend, pension contribution, charity
  donation, rental income, self-employment, ISA deposit, transfer, expense,
  or unknown. Low-confidence high-value rows surface in a "needs review"
  banner.
- **Tax calculator** — UK personal income tax for tax years 2025/26 and
  2026/27, England-Wales-NI and Scotland bands. Implements the HMRC slice
  order (earned → savings → dividends), personal-allowance taper, band
  extension from pension and Gift Aid contributions, dividend allowance
  band-space accounting, personal savings allowance, starting rate for
  savings, marriage allowance, blind person's allowance, and NI Class 1.
  146 regression assertions across five test files.
- **Suggestions engine** — seven prioritised optimisations including
  personal-allowance recovery via pension (the £100k–£125k "60% trap"),
  full higher-rate pension relief, ISA shelter, Marriage Allowance
  transfer, Gift Aid higher-rate top-up, CGT annual exempt amount, and the
  £1,000 trading/property allowances. Apply any suggestion to simulate
  the result instantly; revert from a banner.
- **AI tax assistant** — pluggable provider. Defaults to local **Ollama**
  (free, runs on your machine, no API key needed). Also supports Anthropic
  Claude, OpenAI, Google Gemini, and Groq via bring-your-own-key. Keys
  live in your browser; chat traffic goes browser-direct to your chosen
  provider. The system prompt injects your actual tax figures and a
  curated rules block so the assistant doesn't hallucinate numbers.
- **Filing-ready export** — five-sheet Excel workbook (Summary / Band
  Breakdown / Transactions / SA100 Helper / Suggestions) plus a JSON dump.
  SA100 helper sheet keys your inferred figures to HMRC self-assessment
  box numbers with a prominent verify-against-source notice.
- **Editorial design** — Source Serif 4 display, IBM Plex Sans body,
  hairline rules, burgundy accent only on actionable elements.

## Quick start

Requires Node 20+.

```bash
git clone https://github.com/ainikaventures/zimple_tax_accounts.git
cd zimple_tax_accounts
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll see the
homepage; follow **Upload your statements →** to begin.

### Optional: enable the AI assistant

The chat works **out of the box** if you have Ollama installed locally —
no API key, no cost.

```bash
# macOS
brew install ollama
ollama pull llama3.1:8b
OLLAMA_ORIGINS="http://localhost:3000" ollama serve
```

The `OLLAMA_ORIGINS` env tells Ollama to accept browser fetches from your
dev server. Open the chat panel on `/calculate`, leave the provider on
**Ollama (local, free)**, and start chatting.

Prefer a hosted model? Open the chat panel, click ⚙ (Settings), pick a
provider (Claude / OpenAI / Gemini / Groq), and paste your API key. Keys
are stored in your browser's localStorage and are never sent to our
server.

## Scripts

```bash
npm run dev        # Next.js dev server
npm run build      # production build
npm run start      # serve the production build
npm run typecheck  # tsc --noEmit
npm run test       # run every tests/*.test.ts file via tsx
npm run lint       # eslint
```

## Privacy

- Bank statements are parsed entirely in your browser; the CSVs never
  leave your device.
- Tax calculation runs in your browser.
- The agent chat defaults to local Ollama (no network). If you switch to
  a cloud LLM provider, your browser calls that provider's API directly
  with the API key you have personally pasted in — the server hosting
  this app is never in the loop for chat traffic.
- The Excel export POSTs your assembled export data to `/api/export` on
  the local server, which builds the XLSX via SheetJS and streams it
  back. The data isn't logged or persisted.
- localStorage keys: `uk-tax-advisor:statements`, `uk-tax-advisor:inputs`,
  `uk-tax-advisor:agent`. Clear via your browser's site-data settings, or
  via in-app "Clear all" / "Forget all keys" buttons.

Full privacy notice in [`docs/PRIVACY.md`](./docs/PRIVACY.md) and on the
[`/privacy`](./app/privacy/page.tsx) page in the running app.

## Configuration

Copy `.env.local.example` to `.env.local` if you want to override any of
the optional settings:

| Variable             | Purpose                                                        |
| -------------------- | -------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`  | Server-side Claude key. Only used as fallback when the user has not configured a provider in the chat settings. Almost always unnecessary — the BYOK flow handles every cloud provider. |
| `AGENT_PROVIDER`     | `claude` or `ollama`. Only consumed by the server fallback path. |

There is no `OPENAI_API_KEY` / `GROQ_API_KEY` etc. on the server side by
design: every cloud provider is BYOK from the browser.

## Documentation

- [`docs/TAX_RULES.md`](./docs/TAX_RULES.md) — every rule encoded in
  `src/lib/taxRules.ts`, with sources. Updated annually alongside the
  rules module.
- [`docs/CALCULATION_GUIDE.md`](./docs/CALCULATION_GUIDE.md) — how the
  calculator works: slice ordering, allowance allocation, dividend
  allowance band-space behaviour, band extension, the 60% trap.
- [`docs/PRIVACY.md`](./docs/PRIVACY.md) — full privacy notice.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — adding a new bank's CSV
  format, updating tax rules for a new tax year, test requirements.
- [`info/PROJECT_BRIEF.md`](./info/PROJECT_BRIEF.md) — the original
  sprint plan this codebase was built against, kept for historical
  reference.

## Disclaimer

This is **not regulated financial advice**. The numbers it produces are
estimates based on the inputs you provide and the published HMRC and
gov.scot rules; they may be wrong for your specific circumstances, and
edge cases (very high income, complex residency, share schemes, IR35
contracting, non-UK income) are intentionally out of scope. You remain
responsible for your own tax filings — always verify any figure against
your original payslips, P60, dividend vouchers, charity receipts, and
pension statements before submitting anything to HMRC.

## Licence

[**PolyForm Noncommercial Licence 1.0.0**](./LICENSE).

- **Free** for personal use, hobby use, research, education, charities,
  public-research and government institutions, and any other noncommercial
  purpose.
- **A separate commercial licence is required** for any commercial use,
  including hosted/SaaS deployments, paid services built on top of the
  software, accountancy-practice use, or anything else with anticipated
  commercial application.

For commercial-licensing enquiries, contact the address in the LICENSE
file's Required Notice block, or open an issue at the repository.
