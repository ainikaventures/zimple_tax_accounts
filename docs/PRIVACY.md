# Privacy notice — `uk-tax-advisor`

The full version of the privacy story. The
[`/privacy`](../app/privacy/page.tsx) page in the running app shows the
same content; this file is the source of truth for changes.

## One-paragraph summary

Bank statements are parsed entirely in your browser. The income-tax
calculation runs in your browser. Suggestions are generated in your
browser. The chat assistant, by default, runs on your own machine via
Ollama — also no network. If you switch to a cloud LLM provider, your
browser calls that provider's API directly with the API key you have
personally pasted in. The server hosting this app is never in the
loop for the chat, and only ever sees your data when you click
*Download Excel* (which POSTs your assembled export payload to a local
API route that builds the XLSX and streams it back).

## Where data lives

| Data                              | Where it lives             | Persisted?                         |
| --------------------------------- | -------------------------- | ---------------------------------- |
| Raw CSV bytes you drop in         | Browser memory only        | No                                 |
| Parsed transactions               | Browser localStorage       | Yes — key `uk-tax-advisor:statements` |
| Manual category overrides         | Browser localStorage       | Yes — same key                     |
| Income overrides set in /upload   | Browser localStorage       | Yes — same key                     |
| Calculate-page form inputs        | Browser localStorage       | Yes — key `uk-tax-advisor:inputs`  |
| Chat provider, model, API keys    | Browser localStorage       | Yes — key `uk-tax-advisor:agent`   |
| Computed tax position             | React component state only | No                                 |
| Chat messages                     | React component state only | No (cleared on refresh)            |

`localStorage` is a per-browser-per-origin store. Other websites
cannot read it; other browsers / devices / users on the same machine
also cannot read it. Clearing your browser's site data for this
origin wipes all three keys completely.

## Network traffic

The app never sends your statements over the network. The only paths
that involve a network request at all are:

1. **Static asset load** — the usual HTML/JS/CSS/font bundle served
   by Next.js when you first open the page. No user data attached.
2. **AI chat (when you use it)** — direct browser-to-provider fetch.
   The server hosting this app is **not** in this loop:
   - Local Ollama: browser → `http://localhost:11434` on your own
     machine. Stays on the local network interface.
   - Cloud providers (Claude / OpenAI / Gemini / Groq): browser →
     `https://api.<provider>.com/...`, with the API key *you* pasted
     in the settings modal in the `Authorization` header.
   - Each provider sees the chat messages (which include your
     computed tax figures, so the AI can answer questions about
     them) under their own privacy policy. They do **not** see your
     transactions or other localStorage data unless you put it in a
     message yourself.
3. **Excel export (when you click it)** — POSTs your assembled
   export payload (TaxResult, classified transactions, inferred
   incomes, suggestions) to `/api/export` on the local server. The
   route builds the XLSX with SheetJS and returns it in the response
   body. The payload is held in memory for the duration of the
   request and is not logged, persisted, or forwarded.

JSON exports are entirely client-side (Blob in the browser); they
involve no network request at all.

## What we (the operator) see, in different deployment models

### You're running it yourself (the default)

`npm run dev` or your own `npm run start` on your own machine: the
"operator" is you. You see whatever your browser dev tools show. No
external party is involved.

### You're using a hosted deployment

If you visit a shared instance hosted by someone else, that
operator's web server sees:

- Ordinary HTTP request metadata: your IP, user-agent, the fact that
  you visited each page, timing.
- The body of any Excel-export POST while it's being processed (for
  long enough to construct the workbook and stream it back).

The operator does **not** see:

- Your CSV bank-statement contents — those are never POSTed.
- Your AI chat messages — those go browser-to-provider directly.
- Your AI-provider API keys — those live only in your browser's
  localStorage.
- Your localStorage in general (statements, inputs, agent config) —
  that's per-browser and not transmitted.

Whether the operator adds cookies, analytics, or request logging is
their choice — the reference codebase ships with none of these.

## Cloud LLM providers — what they get

If you pick Claude, OpenAI, Gemini, or Groq in the chat settings,
that provider receives:

- The system prompt the app builds, which includes a JSON dump of
  your computed `TaxResult` (gross income, PA, taxable bands,
  marginal rate, breakdown, etc.) and the key rules block.
- The chat history (up to 8 most recent messages).
- Your most recent message.
- The API key you provided.

Treat this as "you are sending your tax position to <provider>" and
read their privacy policy if that matters to your threat model:

- Anthropic — <https://www.anthropic.com/legal/privacy>
- OpenAI — <https://openai.com/policies/privacy-policy/>
- Google (Gemini / AI Studio) — <https://policies.google.com/privacy>
- Groq — <https://groq.com/privacy-policy/>

If "send my data to a major US LLM provider" isn't acceptable, use
the **Ollama** default — everything stays on your machine.

## API keys

API keys for cloud providers live in `localStorage` under the
`uk-tax-advisor:agent` key. They are:

- Visible to any JavaScript running on this origin (so an XSS bug in
  this app could expose them — see the warning in the settings
  modal).
- Sent in the `Authorization` header on every chat request to the
  relevant provider.
- Never sent to the server hosting this app.
- Never logged.

The agent settings modal has a "Forget all keys on this device"
button that wipes them. For a heightened threat model, prefer the
Ollama default (no keys), and / or rotate cloud-provider keys
regularly.

## Clearing your data

All persistent data lives in `localStorage`. To wipe:

1. Open your browser's site-settings for this domain.
2. Click *Clear site data* (or equivalent).

Or, per area:

- Upload page → *Clear all* button → wipes `uk-tax-advisor:statements`.
- Calculate page → manually clear the form fields, or wipe
  `uk-tax-advisor:inputs` via site data.
- Agent settings modal → *Forget all keys on this device* button →
  wipes `uk-tax-advisor:agent`.

## Reporting a privacy issue

If you find a bug or a behaviour that surprises you, please file an
issue at
<https://github.com/ainikaventures/zimple_tax_accounts/issues>.

For privacy-sensitive reports, please use the contact address in the
LICENSE file's Required Notice block rather than a public issue.

## Changes to this notice

The version of this file in the GitHub repository is the source of
truth. Substantive changes (new data flows, new providers, new
network destinations) will be reflected in commit history. We do not
maintain an automated changelog for this page — `git log
docs/PRIVACY.md` shows the full history.
