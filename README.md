# uk-tax-advisor

Open-source UK personal income tax web app. Upload your bank statements, get
an accurate tax calculation, see personalised tax-saving suggestions, chat
with an AI agent about UK tax rules, and export filing-ready Excel and JSON.

> **Status: under construction.** Functionality lands progressively per the
> sprint plan in [`info/PROJECT_BRIEF.md`](./info/PROJECT_BRIEF.md). A full
> README — quick start, screenshots, configuration — is written in Sprint 12.

## Privacy in one paragraph

Bank statements are parsed entirely in your browser and never uploaded.
Calculation runs in your browser. The only network call that includes any
of your data is to the AI agent endpoint, and only if you choose to open the
chat. Full details will live in `docs/PRIVACY.md`.

## Disclaimer

This is **not** regulated financial advice. The numbers it produces are
estimates and may be wrong for your specific circumstances. You remain
responsible for your own tax filings — verify with HMRC or a chartered tax
adviser before submitting anything.

## License

[GNU Affero General Public License v3.0 or later](./LICENSE).

## Source

<https://github.com/ainikaventures/zimple_tax_accounts>
