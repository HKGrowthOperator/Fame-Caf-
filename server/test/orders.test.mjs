import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../app.mjs';
import { tableKey, priceOrder, DEFAULT_MENU, guestMenu, pickupSlots, normalizeMenu } from '../ordering.mjs';
import { DEFAULT_SETTINGS } from '../booking.mjs';

const ADMIN = 'test-admin-code-1234567890';
const SAT_NOON = '2026-10-10T10:00:00Z';   // Sa 10.10.2026 12:00 in Gummersbach, geöffnet 10–23

async function boot({ now = SAT_NOON, dataDir } = {}) {
  dataDir = dataDir || mkdtempSync(join(tmpdir(), 'fame-o-'));
  const clock = { now: new Date(now) };
  const make = () => createApp({ dataDir, adminToken: ADMIN, clock: () => clock.now });
  let app = make();
  const server = createServer(async (req, res) => { if (!(await app.handle(req, res))) res.writeHead(404).end(); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
    return { status: res.status, json, text };
  };
  const admin = (m, p, b) => call(m, `/api/admin${p}`, b, { Authorization: `Bearer ${ADMIN}` });
  return { call, admin, clock, dataDir, restart() { app.close(); app = make(); }, get app() { return app; },
    async close() { app.close(); await new Promise(r => server.close(r)); rmSync(dataDir, { recursive: true, force: true }); } };
}

/** Bestellen freischalten und Tisch-Schlüssel holen. */
async function enable(s, extra = {}) {
  const r = await s.admin('PUT', '/settings', { ordering: { enabled: true, tables: ['1', '2', 'A1'], ...extra } });
  assert.equal(r.status, 200, r.text);
  const t = await s.admin('GET', '/tables');
  return Object.fromEntries(t.json.tables.map(x => [x.label, x.key]));
}
const tableOrder = (keys, label, items, over = {}) => ({ mode: 'table', t: label, k: keys[label], items, ...over });

test('Reine Logik: Preise nur aus der Karte, ausverkaufte und preislose Artikel nie bestellbar', () => {
  const menu = JSON.parse(JSON.stringify(DEFAULT_MENU));
  const ok = priceOrder(menu, [{ id: 'espresso', qty: 2, priceCents: 1 }, { id: 'matcha-latte', qty: 1 }]);
  assert.equal(ok.totalCents, 2 * 280 + 550, 'mitgeschickter Preis wird ignoriert');
  assert.deepEqual(ok.items.map(i => i.priceCents), [280, 550]);
  assert.throws(() => priceOrder(menu, [{ id: 'bagel', qty: 1 }]), e => e.code === 'sold-out', 'ohne Preis nicht bestellbar');
  assert.throws(() => priceOrder(menu, [{ id: 'cake-bakery', qty: 1 }]), e => e.code === 'sold-out');
  menu.items.find(i => i.id === 'espresso').available = false;
  assert.throws(() => priceOrder(menu, [{ id: 'espresso', qty: 1 }]), e => e.code === 'sold-out' && e.soldOut[0] === 'Espresso');
  for (const bad of [[], null, [{ id: 'espresso', qty: 0 }], [{ id: 'cappuccino', qty: 11 }], [{ id: 'cappuccino', qty: 1.5 }], [{ id: 'cappuccino', qty: '2x' }],
    [{ id: 'gibtsnicht', qty: 1 }], [{ id: 'cappuccino', qty: 1 }, { id: 'cappuccino', qty: 1 }]]) {
    assert.throws(() => priceOrder(menu, bad), e => e.name === 'Error' && !!e.code, JSON.stringify(bad));
  }
  const many = [{ id: 'cappuccino', qty: 10 }, { id: 'flat-white', qty: 10 }, { id: 'iced-matcha', qty: 10 }, { id: 'matcha-latte', qty: 10 }, { id: 'tea-specials', qty: 1 }];
  assert.throws(() => priceOrder(menu, many), e => e.code === 'too-many', 'mehr als 40 Artikel');
});

test('Reine Logik: Gästekarte blendet Artikel ohne Preis aus', () => {
  const g = guestMenu(DEFAULT_MENU);
  const ids = g.flatMap(c => c.items.map(i => i.id));
  assert.ok(ids.includes('espresso') && ids.includes('acai-bowl'));
  assert.ok(!ids.includes('bagel') && !ids.includes('cake-bakery'), 'kein „Preis folgt“ in einer Bestellung');
  assert.ok(!g.some(c => !c.items.length), 'leere Kategorien erscheinen nicht');
});

test('Reine Logik: Tisch-Schlüssel hängen am Geheimnis und am Tisch', () => {
  assert.equal(tableKey('s1', '5'), tableKey('s1', '5'));
  assert.notEqual(tableKey('s1', '5'), tableKey('s1', '6'));
  assert.notEqual(tableKey('s1', '5'), tableKey('s2', '5'));
  assert.match(tableKey('s1', '5'), /^[0-9a-f]{12}$/);
});

test('Reine Logik: Abholzeiten im Raster, mit Vorlauf, bis Schluss', () => {
  const s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); s.ordering = { pickupLeadMin: 15, pickupStepMin: 15 };
  const slots = pickupSlots(s, new Date(SAT_NOON));            // 12:00 + 15 = 12:15
  assert.equal(slots[0], '12:15');
  assert.equal(slots.at(-1), '22:45');
  assert.deepEqual(pickupSlots(s, new Date('2026-10-10T21:50:00Z')), [], 'nach Schluss (23:50) nichts');
});

test('Karte prüfen: doppelte Artikel, unbekannte Kategorie, negative Preise', () => {
  const m = JSON.parse(JSON.stringify(DEFAULT_MENU));
  assert.doesNotThrow(() => normalizeMenu(m));
  assert.throws(() => normalizeMenu({ ...m, items: [...m.items, { ...m.items[0] }] }), /doppelt|Ungültig/);
  assert.throws(() => normalizeMenu({ ...m, items: [{ id: 'x', category: 'nix', name: 'X', priceCents: 100 }] }), /Kategorie/);
  assert.throws(() => normalizeMenu({ ...m, items: [{ id: 'x', category: 'coffee', name: 'X', priceCents: -5 }] }), /Preis/);
  assert.equal(normalizeMenu({ ...m, items: [{ id: 'x', category: 'coffee', name: '  X  ', priceCents: 0 }] }).items[0].priceCents, null, '0 = kein Preis');
});

test('Standard: Bestellen ist ausgeschaltet, bis das Personal die Karte freigibt', async () => {
  const s = await boot();
  try {
    const menu = await s.call('GET', '/api/order/menu');
    assert.equal(menu.json.canOrder, false);
    assert.equal(menu.json.reason, 'disabled');
    const o = await s.call('POST', '/api/orders', { mode: 'pickup', items: [{ id: 'espresso', qty: 1 }], name: 'Anna', pickupAt: 'asap', privacy: true });
    assert.equal(o.status, 409);
    // Freischalten ohne irgendeinen Modus geht nicht
    const none = await s.admin('PUT', '/settings', { ordering: { enabled: true, takeaway: false } });
    assert.equal(none.status, 400);
    assert.equal(none.json.error, 'no-mode');
  } finally { await s.close(); }
});

test('Freischalten braucht mindestens einen bestellbaren Artikel', async () => {
  const s = await boot();
  try {
    const m = (await s.admin('GET', '/menu')).json.menu;
    m.items.forEach(i => { i.available = false; });
    assert.equal((await s.admin('PUT', '/menu', m)).status, 200);
    const r = await s.admin('PUT', '/settings', { ordering: { enabled: true } });
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'no-items');
  } finally { await s.close(); }
});

test('Tisch-Bestellung: Preise vom Server, Nummer, Status, Gäste-Link', async () => {
  const s = await boot();
  try {
    const keys = await enable(s);
    const menu = await s.call('GET', `/api/order/menu?t=1&k=${keys['1']}`);
    assert.equal(menu.json.mode, 'table');
    assert.equal(menu.json.table, '1');
    assert.equal(menu.json.canOrder, true);

    const r = await s.call('POST', '/api/orders', tableOrder(keys, '1', [{ id: 'espresso', qty: 2, priceCents: 1 }, { id: 'matcha-latte', qty: 1 }], { totalCents: 1 }));
    assert.equal(r.status, 201, r.text);
    assert.equal(r.json.totalCents, 1110);
    assert.equal(r.json.number, 1);
    assert.equal(r.json.status, 'new');
    assert.ok(r.json.token.length >= 20);
    const r2 = await s.call('POST', '/api/orders', tableOrder(keys, 'A1', [{ id: 'acai-bowl', qty: 1 }]));
    assert.equal(r2.json.number, 2, 'laufende Nummer');

    assert.equal((await s.call('GET', `/api/orders/${r.json.id}?t=falsch`)).status, 404);
    const view = await s.call('GET', `/api/orders/${r.json.id}?t=${r.json.token}`);
    assert.equal(view.json.table, '1');
    assert.equal(view.json.name, undefined, 'Gäste-Ansicht ohne Personendaten');

    const list = await s.admin('GET', '/orders');
    assert.equal(list.json.orders.length, 2);
    assert.equal(list.json.orders[0].token, undefined, 'Schlüssel gehört nicht in die Personalliste');
    assert.equal((await s.admin('GET', '/summary')).json.newOrders, 2);

    // Gast darf nur stornieren, solange niemand angefangen hat
    await s.admin('PATCH', `/orders/${r2.json.id}`, { status: 'preparing' });
    assert.equal((await s.call('POST', `/api/orders/${r2.json.id}/cancel`, { t: r2.json.token })).status, 409);
    assert.equal((await s.call('POST', `/api/orders/${r.json.id}/cancel`, { t: r.json.token })).json.status, 'cancelled');
    assert.equal((await s.admin('PATCH', `/orders/${r2.json.id}`, { status: 'unsinn' })).status, 400);
    assert.equal((await s.admin('PATCH', `/orders/${r2.json.id}`, { status: 'ready' })).json.order.status, 'ready');
  } finally { await s.close(); }
});

test('Tisch-Schlüssel: falscher Schlüssel, fremder Tisch und fehlender Tisch werden abgelehnt', async () => {
  const s = await boot();
  try {
    const keys = await enable(s);
    assert.equal((await s.call('GET', '/api/order/menu?t=1&k=000000000000')).json.reason, 'bad-table');
    assert.equal((await s.call('GET', `/api/order/menu?t=77&k=${keys['1']}`)).json.reason, 'bad-table');
    assert.equal((await s.call('GET', `/api/order/menu?t=2&k=${keys['1']}`)).json.reason, 'bad-table', 'Schlüssel eines anderen Tisches');
    for (const body of [{ ...tableOrder(keys, '1', [{ id: 'espresso', qty: 1 }]), k: 'x' }, { ...tableOrder(keys, '1', [{ id: 'espresso', qty: 1 }]), t: '2' }, { mode: 'table', items: [{ id: 'espresso', qty: 1 }] }]) {
      assert.equal((await s.call('POST', '/api/orders', body)).status, 409);
    }
    assert.equal((await s.admin('GET', '/orders')).json.orders.length, 0);
  } finally { await s.close(); }
});

test('Tisch-Schlüssel bleiben nach einem Neustart gültig (gedruckte QR-Codes)', async () => {
  const s = await boot();
  try {
    const keys = await enable(s);
    s.restart();
    const again = (await s.admin('GET', '/tables')).json.tables;
    assert.equal(again.find(x => x.label === '1').key, keys['1']);
    assert.equal((await s.call('GET', `/api/order/menu?t=1&k=${keys['1']}`)).json.canOrder, true);
  } finally { await s.close(); }
});

test('Ausverkauft: Schnellschalter wirkt sofort, Gast sieht den Artikel gesperrt', async () => {
  const s = await boot();
  try {
    const keys = await enable(s);
    assert.equal((await s.admin('PATCH', '/menu/items/espresso', { available: false })).status, 200);
    const menu = await s.call('GET', `/api/order/menu?t=1&k=${keys['1']}`);
    const esp = menu.json.menu.flatMap(c => c.items).find(i => i.id === 'espresso');
    assert.equal(esp.available, false);
    const r = await s.call('POST', '/api/orders', tableOrder(keys, '1', [{ id: 'espresso', qty: 1 }, { id: 'cappuccino', qty: 1 }]));
    assert.equal(r.status, 409);
    assert.equal(r.json.error, 'sold-out');
    assert.match(r.json.message, /Espresso/);
    assert.equal((await s.admin('PATCH', '/menu/items/gibtsnicht', { available: false })).status, 404);
  } finally { await s.close(); }
});

test('Geschlossen und Pause', async () => {
  const s = await boot({ now: '2026-10-10T21:30:00Z' });   // 23:30 Gummersbach, nach Schluss
  try {
    const keys = await enable(s);
    assert.equal((await s.call('GET', `/api/order/menu?t=1&k=${keys['1']}`)).json.reason, 'closed');
    assert.equal((await s.call('POST', '/api/orders', tableOrder(keys, '1', [{ id: 'espresso', qty: 1 }]))).json.error, 'closed');
    assert.equal((await s.call('GET', '/api/order/menu')).json.reason, 'closed', 'auch Abholen nach Schluss nicht');
    s.clock.now = new Date(SAT_NOON);
    assert.equal((await s.call('GET', `/api/order/menu?t=1&k=${keys['1']}`)).json.canOrder, true);
    await s.admin('PUT', '/settings', { ordering: { paused: true } });
    const paused = await s.call('POST', '/api/orders', tableOrder(keys, '1', [{ id: 'espresso', qty: 1 }]));
    assert.equal(paused.status, 409);
    assert.equal(paused.json.error, 'paused');
    assert.equal((await s.call('GET', `/api/order/menu?t=1&k=${keys['1']}`)).json.reason, 'paused');
  } finally { await s.close(); }
});

test('Mitnehmen/Abholen: Name, Datenschutz, Abholzeit, Vorbestellung vor Öffnung', async () => {
  const s = await boot();
  try {
    await enable(s);
    const menu = await s.call('GET', '/api/order/menu');
    assert.equal(menu.json.mode, 'pickup');
    assert.equal(menu.json.pickup.asap, true);
    assert.equal(menu.json.pickup.slots[0], '12:15');
    const base = { mode: 'pickup', items: [{ id: 'flat-white', qty: 1 }], name: 'Anna', phone: '0176 1234567', pickupAt: '13:00', privacy: true };
    const bad = async (patch, code) => { const r = await s.call('POST', '/api/orders', { ...base, ...patch }); assert.equal(r.status >= 400, true, code); assert.equal(r.json.error, code, JSON.stringify(patch)); };
    await bad({ name: '' }, 'name');
    await bad({ privacy: false }, 'privacy');
    await bad({ pickupAt: '12:05' }, 'pickup-time');
    await bad({ pickupAt: '09:00' }, 'pickup-time');
    await bad({ pickupAt: undefined }, 'pickup-time');
    await bad({ phone: 'abc' }, 'phone');
    const ok = await s.call('POST', '/api/orders', base);
    assert.equal(ok.status, 201, ok.text);
    assert.equal(ok.json.pickupAt, '13:00');
    const asap = await s.call('POST', '/api/orders', { ...base, pickupAt: 'asap' });
    assert.equal(asap.json.pickupAt, 'asap');
    const staff = (await s.admin('GET', '/orders')).json.orders;
    assert.equal(staff[0].name, 'Anna');
    assert.equal(staff[0].phone, '0176 1234567');

    // Morgens vor Öffnung (So 11.10. 08:00, geöffnet ab 10:00): vorbestellen ja, „sofort“ nein
    s.clock.now = new Date('2026-10-11T06:00:00Z');
    const early = await s.call('GET', '/api/order/menu');
    assert.equal(early.json.canOrder, true);
    assert.equal(early.json.pickup.asap, false);
    assert.equal(early.json.pickup.slots[0], '10:00');
    assert.equal((await s.call('POST', '/api/orders', { ...base, pickupAt: 'asap' })).json.error, 'pickup-time');
    assert.equal((await s.call('POST', '/api/orders', { ...base, pickupAt: '10:30' })).status, 201);
  } finally { await s.close(); }
});

test('Abholen ist abschaltbar; reine Tisch-Seite ohne Tisch-Code bestellt nichts', async () => {
  const s = await boot();
  try {
    const keys = await enable(s, { takeaway: false });
    const menu = await s.call('GET', '/api/order/menu');
    assert.equal(menu.json.canOrder, false);
    assert.equal(menu.json.reason, 'no-mode');
    assert.equal((await s.call('GET', `/api/order/menu?t=1&k=${keys['1']}`)).json.canOrder, true);
  } finally { await s.close(); }
});

test('Pro Tisch höchstens fünf offene Bestellungen; Köderfeld speichert nichts', async () => {
  const s = await boot();
  try {
    const keys = await enable(s);
    for (let i = 0; i < 5; i++) assert.equal((await s.call('POST', '/api/orders', tableOrder(keys, '1', [{ id: 'espresso', qty: 1 }]))).status, 201);
    const sixth = await s.call('POST', '/api/orders', tableOrder(keys, '1', [{ id: 'espresso', qty: 1 }]));
    assert.equal(sixth.status, 409);
    assert.equal(sixth.json.error, 'table-busy');
    assert.equal((await s.call('POST', '/api/orders', tableOrder(keys, '2', [{ id: 'espresso', qty: 1 }]))).status, 201, 'anderer Tisch geht');
    const before = (await s.admin('GET', '/orders')).json.orders.length;
    const bot = await s.call('POST', '/api/orders', tableOrder(keys, '2', [{ id: 'espresso', qty: 1 }], { website: 'x' }));
    assert.equal(bot.status, 201);
    assert.equal((await s.admin('GET', '/orders')).json.orders.length, before);
  } finally { await s.close(); }
});

test('Karte pflegen: Preis ändern wirkt sofort, ungültige Karte wird abgelehnt', async () => {
  const s = await boot();
  try {
    const keys = await enable(s);
    const m = (await s.admin('GET', '/menu')).json.menu;
    m.items.find(i => i.id === 'bagel').priceCents = 650;
    m.items.find(i => i.id === 'espresso').priceCents = 300;
    assert.equal((await s.admin('PUT', '/menu', m)).status, 200);
    const r = await s.call('POST', '/api/orders', tableOrder(keys, '1', [{ id: 'bagel', qty: 1 }, { id: 'espresso', qty: 1 }]));
    assert.equal(r.json.totalCents, 950);
    m.items.push({ ...m.items[0] });
    assert.equal((await s.admin('PUT', '/menu', m)).status, 400);
    assert.equal((await s.admin('PUT', '/menu', { categories: [], items: 'x' })).status, 400);
  } finally { await s.close(); }
});

test('Ältere Speicherdatei (nur Reservierungen) wird ergänzt, nichts geht verloren', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'fame-legacy-'));
  const legacy = { version: 1, settings: { durationMin: 90, maxParty: 6 }, bookings: { b1: { id: 'b1', ref: 'ABCDE', token: 't', createdAt: '2026-10-09T10:00:00Z', date: '2026-10-12', time: '19:00', party: 3, name: 'Alt', phone: '0151 1', email: '', note: '', status: 'confirmed', durationMin: 90, area: 'any', assignedArea: null, history: [] } }, blocks: {} };
  writeFileSync(join(dataDir, 'state.json'), JSON.stringify(legacy));
  const s = await boot({ dataDir });
  try {
    const list = (await s.admin('GET', '/bookings')).json.bookings;
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'Alt');
    assert.equal((await s.admin('GET', '/settings')).json.settings.maxParty, 6, 'bestehende Einstellung bleibt');
    assert.equal((await s.admin('GET', '/settings')).json.settings.ordering.enabled, false);
    assert.ok((await s.admin('GET', '/menu')).json.menu.items.length > 0);
    const onDisk = JSON.parse(readFileSync(join(dataDir, 'state.json'), 'utf8'));
    assert.ok(onDisk.tableSecret && onDisk.tableSecret.length >= 32, 'Geheimnis sofort gespeichert');
  } finally { await s.close(); }
});

test('Aufräumen: alte offene Bestellung wird geschlossen, Personendaten nach Frist gelöscht', async () => {
  const s = await boot();
  try {
    await enable(s);
    const base = { mode: 'pickup', items: [{ id: 'espresso', qty: 1 }], name: 'Bea', phone: '0176 5555555', pickupAt: 'asap', privacy: true };
    const o = await s.call('POST', '/api/orders', base);
    s.clock.now = new Date('2026-10-11T10:00:00Z');
    s.app.tick();
    let list = (await s.admin('GET', '/orders')).json.orders;
    assert.equal(list.length, 0, 'gestern, nicht mehr offen, nicht von heute');
    s.clock.now = new Date('2026-11-14T10:00:00Z');
    s.app.tick();
    assert.equal((await s.call('GET', `/api/orders/${o.json.id}?t=${o.json.token}`)).status, 404, 'Link erloschen');
    assert.doesNotMatch(readFileSync(join(s.dataDir, 'state.json'), 'utf8'), /Bea|5555555/);
  } finally { await s.close(); }
});

test('Benachrichtigung enthält keine Namen', async () => {
  const hits = [];
  const hook = createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => { hits.push(b); res.end('ok'); }); });
  await new Promise(r => hook.listen(0, '127.0.0.1', r));
  const dataDir = mkdtempSync(join(tmpdir(), 'fame-n-'));
  const clock = { now: new Date(SAT_NOON) };
  const app = createApp({ dataDir, adminToken: ADMIN, clock: () => clock.now, notifyUrl: `http://127.0.0.1:${hook.address().port}/x`, notifyFormat: 'ntfy' });
  const server = createServer(async (req, res) => { if (!(await app.handle(req, res))) res.writeHead(404).end(); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fetch(`${base}/api/admin/settings`, { method: 'PUT', headers: { Authorization: `Bearer ${ADMIN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ordering: { enabled: true } }) });
    await fetch(`${base}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'pickup', items: [{ id: 'espresso', qty: 2 }], name: 'Geheimname', pickupAt: 'asap', privacy: true }) });
    for (let i = 0; i < 20 && !hits.length; i++) await new Promise(r => setTimeout(r, 25));
    assert.equal(hits.length, 1);
    assert.match(hits[0], /Neue Bestellung Nr\. 1 · Abholung sofort · 2 Artikel · 5,60 €/);
    assert.doesNotMatch(hits[0], /Geheimname/);
  } finally { app.close(); await new Promise(r => server.close(r)); await new Promise(r => hook.close(r)); rmSync(dataDir, { recursive: true, force: true }); }
});
