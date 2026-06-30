# Snapshot Calculator Waitlist

The calculator posts email signups to `/api/waitlist`. The Worker forwards each signup to a Google Apps Script web app URL stored in the `WAITLIST_WEBHOOK_URL` Worker secret.

## Google Sheet setup

1. Create or open the Google Sheet where you want waitlist emails.
2. Open **Extensions → Apps Script**.
3. Paste `snapshot-calculator/waitlist-appscript.js`.
4. Deploy as a **Web app**.
5. Set **Execute as** to yourself and **Who has access** to anyone with the link.
6. Copy the Web app URL.

## Worker secret

Set the URL as a Cloudflare Worker secret:

```bash
npx wrangler secret put WAITLIST_WEBHOOK_URL --config wrangler.snapshot-calculator.json
```

Then redeploy the calculator Worker.
