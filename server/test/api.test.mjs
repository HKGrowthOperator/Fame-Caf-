import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../app.mjs';

const ADMIN = 'test-admin-code-1234567890';

async function boot(opts = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'fame-'));
  const clock = { now: new Date('2026-10-10T10:00:00Z') };   // Sa 10.10.2026 12:00 Berlin
  const make = () => createApp({ dataDir, adminToken: ADMIN, clock: () => clock.now, ...opts });
  let app = make();
  const server = createServer(async (req, res) => { if (!(await app.handle(req, res))) res.writeHead(404).end(); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, {
      method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
    });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = null; }
    return { status: res.status, json, text, headers: res.headers };
  };
  const admin = (method, path, body) => call(method, `/api/admin${path}`, body, { Authorization: `Bearer ${ADMIN}` });
  return {
    call, admin, clock, dataDir, get app() { return app; },
    restart() { app.close(); app = make(); },
    async close() { app.close(); await new Promise(r => server.close(r)); rmSync(dataDir, { recursive: true, force: true }); }
  };
}

const guest = (over = {}) => ({ name: 'Anna Beispiel', phone: '+49 2261 12345', date: '2026-10-12', time: '19:00', party: 4, area: 'any', privacy: true, ...over });

test('Öffentliche Konfiguration und Verfügbarkeit', async () => {
  const s = await boot();
  try {
    const cfg = await s.call('GET', '/api/config');
    assert.equal(cfg.status, 200);
    assert.equal(cfg.json.durationMin, 90);
    assert.equal(cfg.json.today, '2026-10-10');
    assert.equal(cfg.json.instant, false);
    assert.equal(cfg.headers.get('cache-control'), 'no-store');
    const av = await s.call('GET', '/api/availability?date=2026-10-12&party=2');
    assert.equal(av.json.slots.length, 30);
    assert.equal((await s.call('GET', '/api/availability?date=kaputt&party=2')).status, 400);
    assert.equal((await s.call('GET', '/api/availability?date=2026-10-12&party=99')).status, 400);
    const days = await s.call('GET', '/api/days?party=2');
    assert.equal(days.json.days[0].date, '2026-10-10');
    assert.equal((await s.call('GET', '/api/nichts')).status, 404);
  } finally { await s.close(); }
});

test('Anfrage → Personal bestätigt → Gast sieht Status, Kalender, Storno', async () => {
  const s = await boot();
  try {
    const r = await s.call('POST', '/api/bookings', guest());
    assert.equal(r.status, 201);
    assert.equal(r.json.status, 'pending');
    assert.match(r.json.ref, /^[A-Z2-9]{5}$/);
    assert.equal(r.json.endTime, '20:30', 'anderthalb Stunden');
    assert.ok(r.json.token.length >= 20);
    assert.equal(r.json.statusPath, `?b=${r.json.id}.${r.json.token}#reservieren`);

    // fremder/falscher Schlüssel verrät nichts
    assert.equal((await s.call('GET', `/api/bookings/${r.json.id}?t=falsch`)).status, 404);
    assert.equal((await s.call('GET', `/api/bookings/gibtesnicht?t=${r.json.token}`)).status, 404);
    const view = await s.call('GET', `/api/bookings/${r.json.id}?t=${r.json.token}`);
    assert.equal(view.json.status, 'pending');
    assert.equal(view.json.phone, undefined, 'Gast-Ansicht enthält keine Kontaktdaten');
    assert.equal((await s.call('GET', `/api/bookings/${r.json.id}/ics?t=${r.json.token}`)).status, 409, 'ICS erst nach Bestätigung');

    // Personal
    const list = await s.admin('GET', '/bookings?status=pending');
    assert.equal(list.json.bookings.length, 1);
    assert.equal(list.json.bookings[0].token, undefined, 'Gästeschlüssel gehört nicht in die Personalliste');
    const ok = await s.admin('PATCH', `/bookings/${r.json.id}`, { status: 'confirmed' });
    assert.equal(ok.json.booking.status, 'confirmed');

    const ics = await s.call('GET', `/api/bookings/${r.json.id}/ics?t=${r.json.token}`);
    assert.equal(ics.status, 200);
    assert.match(ics.headers.get('content-type'), /text\/calendar/);
    assert.match(ics.text, /DTSTART:20261012T190000/);
    assert.match(ics.text, /DTEND:20261012T203000/);
    assert.match(ics.text, /UID:.*@fame-cafe/);

    const cancel = await s.call('POST', `/api/bookings/${r.json.id}/cancel`, { t: r.json.token });
    assert.equal(cancel.json.status, 'cancelled');
    assert.equal((await s.call('POST', `/api/bookings/${r.json.id}/cancel`, { t: r.json.token })).status, 409);
  } finally { await s.close(); }
});

test('Sitzt der Gast bereits, ist Storno über den Link nicht mehr möglich', async () => {
  const s = await boot();
  try {
    const r = await s.call('POST', '/api/bookings', guest());
    await s.admin('PATCH', `/bookings/${r.json.id}`, { status: 'seated' });
    assert.equal((await s.call('POST', `/api/bookings/${r.json.id}/cancel`, { t: r.json.token })).status, 409);
  } finally { await s.close(); }
});

test('Überbuchung ist ausgeschlossen, sobald Plätze hinterlegt sind', async () => {
  const s = await boot();
  try {
    assert.equal((await s.admin('PUT', '/settings', { seats: { indoor: 6, outdoor: 0 + 4 } })).status, 200);
    const a = await s.call('POST', '/api/bookings', guest({ party: 6, area: 'indoor' }));
    assert.equal(a.status, 201);
    const b = await s.call('POST', '/api/bookings', guest({ name: 'Ben Zwei', phone: '0151 999999', party: 2, area: 'indoor', time: '19:30' }));
    assert.equal(b.status, 409);
    assert.equal(b.json.error, 'area-unavailable');
    const c = await s.call('POST', '/api/bookings', guest({ name: 'Ben Zwei', phone: '0151 999999', party: 2, area: 'any', time: '19:30' }));
    assert.equal(c.status, 201, '„egal“ weicht nach draußen aus');
    const av = await s.call('GET', '/api/availability?date=2026-10-12&party=5');
    const slot = av.json.slots.find(x => x.time === '19:00');
    assert.deepEqual(slot.areas, { indoor: false, outdoor: false });
    assert.equal(slot.available, false);
    const full = await s.call('POST', '/api/bookings', guest({ name: 'Cem Drei', phone: '0151 111111', party: 5, time: '19:00' }));
    assert.equal(full.status, 409);
    assert.equal(full.json.error, 'slot-unavailable');
  } finally { await s.close(); }
});

test('Zeiten außerhalb des Rasters und geschlossene Tage werden serverseitig abgelehnt', async () => {
  const s = await boot();
  try {
    assert.equal((await s.call('POST', '/api/bookings', guest({ time: '19:10' }))).json.error, 'slot-unavailable');
    assert.equal((await s.call('POST', '/api/bookings', guest({ time: '22:00' }))).json.error, 'slot-unavailable', '22:00 + 90 min wäre nach Ladenschluss');
    assert.equal((await s.call('POST', '/api/bookings', guest({ date: '2026-10-08' }))).json.error, 'slot-unavailable');
    assert.equal((await s.call('POST', '/api/bookings', guest({ date: '2026-10-10', time: '12:30' }))).json.error, 'slot-unavailable', 'Vorlaufzeit');
    assert.equal((await s.call('POST', '/api/bookings', guest({ party: 9 }))).json.error, 'party-too-large');
  } finally { await s.close(); }
});

test('Datenschutz-Zustimmung ist Pflicht; Köderfeld speichert nichts', async () => {
  const s = await boot();
  try {
    const noConsent = await s.call('POST', '/api/bookings', guest({ privacy: false }));
    assert.equal(noConsent.status, 400);
    assert.equal(noConsent.json.error, 'privacy');
    const bot = await s.call('POST', '/api/bookings', guest({ website: 'http://spam.example' }));
    assert.equal(bot.status, 201);
    assert.equal((await s.admin('GET', '/bookings')).json.bookings.length, 0);
  } finally { await s.close(); }
});

test('Missbrauchsbremse: nach 6 Anfragen pro Stunde ist Schluss', async () => {
  const s = await boot();
  try {
    for (let i = 0; i < 6; i++) {
      const r = await s.call('POST', '/api/bookings', guest({ privacy: false }));
      assert.equal(r.status, 400);
    }
    assert.equal((await s.call('POST', '/api/bookings', guest())).status, 429);
  } finally { await s.close(); }
});

test('Doppelte Kontaktdaten: höchstens zwei Reservierungen pro Tag', async () => {
  const s = await boot();
  try {
    assert.equal((await s.call('POST', '/api/bookings', guest({ time: '12:00' }))).status, 201);
    assert.equal((await s.call('POST', '/api/bookings', guest({ time: '15:00' }))).status, 201);
    const third = await s.call('POST', '/api/bookings', guest({ time: '18:00' }));
    assert.equal(third.status, 409);
    assert.equal(third.json.error, 'duplicate');
  } finally { await s.close(); }
});

test('Sofortbuchung braucht Plätze; dann bestätigt das System selbst', async () => {
  const s = await boot();
  try {
    const noSeats = await s.admin('PUT', '/settings', { mode: 'instant' });
    assert.equal(noSeats.status, 400);
    assert.equal(noSeats.json.error, 'instant-needs-seats');
    assert.equal((await s.admin('PUT', '/settings', { mode: 'instant', seats: { indoor: 20 } })).status, 200);
    assert.equal((await s.call('GET', '/api/config')).json.instant, true);
    const r = await s.call('POST', '/api/bookings', guest({ area: 'indoor' }));
    assert.equal(r.json.status, 'confirmed');
  } finally { await s.close(); }
});

test('Verwaltung: Zugang, fehlender Code, Sperre nach Fehlversuchen', async () => {
  const s = await boot();
  try {
    assert.equal((await s.call('GET', '/api/admin/summary')).status, 401);
    assert.equal((await s.call('GET', '/api/admin/summary', undefined, { Authorization: 'Bearer falsch' })).status, 401);
    assert.equal((await s.admin('GET', '/summary')).status, 200);
    for (let i = 0; i < 9; i++) await s.call('GET', '/api/admin/summary', undefined, { Authorization: 'Bearer x' });
    assert.equal((await s.call('GET', '/api/admin/summary', undefined, { Authorization: 'Bearer x' })).status, 429);
  } finally { await s.close(); }
  const off = await boot({ adminToken: '' });
  try { assert.equal((await off.call('GET', '/api/admin/summary', undefined, { Authorization: 'Bearer irgendwas' })).status, 503); }
  finally { await off.close(); }
});

test('Verwaltung: manuelle Buchung, Verschieben mit Kapazitätsprüfung, Erzwingen', async () => {
  const s = await boot();
  try {
    await s.admin('PUT', '/settings', { seats: { indoor: 4 } });
    const m = await s.admin('POST', '/bookings', { name: 'Laufkundschaft', date: '2026-10-12', time: '19:15', party: 4, area: 'indoor' });
    assert.equal(m.status, 201, 'Personal darf zwischen die Rasterzeiten');
    assert.equal(m.json.booking.status, 'confirmed');
    assert.equal(m.json.booking.source, 'staff');
    const clash = await s.admin('POST', '/bookings', { name: 'Zu viel', date: '2026-10-12', time: '19:30', party: 2, area: 'indoor' });
    assert.equal(clash.status, 409);
    assert.equal(clash.json.error, 'full');
    const forced = await s.admin('POST', '/bookings', { name: 'Zu viel', date: '2026-10-12', time: '19:30', party: 2, area: 'indoor', force: true });
    assert.equal(forced.status, 201);
    const outside = await s.admin('POST', '/bookings', { name: 'Nachts', date: '2026-10-12', time: '22:30', party: 2 });
    assert.equal(outside.json.error, 'outside-hours');

    const r = await s.call('POST', '/api/bookings', guest({ time: '12:00', area: 'indoor' }));
    const move = await s.admin('PATCH', `/bookings/${r.json.id}`, { time: '19:30' });
    assert.equal(move.status, 409);
    assert.equal(move.json.canForce, true);
    const free = await s.admin('PATCH', `/bookings/${r.json.id}`, { time: '21:00' });
    assert.equal(free.status, 200);
    assert.equal(free.json.booking.time, '21:00');
    assert.equal(free.json.booking.endTime, '22:30');
  } finally { await s.close(); }
});

test('Sperren: wirken sofort, melden betroffene Buchungen, lassen sich löschen', async () => {
  const s = await boot();
  try {
    const r = await s.call('POST', '/api/bookings', guest({ time: '19:00' }));
    const blk = await s.admin('POST', '/blocks', { date: '2026-10-12', from: '18:00', to: '21:00', area: 'all', reason: 'Private Feier' });
    assert.equal(blk.status, 201);
    assert.equal(blk.json.conflicts.length, 1);
    assert.equal(blk.json.conflicts[0].ref, r.json.ref);
    const av = await s.call('GET', '/api/availability?date=2026-10-12&party=2');
    const t = Object.fromEntries(av.json.slots.map(x => [x.time, x.available]));
    assert.equal(t['16:30'], true);
    assert.equal(t['17:00'], false);
    assert.equal(t['20:30'], false);
    assert.equal(t['21:00'], true);
    assert.equal((await s.call('POST', '/api/bookings', guest({ name: 'Ben Zwei', phone: '0151 999999', time: '19:30' }))).json.error, 'slot-unavailable');
    assert.equal((await s.admin('POST', '/blocks', { date: '2026-10-12', from: '20:00', to: '19:00' })).status, 400);
    assert.equal((await s.admin('POST', '/blocks', { date: 'x' })).status, 400);
    assert.equal((await s.admin('GET', '/blocks')).json.blocks.length, 1);
    assert.equal((await s.admin('DELETE', `/blocks/${blk.json.block.id}`)).status, 200);
    assert.equal((await s.call('GET', '/api/availability?date=2026-10-12&party=2')).json.slots.find(x => x.time === '19:00').available, true);
  } finally { await s.close(); }
});

test('Ganztägige Sperre = „Heute geschlossen“', async () => {
  const s = await boot();
  try {
    await s.admin('POST', '/blocks', { date: '2026-10-13' });
    const av = await s.call('GET', '/api/availability?date=2026-10-13&party=2');
    assert.equal(av.json.slots.some(x => x.available), false);
    assert.equal((await s.call('GET', '/api/days?party=2')).json.days.find(d => d.date === '2026-10-13').available, false);
  } finally { await s.close(); }
});

test('Einstellungen werden geprüft und überleben einen Neustart samt Buchungen', async () => {
  const s = await boot();
  try {
    assert.equal((await s.admin('PUT', '/settings', { durationMin: 5 })).status, 400);
    assert.equal((await s.admin('PUT', '/settings', { seats: { indoor: -3 } })).status, 400);
    assert.equal((await s.admin('PUT', '/settings', { hours: { regular: { open: '10:00', close: '09:00' } } })).status, 400);
    assert.equal((await s.admin('PUT', '/settings', { maxParty: 10, seats: { indoor: 12 } })).status, 200);
    const r = await s.call('POST', '/api/bookings', guest({ party: 10 }));
    assert.equal(r.status, 201);
    s.restart();
    const list = await s.admin('GET', '/bookings');
    assert.equal(list.json.bookings.length, 1);
    assert.equal(list.json.bookings[0].party, 10);
    assert.equal((await s.admin('GET', '/settings')).json.settings.seats.indoor, 12);
    const view = await s.call('GET', `/api/bookings/${r.json.id}?t=${r.json.token}`);
    assert.equal(view.status, 200, 'Gäste-Link funktioniert nach Neustart weiter');
    // Datei ist gültiges JSON und enthält keine temporären Reste
    JSON.parse(readFileSync(join(s.dataDir, 'state.json'), 'utf8'));
  } finally { await s.close(); }
});

test('Alte Anfragen verfallen, personenbezogene Daten werden nach der Frist gelöscht', async () => {
  const s = await boot();
  try {
    const r = await s.call('POST', '/api/bookings', guest({ date: '2026-10-12', time: '12:00' }));
    // 12.10. 12:45 → Anfrage nie bearbeitet → verfallen
    s.clock.now = new Date('2026-10-12T10:45:00Z');
    s.app.tick();
    let b = (await s.admin('GET', '/bookings')).json.bookings[0];
    assert.equal(b.status, 'expired');
    assert.equal(b.name, 'Anna Beispiel');
    // 31 Tage später sind die Kontaktdaten weg, die Statistikfelder bleiben
    s.clock.now = new Date('2026-11-14T10:00:00Z');
    s.app.tick();
    b = (await s.admin('GET', '/bookings')).json.bookings[0];
    assert.equal(b.name, '');
    assert.equal(b.phone, '');
    assert.equal(b.note, '');
    assert.equal(b.party, 4);
    assert.equal(b.erased, true);
    assert.equal((await s.call('GET', `/api/bookings/${r.json.id}?t=${r.json.token}`)).status, 404, 'Gäste-Link ist erloschen');
    assert.doesNotMatch(readFileSync(join(s.dataDir, 'state.json'), 'utf8'), /Anna Beispiel|12345/);
  } finally { await s.close(); }
});

test('Benachrichtigung enthält keine Gästedaten', async () => {
  const hits = [];
  const hook = createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => { hits.push({ headers: req.headers, body: b }); res.end('ok'); }); });
  await new Promise(r => hook.listen(0, '127.0.0.1', r));
  const s = await boot({ notifyUrl: `http://127.0.0.1:${hook.address().port}/x`, notifyFormat: 'ntfy', publicBase: 'https://example.test' });
  try {
    await s.call('POST', '/api/bookings', guest());
    for (let i = 0; i < 20 && !hits.length; i++) await new Promise(r => setTimeout(r, 25));
    assert.equal(hits.length, 1);
    assert.match(hits[0].body, /Neue Reservierungsanfrage: Mo 12\.10\. 19:00, 4 Pers\./);
    assert.doesNotMatch(hits[0].body, /Anna|12345/);
    assert.equal(hits[0].headers.click, 'https://example.test/admin/');
  } finally { await s.close(); await new Promise(r => hook.close(r)); }
});

test('Kaputte oder zu große Eingaben bringen den Server nicht zu Fall', async () => {
  const s = await boot();
  try {
    assert.equal((await s.call('POST', '/api/bookings', '{kaputt')).status, 400);
    assert.equal((await s.call('POST', '/api/bookings', JSON.stringify({ name: 'x'.repeat(40_000) }))).status, 413);
    assert.equal((await s.call('POST', '/api/bookings', 'null')).status, 400);
    assert.equal((await s.call('POST', '/api/bookings', '[]')).status, 400);
    assert.equal((await s.call('GET', '/api/config')).status, 200);
  } finally { await s.close(); }
});

test('HTML in Namen wird als Text gespeichert und unverändert ausgeliefert (Ausgabe escaped der Client)', async () => {
  const s = await boot();
  try {
    const r = await s.call('POST', '/api/bookings', guest({ name: '<img src=x onerror=alert(1)>' }));
    assert.equal(r.status, 201);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.match(r.headers.get('content-type'), /application\/json/);
  } finally { await s.close(); }
});
