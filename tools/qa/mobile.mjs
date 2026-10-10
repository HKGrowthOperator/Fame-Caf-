/* Handy-Qualität, gemessen statt behauptet (390 × 844, Touch).
   Die meisten Besucher kommen über das Handy. Vor der Optimierung waren 85 von 293
   Textstellen kleiner als 12 px (kleinste 5,4 px, Preise 9 px) und 24 Tippflächen
   unter 44 px. Diese Prüfung hält das Ergebnis fest. */

import { loadChromium, serve, bookingApp, report } from './lib.mjs';

const failures = [];
let checks = 0;
const check = (cond, label) => { checks++; if (!cond) failures.push(label); };

const { app } = bookingApp();
const site = await serve(0, { app });
const browser = await loadChromium();

const MIN_TEXT = 11;                                   // px; darunter nur die Allowlist
const TEXT_ALLOW = ['.brand-sub', '.ritual-marker span']; // Logo-Zusatz und Zierzahl im Ritual
const TAP_ALLOW = ['.skip-link', '.hero-dot'];            // nur bei Fokus sichtbar / Trefferfläche per ::after

for (const width of [360, 390, 430]) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.route(/images\.unsplash\.com/, r => r.abort());
  await page.goto(`${site.base}/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('.rf');
  await page.waitForTimeout(500);

  const r = await page.evaluate(({ textAllow, tapAllow }) => {
    const vis = e => { const b = e.getBoundingClientRect(), cs = getComputedStyle(e); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const small = [], taps = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode, e = n.parentElement;
      if (!n.textContent.trim() || !vis(e) || e.closest('script,style,noscript,[hidden],.rf-hp')) continue;
      const fs = parseFloat(getComputedStyle(e).fontSize);
      if (fs < 11 && !textAllow.some(s => e.matches(s))) small.push(`${fs.toFixed(1)}px "${n.textContent.trim().slice(0, 24)}"`);
    }
    for (const e of document.querySelectorAll('a[href],button,select,textarea,summary,input:not([type=hidden]):not([type=radio]):not([type=checkbox])')) {
      if (!vis(e) || e.closest('.rf-hp,[hidden]') || tapAllow.some(s => e.matches(s))) continue;
      const inline = e.tagName === 'A' && getComputedStyle(e).display === 'inline';
      const b = e.getBoundingClientRect();
      if (!inline && (b.height < 43.5 || b.width < 43.5)) taps.push(`${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]} ${Math.round(b.width)}×${Math.round(b.height)} "${(e.textContent || '').trim().slice(0, 20)}"`);
    }
    return { small, taps, ctaVisible: (() => { const c = document.querySelector('.header-cta'); return !!c && vis(c); })() };
  }, { textAllow: TEXT_ALLOW, tapAllow: TAP_ALLOW });

  check(r.small.length === 0, `@${width}px: ${r.small.length} Textstellen unter ${MIN_TEXT}px: ${r.small.slice(0, 5).join(', ')}`);
  check(r.taps.length === 0, `@${width}px: ${r.taps.length} Tippflächen unter 44px: ${r.taps.slice(0, 6).join(', ')}`);
  check(r.ctaVisible === (width > 360), `@${width}px: „Reservieren“ im Header ${r.ctaVisible ? 'sichtbar' : 'fehlt'} (erwartet ab 361px)`);
  check(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, `@${width}px: horizontaler Overflow`);
  await ctx.close();
}

// Bildgewicht: mobile Bildvarianten sind eingebunden und kleiner als die Originale
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await ctx.newPage();
  const urls = [];
  page.on('request', q => { if (/images\.unsplash\.com/.test(q.url())) urls.push(q.url()); });
  await page.route(/images\.unsplash\.com/, rt => rt.abort());
  await page.goto(`${site.base}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const widths = urls.map(u => Number(/[?&]w=(\d+)/.exec(u)?.[1] || 0));
  check(urls.length > 0 && Math.max(...widths) <= 1400, `Bildgewicht: mobil werden Bilder mit Breite ${Math.max(...widths)}px geladen (erwartet ≤ 1400)`);
  await ctx.close();
}

await browser.close();
await site.close();
app.close();
report('Mobil', failures, checks);
