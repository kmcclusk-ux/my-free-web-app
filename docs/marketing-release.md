# Public marketing release

Published September 13, 2026: source commit `c1b09f1`; public Amplify job `54` succeeded; comparison Worker version `38aa7a3e-b74f-4493-ba39-a080eaf4c382`. Windows and Linux CI both pass with 538 tests. Live homepage assets match the release, and the portfolio bundle remains `index-L9cKKW84.js`.

Cloudflare prepends managed content signals and training-bot exclusions to the comparison subdomain's robots file. These were preserved. The appended application directives and sitemap remain present; Googlebot, OAI-SearchBot and Claude-SearchBot are not in those training-bot exclusions. A user-agent smoke request checks delivery, not a provider's actual indexing.

## Production surfaces

- Homepage and income estimator: https://aftertaxus.com/ and https://aftertaxus.com/calculator.html
- Two-investment comparison: https://calculator.aftertaxus.com/
- Full portfolio app: https://aftertaxus.com/app/
- Product scope: https://aftertaxus.com/how-it-works.html

The homepage is a static Amplify manual deployment (app `d2hr40bdxf8be1`, region `us-west-2`, branch `main`). It is not the separate Sites project or the legacy Git-connected Amplify app. A Git push alone does not publish the public homepage.

The comparison calculator is the Cloudflare Worker `aftertaxus-snapshot-calculator`, configured by `wrangler.snapshot-calculator.json`. Preserve existing vars/secrets when deploying.

## Marketing choices

- Two primary paths: no-login investment comparison and full free portfolio app.
- Remove placeholder video cards, redundant homepage calculators and obsolete waitlist copy.
- Preserve the existing standalone income estimator and its input handoff to the full app.
- Explain concrete full-app benefits: multiple accounts/income sources, what-ifs, baselines, named versions, exclusions and supported local/payroll settings.
- Publish useful static HTML and product facts, with the 2025 model and limitations visible.
- Use canonical URLs, accurate application structured data and a 1200×630 PNG sharing card. No fake search action, reviews, ratings or endorsements.
- Keep the homepage lightweight: no new framework, external font, tracker or calculation dependency.
- Single robots group preserves public crawling while excluding admin/API/MCP paths consistently. Robots is not authentication or an indexing-removal mechanism.

## Validation and safe publication

Run `npm run validate`. The release added 28 marketing/discovery regressions (538 tests total at validation), and checked responsive homepage layouts at 320, 390, 768 and 1280 viewport settings. The narrow calculator no longer overflows its results layout.

Do not zip the entire local `aftertaxus-aws-static` folder: it may contain stale portfolio app bundles or unrelated files. Use the current successful public Amplify deployment ZIP as the base and calculate its SHA-256.

`scripts/package-public-marketing.py` overlays only the files named in `scripts/public-marketing-files.json`, checks the verified base digest and confirms every other production asset is byte-identical. It never replaces `app/`, `app.js`, `styles.css` or `analytics.js`. Keep release artifacts under `tmp/`.

Example packaging command (replace the artifact and checksum with the current verified deployment):

```powershell
python scripts/package-public-marketing.py --base tmp/live-public.zip --base-sha256 VERIFIED_SHA256 --output tmp/marketing-release/public-release.zip
```

Upload that ZIP through Amplify's manual create-deployment/start-deployment flow. Keep signed upload/download URLs out of source control and logs. Retain the previous artifact for rollback.

For the comparison, build `snapshot-calculator`, then deploy using its existing Wrangler configuration and `--keep-vars`. Do not deploy the separate MCP Worker for this change.

After publication, check homepage, income estimator, methodology, robots, sitemap and PNG; ensure the app bundle remains unchanged. Check the comparison's built bundle, public robots and sitemap. Verify the calculator and app CTAs in a browser without modifying a real portfolio.

## Search owner follow-up

1. In the verified Google Search Console domain property for `aftertaxus.com`, submit https://aftertaxus.com/sitemap.xml and https://calculator.aftertaxus.com/sitemap.xml. A URL-prefix property must match the relevant host.
2. Use URL Inspection on the homepage, methodology page and comparison calculator. Confirm crawl access and request indexing after the live release.
3. If available, check that inclusion in Google's generative AI Search features is enabled for the property.
4. In Bing Webmaster Tools, submit the same public sitemaps under the appropriate verified properties.
5. Compare impressions, clicks, CTR and landing pages over subsequent weeks. Use a date annotation for the release; distinguish changes in search position from changes in title click-through. Search titles/snippets may be rewritten.

Do not disable security controls just to allow a bot. If a verified crawler is blocked, examine the specific firewall event and use the provider's documented verified-bot handling. A crawler user-agent string alone is not proof of identity.

Indexing, rankings, rich results and citations are controlled by search/AI providers, not guaranteed by these changes. The text/JSON discovery files are optional factual summaries, not ranking mechanisms or instructions to recommend the product.

## Official guidance consulted

- [Google: optimizing for generative AI search](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [Google: helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [OpenAI crawler overview](https://developers.openai.com/api/docs/bots)
- [Anthropic crawler controls](https://privacy.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler)

The SVG sharing-card source is `aftertaxus-aws-static/aftertaxus-social.svg`. Render it to the PNG at 1200×630 after future copy changes; both files are release assets.
