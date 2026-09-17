/* Kein horizontaler Overflow, keine Skriptfehler — alle Seiten, alle Breiten.
   Jede Seite wird komplett durchgescrollt, damit auch sticky- und
   scrollgesteuerte Zustände geprüft werden. */

import { loadChromium, serve, PAGES, VIEWPORTS, report } from './lib.mjs';

const EXTERN = /unsplash|ERR_TUNNEL|ERR_CERT|ERR_NAME|net::ERR_(INTERNET|CONNECTION|PROXY)/i;

const site = await serve();
const browser = await loadChromium();
const failures = [];
let checks = 0;

for (const file of PAGES) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('Skriptfehler: ' + e.message));
    page.on('console', m => {
      // Externe Bildquellen können ausfallen, das ist kein Fehler der Seite.
      if (m.type() === 'error' && !EXTERN.test(m.text())) errs.push('Konsole: ' + m.text());
    });

    await page.goto(`${site.base}/${file}`, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    await page.evaluate(async () => {
      const h = document.documentElement.scrollHeight;
      for (let y = 0; y < h; y += 600) {
        window.scrollTo(0, y);
        await new Promise(r => requestAnimationFrame(r));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(200);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    if (overflow > 0) failures.push(`${file} @${vp.width}px: horizontaler Overflow ${overflow}px`);
    for (const e of errs) failures.push(`${file} @${vp.width}px: ${e}`);

    checks++;
    await ctx.close();
  }
}

await browser.close();
await site.close();
report('Sweep', failures, checks);
