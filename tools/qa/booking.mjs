/* Reservierung im Browser: Gast-Ablauf, Verwaltung, Ausfälle, Handy-Kriterien.

   Läuft gegen die echte API (server/app.mjs) mit festem Datum: Sa 10.10.2026,
   12:00 Uhr in Gummersbach. Jeder Abschnitt startet mit leerem Speicher. */

import { loadChromium, serve, bookingApp, ADMIN_TOKEN, report } from './lib.mjs';

const failures = [];
let checks = 0;
const only = process.env.QA_ONLY;   // z. B. QA_ONLY=Verwaltung
const check = (cond, label) => { checks++; if (!cond) failures.push(label); };

const browser = await loadChromium();

async function scenario(name, fn, { width = 390, height = 844, mobile = true, js = true, api = true, setup } = {}) {
  if (only && !name.includes(only)) return;
  const { app, clock } = bookingApp();
  const site = await serve(0, { app: api ? app : undefined });
  const ctx = await browser.newContext({
    viewport: { width, height }, javaScriptEnabled: js,
    ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {})
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);   // ein hängender Schritt soll schnell und mit Namen auffallen
  const started = Date.now();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/\/assets\/photos\//, r => r.abort());
  const adm = async (method, path, body) => {
    const res = await fetch(`${site.base}/api/admin${path}`, {
      method, headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  try {
    if (setup) await setup({ adm, site, app, clock });
    await fn({ page, ctx, site, adm, app, clock, errors });
  } catch (err) {
    failures.push(`${name}: Ablauf abgebrochen — ${String(err.message).split("\n").slice(0, 4).join(" ")}`);
  } finally {
    check(errors.length === 0, `${name}: Skriptfehler ${errors.join(' | ')}`);
    await ctx.close(); await site.close(); app.close();
    if (process.env.QA_VERBOSE) console.log(`  ${((Date.now() - started) / 1000).toFixed(1)} s  ${name}`);
  }
}

const open = async (page, site, path = '/reservieren/', { js = true } = {}) => {
  await page.goto(`${site}${path}`, { waitUntil: 'load' });
  // Ohne JavaScript kann Playwright nichts in die Seite einschleusen (der Aufruf hängt dann).
  if (js) await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
};
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/* --- 1. Gast: Anfrage von Anfang bis Ende (Handy) ------------------------ */
await scenario('Gast-Anfrage', async ({ page, site, adm }) => {
  await open(page, site.base);
  await page.waitForSelector('.rf .rf-time', { timeout: 8000 });

  // Handy-Kriterien: Tippflächen ≥ 44 px, Felder ≥ 16 px (sonst zoomt iOS), kein Seitwärtsscrollen
  const sizes = await page.evaluate(() => {
    const h = sel => [...document.querySelectorAll(sel)].map(e => Math.round(e.getBoundingClientRect().height));
    const px = sel => [...document.querySelectorAll(sel)].map(e => parseFloat(getComputedStyle(e).fontSize));
    return {
      steps: h('.rf-step'), days: h('.rf-day'), times: h('.rf-time span'), segs: h('.rf-seg span'), button: h('.rf-button'),
      fields: h('.rf-field input[type=text],.rf-field input[type=tel],.rf-field input[type=email]'),
      fontFields: px('.rf-field input:not([type=checkbox]),.rf-field textarea,.rf-other-date input')
    };
  });
  for (const [k, list] of Object.entries(sizes)) {
    if (k === 'fontFields') check(list.every(s => s >= 16), `Gast: Eingabefelder unter 16px (${list}) — iOS zoomt`);
    else check(list.length > 0 && list.every(s => s >= 44), `Gast: Tippfläche ${k} unter 44px (${list})`);
  }
  check(await overflow(page) <= 0, 'Gast: horizontaler Overflow mit Formular');

  // Zusammenfassung zeigt die 90 Minuten
  await page.locator('.rf-step').nth(1).click();
  await page.locator('.rf-step').nth(1).click();
  check((await page.locator('#rfPartyNum').textContent()) === '4', 'Gast: Personen-Zähler zählt nicht');
  await page.locator('.rf-day:has(input[value="2026-10-12"])').click();
  await page.waitForFunction(() => document.querySelectorAll('.rf-time input:not(:disabled)').length > 10);
  await page.locator('.rf-time:has(input[value="19:00"])').click();
  const summary = await page.locator('#rfSummary').textContent();
  check(/19:00–20:30 Uhr/.test(summary) && /4 Personen/.test(summary), `Gast: Zusammenfassung zeigt keine 90 Minuten (${summary})`);

  // Leeres Absenden → Fehler statt Netzaufruf, Fokus im ersten fehlerhaften Feld
  await page.locator('#rfSubmit').click();
  check((await page.locator('#name-error').textContent()).length > 0, 'Gast: kein Hinweis bei fehlendem Namen');
  check(await page.evaluate(() => document.activeElement.id === 'name'), 'Gast: Fokus springt nicht ins fehlerhafte Feld');
  check((await adm('GET', '/bookings')).json.bookings.length === 0, 'Gast: ungültiges Formular wurde trotzdem gesendet');

  await page.fill('#name', 'Anna Beispiel');
  await page.fill('#phone', '0176 1234567');
  await page.locator('#privacy').check();
  await page.locator('#rfSubmit').click();
  await page.waitForSelector('.rr');
  const title = await page.locator('.rr-title').textContent();
  check(/Anfrage eingegangen/.test(title), `Gast: falscher Ergebnistext (${title})`);
  check(await page.evaluate(() => document.activeElement.classList.contains('rr-title')), 'Gast: Fokus springt nicht zum Ergebnis');
  check(/Nr\. [A-Z2-9]{5}/.test(await page.locator('.rr-ref').textContent()), 'Gast: keine Referenznummer');
  check((await page.locator('.rr-link-input').inputValue()).includes('?b='), 'Gast: kein persönlicher Link');
  check(await overflow(page) <= 0, 'Gast: horizontaler Overflow im Ergebnis');

  const list = (await adm('GET', '/bookings')).json.bookings;
  check(list.length === 1 && list[0].party === 4 && list[0].date === '2026-10-12' && list[0].time === '19:00' && list[0].status === 'pending', 'Gast: gespeicherte Buchung stimmt nicht');
  check(list[0]?.durationMin === 90, 'Gast: Dauer ist nicht 90 Minuten');
});

/* --- 2. Personal bestätigt, Gast sieht es, Gast storniert --------------- */
await scenario('Verwaltung', async ({ page, ctx, site, adm }) => {
  const created = await fetch(`${site.base}/api/bookings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '<img src=x onerror="window.__xss=1">Zoe', phone: '0151 555000', date: '2026-10-12', time: '18:00', party: 2, area: 'any', privacy: true })
  }).then(r => r.json());

  await open(page, site.base, '/admin/');
  await page.fill('#code', 'falscher-code');
  await page.click('button[type=submit]');
  await page.waitForSelector('.err:not(:empty)');
  check(/nicht korrekt/.test(await page.locator('.err').textContent()), 'Admin: falscher Code zeigt keine Meldung');

  await page.fill('#code', ADMIN_TOKEN);
  await page.click('button[type=submit]');
  await page.waitForSelector('.tabs');
  check((await page.locator('#badge').textContent()) === '1', 'Admin: Anzahl offener Anfragen fehlt');
  check((await page.title()).startsWith('(1)'), 'Admin: Titel zeigt keine offene Anfrage');
  check(await overflow(page) <= 0, 'Admin: horizontaler Overflow @390');

  await page.click('#tab-pending');
  await page.waitForSelector('.card[data-status="pending"]');
  check(await page.evaluate(() => window.__xss === undefined && !document.querySelector('.who img')), 'Admin: HTML im Namen wurde ausgeführt');
  check((await page.locator('.who strong').textContent()).includes('<img'), 'Admin: Name nicht als Text angezeigt');
  const links = await page.locator('.contact a').evaluateAll(a => a.map(x => x.getAttribute('href')));
  check(links.some(l => l.startsWith('tel:')) && links.some(l => /wa\.me\/49151555000\?text=/.test(l)), `Admin: Anruf-/WhatsApp-Link fehlen (${links})`);
  const btn = await page.locator('.card .actions .b').evaluateAll(b => b.map(x => Math.round(x.getBoundingClientRect().height)));
  check(btn.every(x => x >= 40), `Admin: Schaltflächen zu klein (${btn})`);

  await page.locator('.card .b.primary', { hasText: 'Bestätigen' }).click();
  await page.waitForSelector('.empty');
  check((await adm('GET', '/bookings')).json.bookings[0].status === 'confirmed', 'Admin: Bestätigen wirkt nicht');

  // Gast öffnet seinen Link
  const guest = await ctx.newPage();
  await guest.route(/\/assets\/photos\//, r => r.abort());
  await guest.goto(`${site.base}/reservieren/${created.statusPath}`, { waitUntil: 'load' });
  await guest.waitForSelector('.rr');
  check(/Dein Tisch ist reserviert/.test(await guest.locator('.rr-title').textContent()), 'Gast-Link: Bestätigung nicht sichtbar');
  check(await guest.locator('a[href*="/ics?t="]').count() === 1, 'Gast-Link: Kalender-Download fehlt');
  await guest.locator('.rr-cancel-ask').click();
  await guest.locator('button', { hasText: 'Ja, stornieren' }).click();
  await guest.waitForFunction(() => /storniert/.test(document.querySelector('.rr-title')?.textContent || ''));
  check((await adm('GET', '/bookings')).json.bookings[0].status === 'cancelled', 'Gast-Link: Storno kommt nicht an');
  await guest.goto(`${site.base}/reservieren/?b=${created.id}.falscherschluessel1234#reservieren`, { waitUntil: 'load' });
  await guest.waitForSelector('.rr');
  check(/nicht gefunden/.test(await guest.locator('.rr-title').textContent()), 'Gast-Link: falscher Schlüssel verrät mehr als „nicht gefunden“');
  // Ältere Links zeigten auf die Startseite (/?b=…). Sie müssen auf der Reservierungsseite landen.
  await guest.goto(`${site.base}/${created.statusPath}`, { waitUntil: 'load' });
  await guest.waitForSelector('.rr');
  check(new URL(guest.url()).pathname === '/reservieren/', `Alter Gast-Link: landet auf ${new URL(guest.url()).pathname} statt /reservieren/`);
  check(/storniert/.test(await guest.locator('.rr-title').textContent()), 'Alter Gast-Link: Stand der Reservierung nicht sichtbar');
});

/* --- 2b. Alle Ansichten der Verwaltung bedienen ---------------------------
   Ein Darstellungsfehler (Listen als Text statt Elemente) blieb erst unentdeckt,
   weil nur die Anfragen-Ansicht getestet war. */
await scenario('Verwaltung: alle Ansichten', async ({ page, site, adm }) => {
  page.on('dialog', d => d.accept());
  await open(page, site.base, '/admin/');
  await page.fill('#code', ADMIN_TOKEN);
  await page.click('button[type=submit]');
  await page.waitForSelector('.tabs');
  const clean = async label => {
    const txt = await page.locator('#app').textContent();
    check(!/\[object|\bnull\b|undefined/.test(txt), `Admin ${label}: Platzhaltertext in der Ansicht`);
    check(await overflow(page) <= 0, `Admin ${label}: horizontaler Overflow`);
  };

  // Tag: leer, dann per „+ Buchung“ anlegen
  await page.waitForSelector('.daybar');
  check(/Keine Reservierungen/.test(await page.locator('#view').textContent()), 'Admin Tag: Leerzustand fehlt');
  await clean('Tag');
  await page.click('#fab');
  await page.waitForSelector('dialog[open]');
  await page.fill('#dn', 'Telefon Müller'); await page.fill('#dp', '02261 99999'); await page.fill('#dd', '2026-10-10'); await page.fill('#dt', '19:00'); await page.fill('#dq', '3');
  await page.click('dialog button[type=submit]');
  await page.waitForSelector('.card[data-status="confirmed"]');
  check((await page.locator('.who strong').first().textContent()) === 'Telefon Müller', 'Admin Tag: manuelle Buchung nicht sichtbar');
  check(/1 Reservierungen · 3 Gäste/.test(await page.locator('.stat').textContent()), 'Admin Tag: Tageszahlen falsch');
  await page.locator('.card .b.primary', { hasText: 'Gäste sind da' }).click();
  await page.waitForSelector('.card[data-status="seated"]');
  check((await adm('GET', '/bookings')).json.bookings[0].status === 'seated', 'Admin Tag: „Gäste sind da“ wirkt nicht');
  await page.locator('.daybar button').nth(1).click();
  await page.waitForSelector('.empty');
  await clean('Tag (morgen)');

  // Sperren: „Heute komplett sperren“ wirkt sofort auf die öffentliche Verfügbarkeit
  await page.click('#tab-blocks');
  await page.waitForSelector('text=Zeiten sperren');
  await clean('Sperren');
  await page.click('text=Heute komplett sperren');
  await page.waitForSelector('.list-row');
  const av = await fetch(`${site.base}/api/availability?date=2026-10-10&party=2`).then(r => r.json());
  check(av.slots.every(x => !x.available), 'Admin Sperren: „Heute komplett sperren“ lässt Zeiten offen');
  await page.locator('.list-row .b.danger').click();
  await page.waitForSelector('text=Keine Sperren eingetragen');
  const av2 = await fetch(`${site.base}/api/availability?date=2026-10-10&party=2`).then(r => r.json());
  check(av2.slots.some(x => x.available), 'Admin Sperren: Löschen gibt die Zeiten nicht wieder frei');

  // Einstellungen: Plätze speichern, Sofortbuchung erst danach möglich
  await page.click('#tab-settings');
  await page.waitForSelector('#seatIn');
  await clean('Einstellungen');
  await page.selectOption('#mode', 'instant');
  await page.click('button:has-text("Einstellungen speichern")');
  await page.waitForFunction(() => /Sofortbuchung geht erst/.test(document.querySelector('#view .err')?.textContent || ''));
  await page.fill('#seatIn', '12');
  await page.click('button:has-text("Einstellungen speichern")');
  await page.waitForFunction(() => /Gespeichert/.test(document.querySelector('#view .err')?.textContent || ''));
  const set = (await adm('GET', '/settings')).json.settings;
  check(set.seats.indoor === 12 && set.mode === 'instant' && set.durationMin === 90, 'Admin Einstellungen: Werte nicht gespeichert');
  check((await fetch(`${site.base}/api/config`).then(r => r.json())).instant === true, 'Admin Einstellungen: Sofortbuchung kommt nicht im Formular an');
});

/* --- 3. Sperre wirkt im Formular ---------------------------------------- */
await scenario('Sperre', async ({ page, site }) => {
  await open(page, site.base);
  await page.waitForSelector('.rf-day');
  const state = d => page.locator(`.rf-day:has(input[value="${d}"])`).getAttribute('data-state');
  check(await state('2026-10-13') === 'ok', 'Sperre: Dienstag müsste frei sein');
  check(await state('2026-10-10') === 'ok', 'Sperre: heute müsste noch buchbar sein');
}, { setup: async ({ adm }) => { await adm('POST', '/blocks', { date: '2026-10-14' }); } });

await scenario('Sperre sichtbar', async ({ page, site }) => {
  await open(page, site.base);
  await page.waitForSelector('.rf-day');
  const chip = page.locator('.rf-day:has(input[value="2026-10-14"])');
  check(await chip.getAttribute('data-state') === 'full', 'Sperre: gesperrter Tag ist nicht als belegt markiert');
  check(await chip.locator('input').isDisabled(), 'Sperre: gesperrter Tag ist wählbar');
  check(await page.locator('.rf-day:has(input[value="2026-10-08"])').count() === 0, 'Sperre: Tage vor „heute“ erscheinen');
}, { setup: async ({ adm }) => { await adm('POST', '/blocks', { date: '2026-10-14' }); } });

/* --- 4. Zeit ist inzwischen vergeben: Gast bekommt eine klare Antwort --- */
await scenario('Gleichzeitige Buchung', async ({ page, site, adm }) => {
  await open(page, site.base);
  await page.waitForSelector('.rf-time');
  await page.locator('.rf-step').nth(1).click(); await page.locator('.rf-step').nth(1).click();
  await page.locator('.rf-day:has(input[value="2026-10-12"])').click();
  await page.waitForFunction(() => document.querySelectorAll('.rf-time input:not(:disabled)').length > 10);
  await page.locator('.rf-time:has(input[value="19:00"])').click();
  await page.fill('#name', 'Ben Zwei'); await page.fill('#email', 'ben@example.org'); await page.locator('#privacy').check();
  // Währenddessen nimmt das Personal den letzten Platz weg
  const take = await adm('POST', '/bookings', { name: 'Telefon', date: '2026-10-12', time: '19:00', party: 4, area: 'indoor' });
  check(take.status === 201, 'Gleichzeitig: Vorbereitung fehlgeschlagen');
  await page.locator('#rfSubmit').click();
  await page.waitForFunction(() => document.querySelector('#time-error')?.textContent.length > 0);
  check(/nicht mehr frei|nichts frei/.test(await page.locator('#time-error').textContent()), 'Gleichzeitig: keine verständliche Meldung');
  check(await page.locator('.rf-time:has(input[value="19:00"]) input').isDisabled(), 'Gleichzeitig: vergebene Zeit bleibt wählbar');
  check(await page.locator('.rr').count() === 0, 'Gleichzeitig: trotzdem als gebucht angezeigt');
  check((await adm('GET', '/bookings')).json.bookings.length === 1, 'Gleichzeitig: Überbuchung gespeichert');
}, { setup: async ({ adm }) => { await adm('PUT', '/settings', { seats: { indoor: 4, outdoor: 1 } }); } });

/* --- 5. Ausfälle: die Seite verspricht nie Unmögliches ------------------ */
const FALLBACK = async (page, label) => {
  check(await page.locator('#reservieren').isVisible(), `${label}: Abschnitt ist nicht sichtbar`);
  check(await page.locator('.rf').count() === 0, `${label}: Formular erscheint trotz Ausfall`);
  check(await page.locator('#reservieren a[href*="instagram.com/fame.cafe.gm"]').isVisible(), `${label}: kein Instagram-Ausweg sichtbar`);
  check(/Instagram/.test(await page.locator('#reserveRoot').textContent()), `${label}: Ersatztext fehlt`);
};
await scenario('Ausfall: ohne JavaScript', async ({ page, site }) => { await open(page, site.base, '/reservieren/', { js: false }); await FALLBACK(page, 'ohne JS'); }, { js: false });
await scenario('Ausfall: API nicht vorhanden (HTML statt JSON)', async ({ page, site }) => { await open(page, site.base); await page.waitForTimeout(800); await FALLBACK(page, 'API fehlt'); }, { api: false });
await scenario('Ausfall: API verweigert Verbindung', async ({ page, site }) => {
  await page.route('**/api/**', r => r.abort());
  await open(page, site.base); await page.waitForTimeout(800); await FALLBACK(page, 'API aus');
});
await scenario('Ausfall: API antwortet 500', async ({ page, site }) => {
  await page.route('**/api/**', r => r.fulfill({ status: 500, contentType: 'text/html', body: '<h1>Bad Gateway</h1>' }));
  await open(page, site.base); await page.waitForTimeout(800); await FALLBACK(page, 'API 500');
});
await scenario('Ausfall: reservierung.js fehlt', async ({ page, site }) => {
  await page.route('**/reservierung.js*', r => r.abort());
  await open(page, site.base); await page.waitForTimeout(500); await FALLBACK(page, 'Skript fehlt');
});
await scenario('Ausfall: API fällt nach dem Laden aus', async ({ page, site }) => {
  await open(page, site.base);
  await page.waitForSelector('.rf-time');
  await page.route('**/api/**', r => r.abort());
  await page.locator('.rf-step').nth(1).click();
  await page.waitForSelector('.reserve-fallback');
  check(await page.locator('#reservieren a[href*="instagram.com"]').isVisible(), 'API fällt aus: kein Instagram-Ausweg');
});

/* --- 6. Sticky-Button nur mobil, nie im Weg ----------------------------- */
await scenario('Sticky-Button', async ({ page, site }) => {
  await open(page, site.base, '/index.html');
  const fab = page.locator('#reserveFab');
  // Der Knopf reagiert per IntersectionObserver, also asynchron. Unter Last (ganzer Prüflauf)
  // reichten feste 500 ms nicht; deshalb auf den Zustand warten, nicht auf eine Zeit.
  const hiddenIs = want => page.waitForFunction(w => document.getElementById('reserveFab').classList.contains('is-hidden') === w, want, { timeout: 4000 }).catch(() => {});
  await page.evaluate(() => document.getElementById('menu').scrollIntoView());
  await hiddenIs(false);
  check(await fab.isVisible() && !(await fab.evaluate(e => e.classList.contains('is-hidden'))), 'Sticky-Button fehlt im Menü-Abschnitt');
  const box = await fab.boundingBox();
  check(box && box.height >= 52, `Sticky-Button zu klein (${box?.height})`);
  check(new URL(await fab.getAttribute('href'), page.url()).pathname === '/reservieren/', 'Sticky-Button führt nicht zur Reservierungsseite');
  const wrong = await page.evaluate(() => [...document.querySelectorAll('a')].filter(a => /reserv/i.test(a.textContent) && new URL(a.href).pathname !== '/reservieren/').map(a => a.textContent.trim()));
  check(wrong.length === 0, `Startseite: Reservieren-Links führen nicht zur Unterseite: ${wrong.join(', ')}`);
  await page.evaluate(() => document.getElementById('reservieren').scrollIntoView());
  await hiddenIs(true);
  check(await fab.evaluate(e => e.classList.contains('is-hidden')), 'Sticky-Button steht neben dem Reservieren-Abschnitt');
  await page.evaluate(() => window.scrollTo(0, 0));
  await hiddenIs(true);
  check(await fab.evaluate(e => e.classList.contains('is-hidden')), 'Sticky-Button liegt über dem Hero');
});
await scenario('Kein Sticky-Button am Desktop', async ({ page, site }) => {
  await open(page, site.base, '/index.html');
  check(!(await page.locator('#reserveFab').isVisible()), 'Sticky-Button erscheint am Desktop');
}, { width: 1440, height: 900, mobile: false });

/* --- 7. Breiten: Formular und Ergebnis laufen nie über ------------------- */
for (const width of [320, 360, 390, 768, 1024, 1440]) {
  await scenario(`Breite ${width}`, async ({ page, site, adm }) => {
    await open(page, site.base);
    await page.waitForSelector('.rf-time');
    check(await overflow(page) <= 0, `@${width}px: Overflow im Formular (${await overflow(page)}px)`);
    const wide = await page.evaluate(() => [...document.querySelectorAll('#reservieren *')].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && !e.closest('.rf-days')).length);
    check(wide === 0, `@${width}px: ${wide} Elemente ragen aus dem Bildschirm`);
    await page.locator('.rf-time:has(input[value="19:00"])').click().catch(() => {});
    await page.fill('#name', 'Dagmar Sehr-Langer-Nachname-Mustermann-Beispiel'); await page.fill('#email', 'dagmar.sehr.lange.adresse@beispiel-domain-mit-langem-namen.example');
    await page.locator('#privacy').check();
    await page.locator('.rf-time:has(input[value="19:30"])').click();
    // Mit gewählter Zeit ist die Zusammenfassung in der Absenden-Leiste am längsten.
    check(await overflow(page) <= 0, `@${width}px: Overflow mit gewählter Zeit (${await overflow(page)}px)`);
    await page.locator('#rfSubmit').click();
    await page.waitForSelector('.rr');
    check(await overflow(page) <= 0, `@${width}px: Overflow im Ergebnis`);
  }, { width, height: width < 700 ? 800 : 900, mobile: width < 700 });
}

await browser.close();
report('Buchung', failures, checks);
