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
