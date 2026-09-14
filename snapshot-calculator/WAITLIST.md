# Snapshot Calculator: Retired Waitlist

The full AfterTax US app is free and live. The calculator no longer collects email addresses or calls `/api/waitlist`.

The replacement section links directly to:

- Full app: https://aftertaxus.com/app/
- Free account creation: https://aftertaxus.com/app/?auth=create

A free account is required to save portfolios and scenarios; this is not a paid upgrade. CTA destinations are fixed, do not include calculator inputs, and suppress the referrer. Existing user-requested share/embed links are separate and still include calculator inputs.

## Ownership and legacy infrastructure

Presentation and copy live in `src/FullAppUpgrade.tsx`, with scoped styles in `src/styles.css`. Search/share metadata and the visible initial-HTML fallback live in `index.html`; React replaces the fallback on startup. Discovery files live in `public/`. Isolated marketing regressions live in `../tests/snapshot-marketing.test.ts`.

`worker.ts` and `waitlist-appscript.js` are unchanged legacy infrastructure. The frontend no longer uses them for signups. Any endpoint retirement or secret cleanup belongs to the backend owner and is outside this marketing change; no new waitlist setup is needed.
