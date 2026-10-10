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
  await page.route(/\/assets\/photos\//, r => r.abort());
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
  // Galerie-Beschriftungen stehen unten in der Kachel. Eine Regel mit position:relative hatte sie
  // einmal an die Oberkante geschoben, wo sie halb abgeschnitten waren.
  const labels = await page.evaluate(() => [...document.querySelectorAll('.gallery-tile')].map(t => {
    const b = t.getBoundingClientRect(), l = t.querySelector('span').getBoundingClientRect();
    return { text: t.textContent.trim(), inside: l.top >= b.top && l.bottom <= b.bottom && l.left >= b.left, lower: l.top > b.top + b.height / 2 };
  }));
  const bad = labels.filter(l => !l.inside || !l.lower).map(l => l.text);
  check(labels.length > 0 && bad.length === 0, `@${width}px: Galerie-Beschriftung nicht unten in der Kachel: ${bad.join(', ')}`);
  await ctx.close();
}

// Bildgewicht: auf dem Handy werden nur die kleinen Varianten (NAME-m.jpg) geladen,
// und kein Foto kommt von einem fremden Server.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await ctx.newPage();
  const photos = [], foreign = [];
  page.on('request', q => {
    const u = new URL(q.url());
    if (u.origin !== new URL(site.base).origin && !u.protocol.startsWith('data')) foreign.push(q.url());
    else if (u.pathname.startsWith('/assets/photos/')) photos.push(u.pathname);
  });
  await page.goto(`${site.base}/index.html`, { waitUntil: 'load' });
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); }
  });
  await page.waitForTimeout(800);
  const large = photos.filter(p => !p.endsWith('-m.jpg'));
  check(photos.length > 0 && large.length === 0, `Bildgewicht: mobil werden große Varianten geladen: ${large.join(', ')}`);
  check(foreign.length === 0, `Fremde Server beim Seitenaufruf: ${foreign.slice(0, 3).join(', ')}`);
  await ctx.close();
}

await browser.close();
await site.close();
app.close();
report('Mobil', failures, checks);
