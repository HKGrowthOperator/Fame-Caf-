/* Screenshots aller Abschnitte über Mobil, Tablet und Desktop.
   Landen in tools/qa/.screens/ (nicht versioniert) und sind für die
   visuelle Abnahme gedacht, nicht als automatischer Test. */

import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadChromium, serve, ROOT } from './lib.mjs';

const OUT = join(ROOT, 'tools/qa/.screens');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const DEVICES = [
  { name: 'mobil', width: 390, height: 844 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'desktop', width: 1440, height: 900 }
];

const SPOTS = [
  ['01-hero', null], ['02-intro', '#intro'], ['03-ritual', '#ritual'],
  ['04-signature', '.signature'], ['05-acai', '.acai-feature'], ['06-cafe', '#space'],
  ['07-menue', '#menu'], ['08-craft', '.craft'], ['09-gallery', '#gallery'],
  ['10-catering', '#catering'], ['11-visit', '#visit'], ['12-footer', 'footer']
];

const label = process.argv[2] || 'aktuell';
const site = await serve();
const browser = await loadChromium();

for (const d of DEVICES) {
  const ctx = await browser.newContext({ viewport: { width: d.width, height: d.height } });
  const page = await ctx.newPage();
  await page.goto(`${site.base}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(1000);

  for (const [name, sel] of SPOTS) {
    if (sel) await page.evaluate(s => document.querySelector(s)?.scrollIntoView({ block: 'start', behavior: 'instant' }), sel);
    else await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(OUT, `${label}-${d.name}-${name}.png`) });
  }

  // Sonderzustände
  if (d.name === 'mobil') {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('#navToggle').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, `${label}-${d.name}-13-navigation.png`) });
  }
  await ctx.close();
}

// Rechtstexte und Fehlerseite
for (const file of ['impressum.html', 'datenschutz.html', '404.html']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${site.base}/${file}`, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, `${label}-desktop-${file.replace('.html', '')}.png`), fullPage: true });
  await ctx.close();
}

await browser.close();
await site.close();
console.log(`Screenshots in ${OUT}`);
