import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const site = resolve(__dirname, '../aftertaxus-aws-static');
const read = (name: string) => readFileSync(resolve(site, name), 'utf8');
const home = read('index.html');
const calculator = read('calculator.html');
const methodology = read('how-it-works.html');
const metadata = (html: string, name: string) =>
  [...html.matchAll(/<meta\b[^>]*>/g)]
    .filter(match => match[0].includes(`name="${name}"`) || match[0].includes(`property="${name}"`))
    .map(match => match[0].match(/content="([^"]*)"/)?.[1]);
const links = (html: string) => [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => match[1]);
const graph = JSON.parse(home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1])['@graph'];

describe('public marketing pages', () => {
  it('puts simple calculator choices before an honest video placeholder gallery', () => {
    const tools = home.match(/<section[^>]*id="other-tools"[\s\S]*?<\/section>/)![0];
    const videos = home.match(/<section[^>]*id="videos"[\s\S]*?<\/section>/)![0];
    const cards = [...tools.matchAll(/<article class="other-tool-card[^>]*>[\s\S]*?<\/article>/g)].map(match => match[0]);
    expect(home.indexOf(tools)).toBeLessThan(home.indexOf(videos));
    expect(cards).toHaveLength(2);
    expect(links(cards[0])).toEqual(['/calculator.html']);
    expect(links(cards[1])).toEqual(['/app/']);
    expect(tools).toContain('Jump into another calculator.');
    expect(tools).toContain('A free account is required to save.');
    expect(home.match(/data-video-topic=/g)).toHaveLength(4);
    for (const topic of ['comparison', 'income', 'portfolio', 'assistant']) expect(videos).toContain(`data-video-topic="${topic}"`);
    expect(videos.match(/class="video-placeholder-tag"/g)).toHaveLength(4);
    expect(videos.match(/role="img" aria-label="Video placeholder/g)).toHaveLength(4);
    expect(videos).not.toMatch(/<(?:video|iframe)\b|youtube\.com|youtu\.be|vimeo\.com/i);
    expect(home).not.toContain('VideoObject');
    const app = graph.find((entry: { url?: string }) => entry.url === 'https://aftertaxus.com/app/');
    expect(app.featureList.join(' ')).toContain('MCP access');
  });
  it.each([['index.html', home], ['calculator.html', calculator], ['how-it-works.html', methodology]])('gives %s an indexable title, description, canonical and accessible structure', (name, html) => {
    const canonical = name === 'index.html' ? 'https://aftertaxus.com/' : `https://aftertaxus.com/${name}`;
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html).toContain(`rel="canonical" href="${canonical}"`);
    expect(metadata(html, 'description')).toHaveLength(1);
    expect(metadata(html, 'description')[0]!.length).toBeGreaterThan(90);
    expect(metadata(html, 'robots')[0]).toMatch(/^index,follow/);
    expect(metadata(html, 'og:url')).toEqual([canonical]);
    expect(html).toContain('2025');
    expect(html).not.toMatch(/video hub|video library holder|Add an embed link|SearchAction|aggregateRating|reviewCount/i);
  });

  it('presents two clear primary paths, with honest signup expectations', () => {
    const hero = home.match(/<section class="shell hero"[\s\S]*?<\/section>/)![0];
    expect(links(hero)).toEqual(['#investment-comparison', '/app/', '/calculator.html']);
    expect(hero).toContain('class="button secondary hero-tool" href="/calculator.html"');
    expect(hero.match(/class="button (?:primary|secondary) hero-tool"/g)).toHaveLength(3);
    expect(hero).toContain('aria-label="Choose a free tool"');
    expect(hero.match(/class="hero-tool-icon" aria-hidden="true"/g)).toHaveLength(3);
    expect(hero).toContain('Estimate your take-home income · Free, no login');
    expect(hero).toContain('Plan all your accounts · Free account required');
    expect(hero).not.toContain('Prefer the original income sliders?');
    expect(hero).toContain('Two investments. One clear after-tax comparison.');
    expect(hero).toContain('Your filing status + state · Free, no login');
    const toolButtons = [...hero.matchAll(/<a class="button [^"]*hero-tool"[\s\S]*?<\/a>/g)].map(match => match[0]);
    expect(toolButtons[1]).toContain('Connect compatible AI assistants through MCP.');
    expect(toolButtons[2]).toContain('2025 tax model · Planning, not tax filing');
    expect(home).not.toContain('class="shell benefit-strip"');
    expect(hero).not.toContain('<p class="microcopy">');
    expect(home).toContain('A free account is required to save');
    expect(home).not.toMatch(/waitlist|coming soon|limited.time offer/i);
    for (const link of links(home)) {
      const url = new URL(link, 'https://aftertaxus.com/');
      expect([...url.searchParams.keys()].every(key => key === 'auth')).toBe(true);
      expect(url.protocol).toBe('https:');
    }
  });

  it('embeds the two-investment comparison on the homepage and retains standalone calculator links', () => {
    const section = home.match(/<section[^>]*id="investment-comparison"[\s\S]*?<\/section>/)![0];
    expect(section).toContain('Which investment wins after tax?');
    expect(section).toContain('src="https://calculator.aftertaxus.com/?embed=1"');
    expect(section).toContain('title="Compare two investments after tax"');
    expect(section).toContain('referrerpolicy="strict-origin-when-cross-origin"');
    expect(section).toContain('allow="clipboard-write"');
    expect(links(section)).toEqual(['https://calculator.aftertaxus.com/', 'https://calculator.aftertaxus.com/', '/how-it-works.html']);
    expect(home).toContain('class="button secondary hero-tool" href="/calculator.html"');
    expect(home).toContain('class="button secondary hero-tool" href="/app/"');
    expect(read('marketing.css')).toMatch(/\.comparison-calculator-frame\s*\{[^}]*height:\s*1460px/);
  });

  it('makes the numerical illustration explicit rather than claiming a real return', () => {
    const amount = 100000;
    const taxableIncome = amount * 0.05;
    const taxableNet = taxableIncome * (1 - 0.3);
    const exemptNet = amount * 0.04;
    for (const value of [amount, taxableIncome, taxableIncome - taxableNet, taxableNet, exemptNet]) {
      expect(home).toContain(`$${value.toLocaleString('en-US')}`);
    }
    expect(home).toContain(`+$${exemptNet - taxableNet}`);
    expect(home).toContain('Assumes a flat 30% tax on A and full exemption on B');
    expect(home).toContain('Risk, fees and price changes are not compared');
    expect(home).toContain('not live rates or an investment recommendation');
  });

  it('describes actual free applications without fabricated search or review markup', () => {
    const apps = graph.filter((entry: { '@type': string }) => entry['@type'] === 'WebApplication');
    expect(apps).toHaveLength(3);
    expect(apps.map((entry: { url: string }) => entry.url)).toEqual(['https://calculator.aftertaxus.com/', 'https://aftertaxus.com/calculator.html', 'https://aftertaxus.com/app/']);
    for (const app of apps) expect(app.offers).toEqual({ '@type': 'Offer', price: '0', priceCurrency: 'USD' });
    expect(graph.some((entry: { '@type': string }) => entry['@type'] === 'Organization')).toBe(true);
    expect(JSON.stringify(graph)).not.toMatch(/SearchAction|ratingValue|reviewCount/);
  });

  it('preserves the income calculator controls and its existing calculation script', () => {
    for (const identifier of ['income', 'investmentIncome', 'stateCode', 'localityId', 'filingStatus', 'deductionMode', 'itemizedDeduction', 'afterTaxValue', 'taxReportModal']) {
      expect(calculator).toContain(`id="${identifier}"`);
    }
    expect(calculator).toContain('src="/app.js?v=20260905-income-ranges"');
    expect(calculator).toContain('data-quick-calculator-handoff');
    expect(calculator).toContain('The full app is free, not a paid upgrade');
    expect(calculator).toContain('prepare your quick-estimate inputs in this browser');
    expect(calculator).toContain('Calculations use AfterTaxUS backend services');
    expect(calculator).toContain('Estimate your after-tax income');
    expect(home).toContain('After-tax income calculator');
    expect(home).toContain('href="/calculator.html"');
    expect(links(calculator)).toContain('https://calculator.aftertaxus.com/');
  });

  it('keeps the simplified lower page focused on tools, videos and one limitations note', () => {
    const contentAfterCalculator = home.slice(home.indexOf('</section>', home.indexOf('id="investment-comparison"')) + '</section>'.length, home.indexOf('</main>'));
    expect(contentAfterCalculator.match(/<section\b/g)).toHaveLength(3);
    expect(contentAfterCalculator).toContain('id="other-tools"');
    expect(contentAfterCalculator).toContain('id="videos"');
    expect(contentAfterCalculator).toContain('class="shell compact-disclaimer"');
    expect(contentAfterCalculator).not.toMatch(/id="(?:compare-tools|mcp-connector|faq|full-app)"/);
    expect(contentAfterCalculator).not.toContain('<details>');
    expect(read('marketing.css')).toContain('.video-gallery');
  });

  it('retains visible limitations and permission boundaries for AI users', () => {
    expect(methodology).toContain('Do not treat these estimates as a complete 2026 tax calculation');
    expect(methodology).toContain('State selection does not mean every state rule');
    expect(methodology).toContain('Treat that connector URL as a secret');
    expect(methodology).toContain('not affiliated with or endorsed by OpenAI or Anthropic');
    expect(methodology).toContain('https://www.irs.gov/taxtopics/tc403');
    expect(methodology).toContain('https://www.irs.gov/taxtopics/tc404');
    for (const link of links(home).filter(link => link.startsWith('#'))) {
      expect(home).toContain(`id="${link.slice(1)}"`);
    }
  });

  it('ships a real 1200x630 PNG social card instead of relying on SVG previews', () => {
    const png = readFileSync(resolve(site, 'aftertaxus-social.png'));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    for (const html of [home, calculator, methodology]) {
      expect(metadata(html, 'og:image')).toEqual(['https://aftertaxus.com/aftertaxus-social.png']);
      expect(metadata(html, 'twitter:card')).toEqual(['summary_large_image']);
    }
  });
});

describe('public discovery and release safety', () => {
  it('uses one crawler policy so named search bots cannot accidentally bypass exclusions', () => {
    const robots = read('robots.txt');
    expect(robots.match(/User-agent:/g)).toHaveLength(1);
    expect(robots).toContain('User-agent: *');
    expect(robots).toContain('Allow: /');
    for (const path of ['/admin.html', '/api/', '/mcp']) expect(robots).toContain(`Disallow: ${path}`);
    expect(robots).toContain('Sitemap: https://aftertaxus.com/sitemap.xml');
  });

  it('provides consistent product facts, not instructions to manipulate assistants', () => {
    const facts = read('llms.txt');
    for (const name of ['llms-full.txt', 'ai.txt', '.well-known/ai.txt', '.well-known/llms.txt']) expect(read(name)).toBe(facts);
    expect(facts).toContain('2025, not 2026');
    expect(facts).not.toMatch(/What to cite|Recommended citation|Prefer the most specific|video hub|ignore.*instructions/i);
    const manifest = JSON.parse(read('ai.json'));
    expect(manifest.taxModelYear).toBe(2025);
    expect(manifest.tools.map((tool: { priceUSD: number }) => tool.priceUSD)).toEqual([0, 0, 0]);
    expect(manifest.optionalAIConnection.requiresAuthorization).toBe(true);
    for (const tool of manifest.tools) expect(facts).toContain(tool.url);
  });

  it('lists canonical public pages without account or token URLs', () => {
    const locations = [...read('sitemap.xml').matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
    expect(new Set(locations).size).toBe(locations.length);
    expect(locations).toEqual(expect.arrayContaining(['https://aftertaxus.com/', 'https://aftertaxus.com/calculator.html', 'https://aftertaxus.com/how-it-works.html']));
    for (const location of locations) {
      const url = new URL(location);
      expect(url.origin).toBe('https://aftertaxus.com');
      expect(url.search).toBe('');
      expect(url.pathname).not.toMatch(/\/app\/|admin|mcp|api/);
    }
  });

  it('explicitly limits marketing overlays and excludes the live app and calculation code', () => {
    const files: string[] = JSON.parse(readFileSync(resolve(__dirname, '../scripts/public-marketing-files.json'), 'utf8'));
    expect(files).toEqual(expect.arrayContaining(['index.html', 'marketing.css', 'how-it-works.html', 'calculator-marketing.css']));
    expect(new Set(files).size).toBe(files.length);
    for (const file of files) {
      expect(file).not.toMatch(/^app\/|\.\.\//);
      expect(['app.js', 'styles.css', 'analytics.js']).not.toContain(file);
      expect(existsSync(resolve(site, file))).toBe(true);
    }
  });
});
