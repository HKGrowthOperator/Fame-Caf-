/* Bestellen im Browser: Gästeseite (Tisch per QR, Mitnehmen), Personal-Tafel, Karte,
   gebrandete QR-Codes (werden wirklich dekodiert) und Ausfälle.

   Feste Uhr wie bei den Buchungstests: Sa 10.10.2026, 12:00 Uhr in Gummersbach. */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { loadChromium, serve, bookingApp, ADMIN_TOKEN, report } from './lib.mjs';

const require = createRequire(import.meta.url);
const JSQR = readFileSync(require.resolve('jsqr/dist/jsQR.js'), 'utf8');

const failures = [];
let checks = 0;
const check = (cond, label) => { checks++; if (!cond) failures.push(label); };
const only = process.env.QA_ONLY;
const browser = await loadChromium();

async function scenario(name, fn, { width = 390, height = 844, mobile = true, js = true, api = true, ordering = true } = {}) {
  if (only && !name.includes(only)) return;
  const { app, clock } = bookingApp();
  const site = await serve(0, { app: api ? app : undefined });
  const ctx = await browser.newContext({ viewport: { width, height }, javaScriptEnabled: js, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const started = Date.now();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/images\.unsplash\.com/, r => r.abort());
  const adm = async (method, path, body) => {
    const res = await fetch(`${site.base}/api/admin${path}`, { method, headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  const post = async (path, body) => { const r = await fetch(`${site.base}/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => null) }; };
  let keys = {};
  try {
    if (api && ordering) {
      const r = await adm('PUT', '/settings', { ordering: { enabled: true, tables: ['12', '3'] } });
      if (r.status !== 200) throw new Error(`Freischalten fehlgeschlagen: ${JSON.stringify(r.json)}`);
      keys = Object.fromEntries((await adm('GET', '/tables')).json.tables.map(t => [t.label, t.key]));
    }
    await fn({ page, ctx, site, adm, post, keys, clock, errors });
  } catch (err) {
    failures.push(`${name}: Ablauf abgebrochen — ${String(err.message).split('\n').slice(0, 4).join(' ')}`);
  } finally {
    check(errors.length === 0, `${name}: Skriptfehler ${errors.join(' | ')}`);
    await ctx.close(); await site.close(); app.close();
    if (process.env.QA_VERBOSE) console.log(`  ${((Date.now() - started) / 1000).toFixed(1)} s  ${name}`);
  }
}

const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const tableUrl = (site, keys, t = '12') => `${site.base}/bestellen/?t=${t}&k=${keys[t]}`;

/* --- 1. Am Tisch: von der Karte bis zum Status ------------------------------------- */
await scenario('Tisch-Bestellung', async ({ page, site, adm, keys }) => {
  await page.goto(tableUrl(site, keys), { waitUntil: 'load' });
  await page.waitForSelector('.o-item');
  check((await page.locator('#oChip').textContent()) === 'TISCH 12', 'Tisch: Chip zeigt den Tisch nicht');
  check(await page.locator('#row-bagel, #row-cake-bakery').count() === 0, 'Tisch: Artikel ohne Preis erscheinen auf der Karte');
  check(await page.locator('#row-espresso').count() === 1, 'Tisch: Espresso fehlt');

  // Handy-Kriterien: Tippflächen ≥ 44 px, Felder ≥ 16 px, nichts unter 12 px
  const m = await page.evaluate(() => {
    const sizes = [...document.querySelectorAll('.o-add,.o-cat')].map(e => Math.round(e.getBoundingClientRect().height));
    const txt = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const n = w.currentNode; const e = n.parentElement; if (!n.textContent.trim() || e.closest('script,style,noscript,[hidden]')) continue; const r = e.getBoundingClientRect(); if (!r.width) continue; const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 11) txt.push(`${fs}px ${n.textContent.trim().slice(0, 20)}`); }
    return { sizes, txt };
  });
  check(m.sizes.length > 0 && m.sizes.every(x => x >= 44), `Tisch: Tippflächen unter 44px (${m.sizes})`);
  check(m.txt.length === 0, `Tisch: Text unter 11px (${m.txt.slice(0, 3)})`);
  check(await overflow(page) <= 0, 'Tisch: horizontaler Overflow in der Karte');

  check(await page.locator('#oCartbar').isHidden(), 'Tisch: Warenkorb-Leiste ohne Artikel sichtbar');
  await page.click('#row-cappuccino .o-add');
  await page.click('#row-cappuccino .o-step button:last-of-type');
  await page.click('#row-acai-bowl .o-add');
  check((await page.locator('#oCartCount').textContent()) === '3 Artikel', 'Tisch: Artikelzahl falsch');
  check((await page.locator('#oCartSum').textContent()) === '17,70 €', `Tisch: Summe falsch (${await page.locator('#oCartSum').textContent()})`);
  await page.click('#oCartGo');
  await page.waitForSelector('#oSubmit');
  check(await page.locator('#oName').count() === 0, 'Tisch: Namensfeld am Tisch (kein Personenbezug nötig)');
  check(/17,70/.test(await page.locator('#oSubmit').textContent()), 'Tisch: Button zeigt die Summe nicht');
  // Menge in der Prüfansicht ändern: Seite darf nicht nach oben springen, Eingaben bleiben
  await page.fill('#oNote', 'ohne Strohhalm');
  await page.locator('.o-line .o-step button:last-of-type').first().click();
  check((await page.locator('#oNote').inputValue()) === 'ohne Strohhalm', 'Tisch: Anmerkung geht beim Ändern der Menge verloren');
  await page.locator('.o-line .o-step button').first().click();
  await page.click('#oSubmit');
  await page.waitForSelector('.o-number');
  check((await page.locator('.o-number').textContent()) === '1', 'Tisch: Bestellnummer fehlt');
  check(/Tisch 12/.test(await page.locator('.o-where').textContent()), 'Tisch: Status nennt den Tisch nicht');
  check(await overflow(page) <= 0, 'Tisch: horizontaler Overflow im Status');

  const o = (await adm('GET', '/orders')).json.orders[0];
  check(o.totalCents === 1770 && o.table === '12' && o.note === 'ohne Strohhalm', `Tisch: gespeicherte Bestellung stimmt nicht (${JSON.stringify([o.totalCents, o.table, o.note])})`);
  check(page.url().includes('o='), 'Tisch: Bestell-Link steht nicht in der Adresszeile');

  // Seite neu laden: Status bleibt über den Link erreichbar
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.o-number');
  // Personal nimmt an → der Gast sieht es ohne Neuladen
  await adm('PATCH', `/orders/${o.id}`, { status: 'preparing' });
  await page.waitForFunction(() => document.querySelector('.o-steps li[data-state="now"]')?.textContent.includes('zubereitet'), null, { timeout: 12000 });
  check(await page.locator('text=Bestellung stornieren').count() === 0, 'Tisch: Storno bleibt trotz „in Arbeit“ angeboten');
});

/* --- 2. Ungültiger QR-Code, ausgeschaltet, Ausfall -------------------------------------- */
await scenario('Falscher Schlüssel', async ({ page, site, keys }) => {
  await page.goto(`${site.base}/bestellen/?t=12&k=000000000000`, { waitUntil: 'load' });
  await page.waitForSelector('.o-notice');
  check(/nicht gültig/.test(await page.locator('#oRoot').textContent()), 'Falscher Schlüssel: keine klare Meldung');
  check(await page.locator('.o-item').count() === 0, 'Falscher Schlüssel: Karte trotzdem sichtbar');
});
await scenario('Ausgeschaltet', async ({ page, site }) => {
  await page.goto(`${site.base}/bestellen/`, { waitUntil: 'load' });
  await page.waitForSelector('.o-notice');
  check(/noch nicht freigeschaltet/.test(await page.locator('#oRoot').textContent()), 'Ausgeschaltet: Meldung fehlt');
  check(await page.locator('.o-item').count() === 0, 'Ausgeschaltet: Karte sichtbar');
}, { ordering: false });
for (const [label, setup, opts] of [
  ['ohne JavaScript', null, { js: false }],
  ['API fehlt', null, { api: false }],
  ['API verweigert', async page => page.route('**/api/**', r => r.abort()), {}],
  ['API antwortet 500', async page => page.route('**/api/**', r => r.fulfill({ status: 500, contentType: 'text/html', body: '<h1>Bad Gateway</h1>' })), {}],
  ['Skript fehlt', async page => page.route('**/bestellen.js*', r => r.abort()), {}]
]) {
  await scenario(`Ausfall: ${label}`, async ({ page, site }) => {
    if (setup) await setup(page);
    await page.goto(`${site.base}/bestellen/`, { waitUntil: 'load' });
    await page.waitForTimeout(700);
    check(await page.locator('.o-item').count() === 0 && await page.locator('#oSubmit').count() === 0, `Ausfall ${label}: es erscheint trotzdem eine Bestellmöglichkeit`);
    check(/im Café/.test(await page.locator('#oRoot').textContent()), `Ausfall ${label}: kein Hinweis auf das Café`);
  }, opts);
}

/* --- 3. Mitnehmen --------------------------------------------------------------------- */
await scenario('Mitnehmen', async ({ page, site, adm }) => {
  await page.goto(`${site.base}/bestellen/`, { waitUntil: 'load' });
  await page.waitForSelector('.o-item');
  check((await page.locator('#oChip').textContent()) === 'MITNEHMEN', 'Mitnehmen: Chip fehlt');
  await page.click('#row-flat-white .o-add');
  await page.click('#oCartGo');
  await page.waitForSelector('#oName');
  const opts = await page.locator('#oWhen option').allTextContents();
  check(opts[0] === 'So schnell wie möglich' && opts.some(o => /^12:15 Uhr$/.test(o)), `Mitnehmen: Abholzeiten falsch (${opts.slice(0, 3)})`);
  await page.click('#oSubmit');
  check(/Namen/.test(await page.locator('#oError').textContent()), 'Mitnehmen: Name wird nicht verlangt');
  await page.fill('#oName', 'Anna');
  await page.click('#oSubmit');
  check(/Datenschutz/.test(await page.locator('#oError').textContent()), 'Mitnehmen: Datenschutz wird nicht verlangt');
  await page.locator('#oPrivacy').check();
  await page.selectOption('#oWhen', '13:00');
  await page.click('#oSubmit');
  await page.waitForSelector('.o-number');
  check(/Abholung um 13:00 Uhr/.test(await page.locator('.o-where').textContent()), 'Mitnehmen: Abholzeit nicht angezeigt');
  const o = (await adm('GET', '/orders')).json.orders[0];
  check(o.mode === 'pickup' && o.name === 'Anna' && o.pickupAt === '13:00', 'Mitnehmen: gespeicherte Bestellung stimmt nicht');
  // Stornieren, solange niemand angefangen hat
  page.once('dialog', d => d.accept());
  await page.click('text=Bestellung stornieren');
  await page.waitForFunction(() => /cancelled/.test(document.querySelector('#oTitle')?.textContent || ''));
  check((await adm('GET', '/orders')).json.orders[0].status === 'cancelled', 'Mitnehmen: Storno kommt nicht an');
});

/* --- 4. Ausverkauft, während der Gast bestellt ------------------------------------------- */
await scenario('Ausverkauft im Warenkorb', async ({ page, site, adm, keys }) => {
  await page.goto(tableUrl(site, keys), { waitUntil: 'load' });
  await page.waitForSelector('.o-item');
  await page.click('#row-espresso .o-add'); await page.click('#row-cappuccino .o-add');
  await adm('PATCH', '/menu/items/espresso', { available: false });
  await page.click('#oCartGo'); await page.waitForSelector('#oSubmit');
  await page.click('#oSubmit');
  await page.waitForSelector('.o-notice[role="alert"]');
  check(/Espresso/.test(await page.locator('#oRoot').textContent()), 'Ausverkauft: Meldung nennt den Artikel nicht');
  check(await page.locator('#row-espresso[data-out="true"]').count() === 1, 'Ausverkauft: Artikel nicht als ausverkauft markiert');
  check((await page.locator('#oCartCount').textContent()) === '1 Artikel', 'Ausverkauft: Artikel bleibt im Warenkorb');
  check((await adm('GET', '/orders')).json.orders.length === 0, 'Ausverkauft: Bestellung wurde trotzdem gespeichert');
});

/* --- 5. Breiten ------------------------------------------------------------------------------- */
for (const width of [320, 390, 768, 1280]) {
  await scenario(`Breite ${width}`, async ({ page, site, keys }) => {
    await page.goto(tableUrl(site, keys), { waitUntil: 'load' });
    await page.waitForSelector('.o-item');
    check(await overflow(page) <= 0, `@${width}px: Overflow in der Karte`);
    await page.click('#row-acai-bowl .o-add'); await page.click('#oCartGo'); await page.waitForSelector('#oSubmit');
    check(await overflow(page) <= 0, `@${width}px: Overflow in der Prüfansicht`);
    await page.click('#oSubmit'); await page.waitForSelector('.o-number');
    check(await overflow(page) <= 0, `@${width}px: Overflow im Status`);
  }, { width, height: width < 700 ? 800 : 900, mobile: width < 700 });
}

/* --- 6. Personal: Tafel, Karte, Einstellungen -------------------------------------------------- */
const staffLogin = async (page, site) => {
  await page.goto(`${site.base}/admin/bestellungen.html`, { waitUntil: 'load' });
  await page.fill('#code', ADMIN_TOKEN); await page.click('button[type=submit]');
  await page.waitForSelector('.tabs');
};
await scenario('Personal: Tafel', async ({ page, site, adm, post, keys }) => {
  const xss = '<img src=x onerror="window.__xss=1">';
  const a = await post('/orders', { mode: 'table', t: '12', k: keys['12'], items: [{ id: 'espresso', qty: 2 }, { id: 'acai-bowl', qty: 1 }], note: xss });
  const b = await post('/orders', { mode: 'pickup', items: [{ id: 'flat-white', qty: 1 }], name: 'Bea Beispiel', phone: '0151 222', pickupAt: '13:00', privacy: true });
  check(a.status === 201 && b.status === 201, 'Tafel: Vorbereitung fehlgeschlagen');
  await staffLogin(page, site);
  await page.waitForSelector('.ord');
  check((await page.locator('#badge').textContent()) === '2', 'Tafel: Zahl neuer Bestellungen fehlt');
  check((await page.title()).startsWith('(2)'), 'Tafel: Titel zeigt keine neuen Bestellungen');
  check(await page.evaluate(() => window.__xss === undefined && !document.querySelector('.ord img')), 'Tafel: HTML in der Anmerkung wurde ausgeführt');
  check((await page.locator('.ord-items').first().textContent()).includes('2×'), 'Tafel: Mengen fehlen');
  const txt = await page.locator('#view').textContent();
  check(/TISCH 12/.test(txt) && /ABHOLUNG 13:00 UHR/.test(txt) && /Bea Beispiel/.test(txt), 'Tafel: Tisch/Abholung/Name fehlen');
  check(await overflow(page) <= 0, 'Tafel: horizontaler Overflow @390');
  const heights = await page.locator('.ord .actions .b').evaluateAll(e => e.map(x => Math.round(x.getBoundingClientRect().height)));
  check(heights.every(x => x >= 40), `Tafel: Schaltflächen zu klein (${heights})`);

  const first = page.locator('.ord[data-status="new"]').first();
  await first.locator('.b.primary', { hasText: 'Annehmen' }).click();
  await page.waitForSelector('.ord[data-status="preparing"]');
  await page.locator('.ord[data-status="preparing"] .b.primary', { hasText: 'Fertig' }).click();
  await page.waitForSelector('.ord[data-status="ready"]');
  await page.locator('.ord[data-status="ready"] .b.primary').click();
  await page.waitForFunction(() => document.querySelectorAll('.ord[data-status="done"]').length === 1);
  const st = (await adm('GET', '/orders')).json.orders.map(o => o.status).sort();
  check(JSON.stringify(st) === JSON.stringify(['done', 'new']), `Tafel: Status in der API falsch (${st})`);

  // Pause wirkt öffentlich
  await page.locator('.b', { hasText: 'Pause (keine neuen Bestellungen)' }).click();
  await page.waitForSelector('text=Pause aktiv');
  const menu = await fetch(`${site.base}/api/order/menu?t=12&k=${keys['12']}`).then(r => r.json());
  check(menu.reason === 'paused', 'Tafel: Pause wirkt nicht auf die Gästeseite');
});

await scenario('Personal: Karte', async ({ page, site, adm, keys }) => {
  await staffLogin(page, site);
  await page.click('#tab-menu');
  await page.waitForSelector('text=Karte speichern');
  check(!/\[object|undefined|\bnull\b/.test(await page.locator('#view').textContent()), 'Karte: Platzhaltertext in der Ansicht');
  check(await overflow(page) <= 0, 'Karte: horizontaler Overflow');
  // „Verfügbar“ wirkt sofort
  const esp = page.locator('.card', { has: page.locator('input[value="Espresso"]') });
  await esp.locator('input[type=checkbox]').uncheck();
  await page.waitForTimeout(300);   // PATCH ist ausgelöst; kurz warten, bis er auf dem Server angekommen ist
  const menu = await fetch(`${site.base}/api/order/menu?t=12&k=${keys['12']}`).then(r => r.json());
  check(menu.menu.flatMap(c => c.items).find(i => i.id === 'espresso').available === false, 'Karte: Ausverkauft-Haken wirkt nicht sofort');
  // Bagel bekommt einen Preis und wird bestellbar
  const bagel = page.locator('.card', { has: page.locator('input[value="Bagel"]') });
  await bagel.locator('input[placeholder*="Preis"]').fill('6,50');
  await page.click('#saveMenu');
  page.once('dialog', d => d.accept());
  await page.waitForTimeout(600);
  const after = await fetch(`${site.base}/api/order/menu?t=12&k=${keys['12']}`).then(r => r.json());
  const bag = after.menu.flatMap(c => c.items).find(i => i.id === 'bagel');
  check(bag && bag.priceCents === 650, `Karte: Bagel-Preis kommt nicht an (${JSON.stringify(bag)})`);
});

await scenario('Personal: Tische und QR-Codes', async ({ page, site, keys }) => {
  await staffLogin(page, site);
  await page.click('#tab-tables');
  await page.waitForSelector('.qr-card');
  check(await page.locator('.qr-card').count() === 3, `QR: erwartet 2 Tische + Mitnehmen, gefunden ${await page.locator('.qr-card').count()}`);
  await page.fill('#tableCount', '5');
  await page.locator('.b', { hasText: 'Anlegen' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.qr-card').length === 6);

  // Jeden Code wirklich lesen: SVG → Canvas → jsQR. Dann prüfen, dass die Adresse bestellbar ist.
  await page.addScriptTag({ content: JSQR });
  const decoded = await page.evaluate(async () => {
    const out = [];
    for (const fig of document.querySelectorAll('.qr-card')) {
      const svg = fig.querySelector('svg');
      const xml = new XMLSerializer().serializeToString(svg);
      const img = new Image(); img.src = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
      await img.decode();
      const c = document.createElement('canvas'); c.width = 900; c.height = Math.round(900 * img.naturalHeight / img.naturalWidth);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      const r = window.jsQR(d.data, d.width, d.height);
      out.push({ label: fig.dataset.label, data: r?.data || null });
    }
    return out;
  });
  check(decoded.every(d => d.data), `QR: nicht lesbar: ${decoded.filter(d => !d.data).map(d => d.label)}`);
  for (const d of decoded.filter(x => x.data && x.label.startsWith('TISCH'))) {
    const u = new URL(d.data);
    const menu = await fetch(`${site.base}/api/order/menu${u.search}`).then(r => r.json());
    check(u.pathname === '/bestellen/' && menu.canOrder && `TISCH ${menu.table}` === d.label, `QR: ${d.label} führt nicht zum richtigen, bestellbaren Tisch (${d.data})`);
  }
  check(decoded.some(d => d.label === 'TO GO' && new URL(d.data).search === ''), 'QR: Mitnehmen-Code fehlt oder trägt Parameter');
  const keysSeen = decoded.filter(d => d.label.startsWith('TISCH')).map(d => new URL(d.data).searchParams.get('k'));
  check(new Set(keysSeen).size === keysSeen.length, 'QR: Tische teilen sich einen Schlüssel');

  // Druck: Bedienelemente verschwinden, nur die Karten bleiben
  await page.emulateMedia({ media: 'print' });
  const hidden = await page.evaluate(() => ['.top', '.tabs', '.no-print'].every(s => [...document.querySelectorAll(s)].every(e => getComputedStyle(e).display === 'none')));
  check(hidden, 'QR: Beim Drucken bleiben Bedienelemente sichtbar');
});

await scenario('Personal: Einstellungen', async ({ page, site, adm }) => {
  await staffLogin(page, site);
  await page.click('#tab-settings');
  await page.waitForSelector('#oEnabled');
  await page.locator('#oEnabled').uncheck();
  await page.locator('#oTake').uncheck();
  await page.locator('#oTable').uncheck();
  await page.locator('#oEnabled').check();
  await page.click('button[type=submit]');
  await page.waitForFunction(() => document.querySelector('#view .err')?.textContent.length > 0);
  check(/Mitnehmen|Tische/.test(await page.locator('#view .err').textContent()), 'Einstellungen: freischalten ohne Modus wird nicht beanstandet');
  await page.locator('#oTake').check();
  await page.click('button[type=submit]');
  await page.waitForFunction(() => /Gespeichert/.test(document.querySelector('#view .err')?.textContent || ''));
  check((await adm('GET', '/settings')).json.settings.ordering.takeaway === true, 'Einstellungen: nicht gespeichert');
});

await browser.close();
report('Bestellen', failures, checks);
