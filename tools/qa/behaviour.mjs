/* Verhaltensprüfungen gegen den aktuellen Stand.
   Jede Prüfung hier deckt einen Ausfall ab, der im Livetest gemessen wurde —
   deshalb sind sie festgenagelt und nicht nur Beispiele. */

import { loadChromium, serve, report } from './lib.mjs';

const site = await serve();
const browser = await loadChromium();
const failures = [];
let checks = 0;
const check = (cond, label) => { checks++; if (!cond) failures.push(label); };

/* --- Mobile Navigation --------------------------------------------------
   .desktop-nav ist unter 780px ausgeblendet. Ohne Overlay gab es dort
   gemessen null erreichbare Navigationselemente. */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${site.base}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(500);

  check(await page.locator('#navToggle').isVisible(), 'Menü-Toggle auf 390px nicht sichtbar');
  check(!(await page.locator('#mobileNav').isVisible()), 'Overlay nicht initial geschlossen');
  check(await page.locator('#navToggle').getAttribute('aria-expanded') === 'false', 'aria-expanded nicht false');

  await page.locator('#navToggle').click();
  await page.waitForTimeout(400);
  check(await page.locator('#mobileNav').isVisible(), 'Overlay öffnet nicht');
  check(await page.locator('#navToggle').getAttribute('aria-expanded') === 'true', 'aria-expanded nicht true');
  check(await page.evaluate(() => document.body.classList.contains('nav-open')), 'Scroll-Sperre fehlt');
  check(await page.evaluate(() => document.activeElement.closest('#mobileNav') !== null), 'Fokus springt nicht ins Overlay');

  await page.keyboard.press('Shift+Tab');
  check(await page.evaluate(() => document.activeElement.closest('#mobileNav') !== null), 'Fokus verlässt das offene Overlay');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check(!(await page.locator('#mobileNav').isVisible()), 'Escape schließt nicht');
  check(await page.evaluate(() => document.activeElement.id === 'navToggle'), 'Fokus kehrt nicht zum Toggle zurück');

  await page.locator('#navToggle').click();
  await page.waitForTimeout(350);
  await page.locator('#mobileNav a[href="#menu"]').click();
  await page.waitForTimeout(600);
  check(!(await page.locator('#mobileNav').isVisible()), 'Navigationslink schließt das Overlay nicht');
  check(await page.evaluate(() => window.scrollY > 400), 'Sprungziel wurde nicht angesteuert');
  await ctx.close();
}

/* --- Desktop + Skip-Link ------------------------------------------------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${site.base}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  check(!(await page.locator('#navToggle').isVisible()), 'Toggle auf Desktop sichtbar');
  check(await page.locator('.desktop-nav').isVisible(), 'Desktop-Navigation fehlt');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
  check(await page.evaluate(() => document.activeElement.classList.contains('skip-link')), 'Skip-Link ist nicht erstes Tab-Ziel');
  check(await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.skip-link')).top) > 0), 'Skip-Link wird bei Fokus nicht sichtbar');
  await ctx.close();
}

/* --- Ohne JavaScript ----------------------------------------------------
   Gemessen auf dem Livestand: 32 von 32 .reveal-Elementen unsichtbar. */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(`${site.base}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  const hidden = await page.evaluate(() => {
    let n = 0;
    document.querySelectorAll('.reveal').forEach(e => { if (parseFloat(getComputedStyle(e).opacity) < 0.5) n++; });
    return n;
  });
  check(hidden === 0, `ohne JS: ${hidden} unsichtbare .reveal-Elemente`);
  check(await page.locator('.ritual-steps').isVisible(), 'ohne JS: Ritual-Sequenz nicht sichtbar');
  check((await page.locator('.ritual-steps li').count()) === 4, 'ohne JS: nicht alle 4 Ritual-Schritte vorhanden');
  check(await page.locator('.hours-card').isVisible(), 'ohne JS: Öffnungszeiten nicht sichtbar');
  const ld = await page.locator('script[type="application/ld+json"]').textContent();
  check(ld.includes('openingHoursSpecification'), 'ohne JS: Öffnungszeiten fehlen in den strukturierten Daten');
  check(ld.includes('fame.cafe.gm'), 'ohne JS: Instagram fehlt in den strukturierten Daten');
  await ctx.close();
}

/* --- Wenn script.js ausfällt ---------------------------------------------
   Der gefährlichste Fall: Das HTML kommt an, das Skript nicht. Genau so
   entstand live eine komplett leere Seite unter dem Header. Das Netz dagegen
   steht inline im <head>; ein Handler in script.js wäre wirkungslos, weil
   die Datei ja gerade fehlt. */
for (const [label, setup] of [
  ['Abbruch (404)', p => p.route('**/script.js*', r => r.abort())],
  ['kaputter Code', p => p.route('**/script.js*', r => r.fulfill({
    status: 200, contentType: 'text/javascript', body: 'kein gueltiges javascript {{{'
  }))]
]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await setup(page);
  await page.goto(`${site.base}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(3600);
  const hidden = await page.evaluate(() => {
    let n = 0;
    document.querySelectorAll('.reveal').forEach(e => { if (parseFloat(getComputedStyle(e).opacity) < 0.5) n++; });
    return n;
  });
  check(hidden === 0, `script.js ${label}: ${hidden} unsichtbare Elemente — Seite bliebe leer`);
  check(await page.evaluate(() => document.documentElement.classList.contains('no-js')),
        `script.js ${label}: Seite fällt nicht auf die Fassung ohne JavaScript zurück`);
  await ctx.close();
}

/* --- Hero darf unter keinen Umständen schwarz sein -----------------------
   Das Karussell besteht aus drei getrennten Dateien: script.js lädt
   hero-carousel.css und hero-carousel.js nach. Jede davon kann für sich
   ausfallen. Kam früher nur das CSS an, waren die Bildhälften ausgeblendet
   und das Karussell nie gebaut — der Hero blieb schwarz. */
for (const [label, pattern] of [
  ['ohne Ausfall', null],
  ['script.js fehlt', '**/script.js*'],
  ['hero-carousel.js fehlt', '**/hero-carousel.js*'],
  ['hero-carousel.css fehlt', '**/hero-carousel.css*']
]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  if (pattern) await page.route(pattern, r => r.abort());
  await page.goto(`${site.base}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(pattern === '**/script.js*' ? 3600 : 1800);

  const sichtbar = await page.evaluate(() => {
    const halves = [...document.querySelectorAll('.hero-half')]
      .some(h => parseFloat(getComputedStyle(h).opacity) > 0.5);
    const slide = document.querySelector('.hero-carousel-slide.is-active');
    return halves || !!slide;
  });
  check(sichtbar, `Hero (${label}): keine sichtbare Bildfläche — der Hero wäre schwarz`);
  await ctx.close();
}

/* --- Reduced Motion ------------------------------------------------------ */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(`${site.base}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  check(await page.locator('.ritual-steps').isVisible(), 'reduced motion: Ritual-Sequenz nicht sichtbar');
  check((await page.locator('.ritual-steps li').count()) === 4, 'reduced motion: nicht alle 4 Schritte vorhanden');
  const hidden = await page.evaluate(() => {
    let n = 0;
    document.querySelectorAll('.reveal').forEach(e => { if (parseFloat(getComputedStyle(e).opacity) < 0.5) n++; });
    return n;
  });
  check(hidden === 0, `reduced motion: ${hidden} unsichtbare Elemente`);
  await ctx.close();
}

/* --- Sprungziele ---------------------------------------------------------
   Gemessen auf dem Livestand: 62 bis 72px unter dem Header verborgen. */
for (const w of [390, 834, 1440]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${site.base}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
  const hidden = await page.evaluate(async () => {
    const bad = {};
    for (const id of ['intro', 'ritual', 'menu', 'cafe', 'visit']) {
      location.hash = '#' + id;
      await new Promise(r => setTimeout(r, 320));
      const top = document.getElementById(id).getBoundingClientRect().top;
      const h = document.getElementById('siteHeader').getBoundingClientRect().height;
      if (h - top > 0) bad[id] = Math.round(h - top);
    }
    return bad;
  });
  check(Object.keys(hidden).length === 0, `@${w}px: Abschnittsanfang unter dem Header — ${JSON.stringify(hidden)}`);
  await ctx.close();
}

/* --- Karte erst auf Klick ------------------------------------------------
   Eine direkt eingebettete Maps-iframe überträgt die IP jedes Besuchers an
   Google, bevor jemand zugestimmt hat. */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const googleHits = [];
  page.on('request', r => { if (/google\.com|gstatic|googleapis/.test(r.url())) googleHits.push(r.url()); });
  await page.goto(`${site.base}/index.html`, { waitUntil: 'load' });
  await page.evaluate(() => document.querySelector('#visit').scrollIntoView());
  await page.waitForTimeout(1500);

  check(googleHits.length === 0, `Karte lädt ungefragt von Google: ${googleHits.slice(0, 2).join(', ')}`);
  check(await page.locator('#mapConsent').isVisible(), 'Karten-Hinweis fehlt');
  check((await page.locator('#mapWrap iframe').count()) === 0, 'iframe existiert schon vor der Zustimmung');

  await page.locator('#mapConsentButton').click();
  await page.waitForTimeout(600);
  check((await page.locator('#mapWrap iframe').count()) === 1, 'Karte erscheint nach Klick nicht');
  check((await page.locator('#mapConsent').count()) === 0, 'Hinweisfläche bleibt nach dem Laden stehen');
  await ctx.close();
}

/* --- Keine externen Schriften -------------------------------------------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const fontHits = [];
  page.on('request', r => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) fontHits.push(r.url()); });
  await page.goto(`${site.base}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(900);
  check(fontHits.length === 0, `Schriften werden extern geladen: ${fontHits[0] || ''}`);
  check(await page.evaluate(() => !!document.querySelector('link[rel*="icon"]')), 'Favicon fehlt');
  check(await page.evaluate(() => !!document.querySelector('meta[property="og:image"]')), 'og:image fehlt');
  await ctx.close();
}

/* --- Deep-Link ----------------------------------------------------------
   V4 entfernte den Hash beim Laden; geteilte Links landeten stumm oben. */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${site.base}/index.html#menu`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  check(await page.evaluate(() => window.scrollY > 400), 'Deep-Link auf #menu landet oben statt am Abschnitt');
  check(await page.evaluate(() => location.hash === '#menu'), 'Deep-Link verliert den Hash in der Adresszeile');
  await ctx.close();
}

/* --- 404 ----------------------------------------------------------------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const res = await page.goto(`${site.base}/gibt-es-nicht`, { waitUntil: 'load' });
  check(res.status() === 404, `unbekannte Adresse liefert Status ${res.status()} statt 404`);
  check((await page.title()).includes('FAME'), '404-Antwort ist nicht die FAME-Fehlerseite');
  await ctx.close();
}

await browser.close();
await site.close();
report('Verhalten', failures, checks);
