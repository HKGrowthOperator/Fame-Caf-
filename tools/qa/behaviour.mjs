/* Verhaltensprüfungen: Navigation, Tastaturbedienung, Betrieb ohne
   JavaScript und mit prefers-reduced-motion.
   Diese vier Bereiche waren im Projekt schon einmal defekt — deshalb
   sind sie hier festgenagelt. */

import { loadChromium, serve, report } from './lib.mjs';

const site = await serve();
const browser = await loadChromium();
const failures = [];
let checks = 0;
const check = (cond, label) => { checks++; if (!cond) failures.push(label); };

/* --- Mobile Navigation ------------------------------------------------- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${site.base}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(500);

  check(await page.locator('#navToggle').isVisible(), 'Menü-Toggle auf 390px nicht sichtbar');
  check(!(await page.locator('#mobileNav').isVisible()), 'Overlay nicht initial geschlossen');
  check(await page.locator('#navToggle').getAttribute('aria-expanded') === 'false', 'aria-expanded nicht false');

  await page.locator('#navToggle').click();
  await page.waitForTimeout(450);
  check(await page.locator('#mobileNav').isVisible(), 'Overlay öffnet nicht');
  check(await page.locator('#navToggle').getAttribute('aria-expanded') === 'true', 'aria-expanded nicht true');
  check(await page.evaluate(() => document.body.classList.contains('nav-open')), 'Scroll-Sperre fehlt');
  check(await page.evaluate(() => document.activeElement.closest('#mobileNav') !== null), 'Fokus springt nicht ins Overlay');

  await page.keyboard.press('Shift+Tab');
  check(await page.evaluate(() => document.activeElement.closest('#mobileNav') !== null), 'Fokus verlässt das offene Overlay');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check(!(await page.locator('#mobileNav').isVisible()), 'Escape schließt nicht');
  check(await page.evaluate(() => document.activeElement.id === 'navToggle'), 'Fokus kehrt nicht zum Toggle zurück');
  check(!(await page.evaluate(() => document.body.classList.contains('nav-open'))), 'Scroll-Sperre bleibt bestehen');

  await page.locator('#navToggle').click();
  await page.waitForTimeout(400);
  await page.locator('#mobileNav a[href="#menu"]').click();
  await page.waitForTimeout(600);
  check(!(await page.locator('#mobileNav').isVisible()), 'Navigationslink schließt das Overlay nicht');
  check(await page.evaluate(() => window.scrollY > 500), 'Sprungziel wurde nicht angesteuert');
  await ctx.close();
}

/* --- Desktop ----------------------------------------------------------- */
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

/* --- Ohne JavaScript ---------------------------------------------------
   .reveal startet auf opacity:0, sobald die Klasse .js gesetzt ist. Ohne
   diesen Test bliebe unbemerkt, dass die Seite bei JS-Ausfall leer ist. */
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
  check((await page.locator('.ritual-steps li').count()) === 6, 'ohne JS: nicht alle 6 Ritual-Schritte vorhanden');
  await ctx.close();
}

/* --- Reduced Motion ---------------------------------------------------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(`${site.base}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  check(await page.locator('.ritual-steps').isVisible(), 'reduced motion: Ritual-Sequenz nicht sichtbar');
  check((await page.locator('.ritual-steps li').count()) === 6, 'reduced motion: nicht alle 6 Schritte vorhanden');
  check(await page.evaluate(() => getComputedStyle(document.querySelector('.hero-bubbles')).display) === 'none',
        'reduced motion: Bubble-Animation nicht abgeschaltet');
  check(await page.evaluate(() => document.querySelector('.ritual').offsetHeight) < 900 * 3,
        'reduced motion: Ritual weiterhin über mehrere Bildschirmhöhen');
  await ctx.close();
}

/* --- Sprungziele --------------------------------------------------------
   Der Header liegt fest über dem Inhalt. Ohne scroll-margin-top verschwindet
   der Anfang jedes Abschnitts darunter; der Abschnitts-Kicker war live
   halb abgeschnitten. */
for (const w of [390, 834, 1440]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${site.base}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });

  const hidden = await page.evaluate(async () => {
    const bad = {};
    for (const id of ['intro', 'ritual', 'menu', 'space', 'catering']) {
      location.hash = '#' + id;
      await new Promise(r => setTimeout(r, 350));
      const top = document.getElementById(id).getBoundingClientRect().top;
      const headerBottom = document.getElementById('siteHeader').getBoundingClientRect().height;
      if (headerBottom - top > 0) bad[id] = Math.round(headerBottom - top);
    }
    return bad;
  });
  check(Object.keys(hidden).length === 0,
        `@${w}px: Abschnittsanfang liegt unter dem Header — ${JSON.stringify(hidden)}`);
  await ctx.close();
}

/* --- Hero-Kreis darf die Stadtzeile nicht überlagern -------------------- */
for (const w of [390, 834, 1024, 1440, 1920]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${site.base}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  const overlap = await page.evaluate(() => {
    const o = document.querySelector('.hero-orbit').getBoundingClientRect();
    const c = document.querySelector('.hero-city').getBoundingClientRect();
    return !(o.bottom < c.top || o.top > c.bottom || o.right < c.left || o.left > c.right);
  });
  check(!overlap, `@${w}px: Hero-Kreis überlagert GUMMERSBACH`);
  await ctx.close();
}

/* --- Instagram und Route --------------------------------------------------
   Auf main wurden diese Verweise per Skript eingefügt und blieben dabei
   dauerhaft auf opacity:0 — vorhanden, aber unsichtbar und nicht klickbar. */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${site.base}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('#visit').scrollIntoView());
  await page.waitForTimeout(1200);

  for (const [sel, name] of [
    ['a[href*="instagram.com/fame.cafe.gm"]', 'Instagram-Verweis'],
    ['a[href*="google.com/maps"]', 'Maps-Verweis']
  ]) {
    const el = page.locator(`#visit ${sel}`).first();
    check(await el.count() > 0, `${name} fehlt im Visit-Abschnitt`);
    if (await el.count() > 0) {
      check(await el.isVisible(), `${name} ist nicht sichtbar`);
      const op = await el.evaluate(n => {
        let e = n, min = 1;
        while (e && e !== document.body) { min = Math.min(min, parseFloat(getComputedStyle(e).opacity)); e = e.parentElement; }
        return min;
      });
      check(op > 0.9, `${name} ist durchsichtig (opacity ${op})`);
      const box = await el.boundingBox();
      check(box && box.height >= 24, `${name} hat keine anklickbare Fläche`);
    }
  }
  check(await page.locator('.footer-links a[href*="instagram.com"]').count() > 0, 'Instagram fehlt im Footer');

  // Ohne JavaScript müssen beide ebenfalls da sein.
  await ctx.close();
  const noJs = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
  const p2 = await noJs.newPage();
  await p2.goto(`${site.base}/index.html`, { waitUntil: 'load' });
  await p2.waitForTimeout(300);
  check(await p2.locator('#visit a[href*="instagram.com/fame.cafe.gm"]').isVisible(), 'ohne JS: Instagram-Verweis fehlt');
  check(await p2.locator('#visit a[href*="google.com/maps"]').isVisible(), 'ohne JS: Maps-Verweis fehlt');
  const ld = await p2.locator('script[type="application/ld+json"]').textContent();
  check(ld.includes('fame.cafe.gm'), 'ohne JS: Instagram fehlt in den strukturierten Daten');
  check(ld.includes('hasMap'), 'ohne JS: hasMap fehlt in den strukturierten Daten');
  await noJs.close();
}

/* --- 404 --------------------------------------------------------------- */
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
