import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { FullAppUpgrade } from '../snapshot-calculator/src/FullAppUpgrade';
import worker from '../snapshot-calculator/worker';

const snapshotRequire = createRequire(new URL('../snapshot-calculator/package.json', import.meta.url));
const { createElement } = snapshotRequire('react');
const { renderToStaticMarkup } = snapshotRequire('react-dom/server');
const { parse } = snapshotRequire('postcss');
const readSnapshot = (path: string) => readFileSync(new URL(`../snapshot-calculator/${path}`, import.meta.url), 'utf8');
const html = readSnapshot('index.html');
const main = readSnapshot('src/main.tsx');
const upgradeSource = readSnapshot('src/FullAppUpgrade.tsx');
const markup = renderToStaticMarkup(createElement(FullAppUpgrade));
const plainText = (content: string) => content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const noscript = html.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? '';
const fallback = html.replace(/<noscript>[\s\S]*?<\/noscript>/g, '').match(/<div id="root">([\s\S]*?)<\/div>\s*<script/)?.[1] ?? '';
const appLinks = ['https://aftertaxus.com/app/', 'https://aftertaxus.com/app/?auth=create'];
const methodologyUrl = 'https://aftertaxus.com/how-it-works.html';

function attribute(tag: string, name: string) {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'))?.[1];
}

function meta(name: string) {
  const tags = [...html.matchAll(/<meta\b[^>]*>/g)].map(match => match[0]);
  return tags.filter(tag => attribute(tag, 'name') === name || attribute(tag, 'property') === name).map(tag => attribute(tag, 'content'));
}

describe('snapshot free full-app marketing', () => {
  it('renders a named, accessible upgrade section with the real free benefits', () => {
    const text = plainText(markup);
    expect(markup).toContain('aria-labelledby="full-app-title"');
    expect(markup).toContain('<h2 id="full-app-title">');
    expect(text).toContain('Two investments are the start. See your whole income picture.');
    expect(text).toContain('Free full app');
    expect(text).toContain('One multi-account portfolio');
    expect(text).toContain('Exclude an account from displayed after-tax income while keeping its income in tax calculations.');
    expect(text).toContain('Saved what-if scenarios + a baseline');
    expect(text).toContain('This quick calculator estimates federal and state taxes only. The full app adds supported local and W-2 payroll taxes.');
    expect(markup.match(/<li>/g)).toHaveLength(4);
  });

  it('explains free account saving without turning it into a paid upgrade', () => {
    expect(plainText(markup)).toContain('A free account is required to save your portfolio and scenarios. No paid upgrade.');
    expect(markup.match(/aria-describedby="full-app-save-note"/g)).toHaveLength(2);
    expect(markup).toContain('id="full-app-save-note"');
    expect(plainText(markup)).toContain('Open free full app');
    expect(plainText(markup)).toContain('Create free account');
    expect(plainText(markup)).not.toMatch(/waitlist|coming soon|limited.time|guaranteed|testimonial/i);
  });

  it.each([['interactive section', markup], ['initial HTML summary', fallback]])('keeps %s outbound links fixed and private', (_name, content) => {
    const links = [...content.matchAll(/<a\b[^>]*>/g)].map(match => match[0]);
    expect(links.map(link => attribute(link, 'href'))).toEqual(content === fallback ? [...appLinks, methodologyUrl] : appLinks);
    for (const link of links) {
      const destination = new URL(attribute(link, 'href')!);
      expect(destination.hash).toBe('');
      expect([...destination.searchParams.keys()].every(key => key === 'auth')).toBe(true);
      expect(attribute(link, 'rel')?.split(' ')).toContain('noreferrer');
      expect(attribute(link, 'referrerpolicy')).toBe('no-referrer');
    }
    expect(plainText(content)).toContain('These links do not transfer your calculator inputs.');
  });

  it('puts a private text CTA before calculator inputs and links methodology with the scope note', () => {
    const links = [...main.matchAll(/<a\b[^>]*>[^<]*<\/a>/g)].map(match => match[0]).filter(link => attribute(link, 'className') === 'snapshot-text-link');
    expect(links.map(link => attribute(link, 'href'))).toEqual([appLinks[0], methodologyUrl]);
    expect(plainText(links[0])).toBe('Open free portfolio app');
    expect(plainText(links[1])).toBe('How it works and methodology');
    expect(main.indexOf(links[0])).toBeLessThan(main.indexOf('<section className="shared-investment-panel">'));
    expect(main.indexOf(links[1])).toBeGreaterThan(main.indexOf('2025 planning estimate using the portfolio tax engine'));
    for (const link of links) {
      expect(attribute(link, 'rel')).toBe('noreferrer');
      expect(attribute(link, 'referrerpolicy')).toBe('no-referrer');
    }
  });

  it('removes email collection and keeps marketing independent of calculator state', () => {
    expect(main).not.toMatch(/waitlist|submitWaitlist|\/api\/waitlist/i);
    expect(markup).not.toMatch(/<(?:input|form|button)\b/);
    expect(upgradeSource).not.toMatch(/\b(?:fetch|window|document|navigator|localStorage|sessionStorage|useState|useEffect|onClick)\b/);
    expect(upgradeSource).toContain('function FullAppUpgrade()');
    expect(main).toMatch(/<FullAppUpgrade\s*\/>/);
  });

  it('keeps the upgrade out of the compact embed and retains calculation caveats', () => {
    expect(main).toMatch(/initialSettings\.isEmbedMode\s*\?\s*\(\s*<section className="embed-footer">[\s\S]*?\)\s*:\s*\(\s*<FullAppUpgrade\s*\/>/);
    expect(main).toContain('2025 planning estimate using the portfolio tax engine, not a tax return.');
    expect(main).toContain('Excludes local/payroll taxes, credits, AMT, automatic state eligibility adjustments');
    expect(main).toContain('Catalog yields are illustrative samples, not live quotes.');
    expect(main).toContain('Yields are samples or your entries, not current market data.');
    expect(main).toContain('Free snapshot calculator · 2025 estimate');
  });
});

describe('snapshot search and sharing metadata', () => {
  it('uses one query-free snapshot canonical and matching social metadata', () => {
    const canonical = [...html.matchAll(/<link\b[^>]*>/g)].map(match => match[0]).filter(tag => attribute(tag, 'rel') === 'canonical');
    expect(canonical).toHaveLength(1);
    expect(attribute(canonical[0], 'href')).toBe('https://calculator.aftertaxus.com/');
    expect(meta('og:url')).toEqual(['https://calculator.aftertaxus.com/']);
    expect(meta('robots')).toEqual(['index, follow']);
    const title = html.match(/<title>(.*?)<\/title>/)?.[1];
    expect(title).toBe('Free After-Tax Investment Calculator (2025) | AfterTax US');
    expect(meta('og:title')).toEqual([title]);
    expect(meta('twitter:title')).toEqual([title]);
    expect(meta('og:type')).toEqual(['website']);
    expect(meta('og:site_name')).toEqual(['AfterTax US']);
    expect(meta('twitter:card')).toEqual(['summary_large_image']);
    expect(meta('og:image')).toEqual(['https://aftertaxus.com/aftertaxus-social.png']);
    expect(meta('og:image:type')).toEqual(['image/png']);
    expect(meta('og:image:width')).toEqual(['1200']);
    expect(meta('og:image:height')).toEqual(['630']);
    expect(meta('og:image:alt')).toEqual(['AfterTax US — free after-tax income planning']);
    expect(meta('twitter:image')).toEqual(meta('og:image'));
    expect(meta('twitter:image:alt')).toEqual(meta('og:image:alt'));
    expect(meta('description')).toHaveLength(1);
    expect(meta('description')[0]).toMatch(/free 2025 estimates and sample yields/);
    expect(meta('og:description')).toEqual(meta('description'));
    expect(meta('twitter:description')).toEqual(meta('description'));
  });

  it('offers a substantive static summary without fake structured claims', () => {
    const summary = plainText(fallback);
    expect(summary).toContain('Free 2025 after-tax investment comparison');
    expect(plainText(noscript)).toContain('Enable JavaScript to enter your assumptions and calculate results.');
    expect(fallback).toContain('<main class="snapshot-app snapshot-summary">');
    expect(main).toContain('createRoot(document.getElementById("root")!).render(');
    expect(summary).toContain('Catalog yields are illustrative samples, not live market quotes.');
    expect(summary).toContain('Local/payroll taxes, credits, AMT, automatic state eligibility adjustments');
    expect(summary).toContain('A free account is required to save your portfolio and scenarios. No paid upgrade.');
    expect(fallback).not.toMatch(/hidden|aria-hidden|display:\s*none|<noscript/i);
    expect(`${html} ${markup}`).not.toMatch(/AggregateRating|ratingValue|reviewCount|SearchAction|limited.time|guaranteed/i);
  });
});

describe('snapshot subdomain discovery', () => {
  it('allows crawling and advertises only the query-free snapshot canonical', () => {
    const robots = readSnapshot('public/robots.txt');
    const sitemap = readSnapshot('public/sitemap.xml');
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).toMatch(/^Allow: \/$/m);
    expect(robots).toMatch(/^Disallow: \/api\/$/m);
    expect(robots).toMatch(/^Sitemap: https:\/\/calculator\.aftertaxus\.com\/sitemap\.xml$/m);
    expect(sitemap).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1])).toEqual(['https://calculator.aftertaxus.com/']);
    expect(sitemap).not.toContain('<lastmod>');
    for (const match of sitemap.matchAll(/<loc>(.*?)<\/loc>/g)) {
      expect(new URL(match[1]).search).toBe('');
    }
  });

  it.each([
    ['robots.txt', 'text/plain; charset=utf-8', 'GET'],
    ['robots.txt', 'text/plain; charset=utf-8', 'HEAD'],
    ['sitemap.xml', 'application/xml; charset=utf-8', 'GET'],
    ['sitemap.xml', 'application/xml; charset=utf-8', 'HEAD'],
  ])('passes %s %s %s through the unchanged worker asset binding', async (filename, contentType, method) => {
    const body = method === 'HEAD' ? null : readSnapshot(`public/${filename}`);
    const asset = new Response(body, { headers: { 'content-type': contentType, 'cache-control': 'public, max-age=60' } });
    const assetFetch = vi.fn().mockResolvedValue(asset);
    const request = new Request(`https://calculator.aftertaxus.com/${filename}`, { method });
    const response = await worker.fetch(request, { ASSETS: { fetch: assetFetch } });
    expect(assetFetch).toHaveBeenCalledExactlyOnceWith(request);
    expect(response).toBe(asset);
    expect(response.headers.get('content-type')).toBe(contentType);
    expect(response.headers.get('cache-control')).toBe('public, max-age=60');
    expect(await response.text()).toBe(body ?? '');
  });
});

describe('snapshot narrow-screen styles', () => {
  it('fixes intrinsic results widths only below 560px without shrinking desktop controls', () => {
    const stylesheet = parse(readSnapshot('src/styles.css'));
    const declarations = (selector: string, media?: string) => {
      const values: Record<string, string> = {};
      stylesheet.walkRules((rule: { selector: string; parent: { type: string; params?: string }; nodes: Array<{ prop?: string; value?: string }> }) => {
        const matchesScope = media ? rule.parent.type === 'atrule' && rule.parent.params === media : rule.parent.type === 'root';
        if (!matchesScope || !rule.selector.split(',').some(part => part.trim() === selector)) return;
        for (const declaration of rule.nodes) {
          if (declaration.prop && declaration.value) values[declaration.prop] = declaration.value;
        }
      });
      return values;
    };
    const narrow = '(max-width: 560px)';
    expect(declarations('.snapshot-app').width).toBe('min(1180px, calc(100% - 32px))');
    expect(declarations('.snapshot-app')['font-size']).toBe('75%');
    expect(declarations('.bar-row')['grid-template-columns']).toBe('minmax(150px, .28fr) minmax(0, 1fr) 96px');
    expect(declarations('.bar-track').height).toBe('26px');
    expect(declarations('body', narrow)['min-width']).toBe('0');
    expect(declarations('.results-main', narrow)['min-width']).toBe('0');
    expect(declarations('.bar-group', narrow)['min-width']).toBe('0');
    expect(declarations('.bar-row', narrow)['grid-template-columns']).toBe('repeat(2, minmax(0, 1fr))');
    expect(declarations('.bar-track', narrow)).toEqual({ 'grid-column': '1 / -1', 'grid-row': '2' });
    expect(declarations('.bar-row strong', narrow)['overflow-wrap']).toBe('anywhere');
    expect(declarations('.bar-name .difference-badge', narrow)['white-space']).toBe('normal');
  });
});
