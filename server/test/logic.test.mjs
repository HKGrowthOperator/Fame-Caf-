import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS, availability, assignArea, hoursFor, localNow, peak, daysOverview,
  parseBookingInput, ValidationError, addDays, daysBetween, isDate
} from '../booking.mjs';

const clone = v => JSON.parse(JSON.stringify(v));
// Sa 10.10.2026 12:00 in Gummersbach (MESZ = UTC+2)
const NOW = new Date('2026-10-10T10:00:00Z');
const make = (over = {}, bookings = [], blocks = []) => ({
  settings: { ...clone(DEFAULT_SETTINGS), ...over, seats: { indoor: null, outdoor: null, ...(over.seats || {}) } },
  bookings, blocks, now: NOW
});
const bk = (o) => ({ id: Math.random().toString(36), status: 'confirmed', durationMin: 90, assignedArea: 'indoor', ...o });
const times = av => av.slots.filter(s => s.available).map(s => s.time);

test('localNow rechnet in Berliner Zeit, auch über Mitternacht und Zeitumstellung', () => {
  assert.deepEqual(localNow(new Date('2026-10-10T10:00:00Z')), { date: '2026-10-10', minute: 720 });
  assert.deepEqual(localNow(new Date('2026-10-10T22:30:00Z')), { date: '2026-10-11', minute: 30 });
  // 25.10.2026 endet die Sommerzeit: danach MEZ = UTC+1
  assert.deepEqual(localNow(new Date('2026-10-25T23:30:00Z')), { date: '2026-10-26', minute: 30 });
});

test('Datumsrechnung', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-10-10', '2026-10-12'), 2);
  assert.equal(isDate('2026-02-30'), false);
  assert.equal(isDate('2026-10-10'), true);
});

test('Öffnungszeiten: Eröffnungstage, regulär ab 12.10., davor geschlossen', () => {
  const s = clone(DEFAULT_SETTINGS);
  assert.deepEqual(hoursFor(s, '2026-10-09'), { open: 900, close: 1380 });
  assert.deepEqual(hoursFor(s, '2026-10-10'), { open: 600, close: 1380 });
  assert.deepEqual(hoursFor(s, '2026-10-11'), { open: 600, close: 1320 });
  assert.deepEqual(hoursFor(s, '2026-10-12'), { open: 420, close: 1380 });
  assert.deepEqual(hoursFor(s, '2027-03-07'), { open: 420, close: 1380 }, 'Sonntag ist regulär offen: täglich');
  assert.equal(hoursFor(s, '2026-10-08'), null);
  s.hours.special['2026-12-24'] = null;
  assert.equal(hoursFor(s, '2026-12-24'), null, 'null = ausdrücklich geschlossen');
});

test('Zeitfenster: letzter Start liegt Dauer vor Ladenschluss, Raster 30 min', () => {
  const av = availability(make(), '2026-10-12', 2);
  assert.equal(av.open, true);
  assert.equal(av.slots[0].time, '07:00');
  assert.equal(av.slots.at(-1).time, '21:30', '21:30 + 90 min = 23:00');
  assert.equal(av.slots.length, 30);
});

test('Heute: Vorlaufzeit wird berücksichtigt (12:00 + 60 min → ab 13:00)', () => {
  const av = availability(make(), '2026-10-10', 2);
  assert.equal(times(av)[0], '13:00');
  assert.equal(av.slots.find(s => s.time === '12:30').available, false);
  assert.equal(av.slots.find(s => s.time === '12:30').late, true, 'zu spät ≠ ausgebucht');
  assert.equal(av.slots.find(s => s.time === '13:00').late, undefined);
  const full = make({ seats: { indoor: 2, outdoor: 2 } }, [bk({ date: '2026-10-12', time: '19:00', party: 2 }), bk({ date: '2026-10-12', time: '19:00', party: 2, assignedArea: 'outdoor' })]);
  assert.equal(availability(full, '2026-10-12', 2).slots.find(s => s.time === '19:00').late, undefined, 'ausgebucht ist nicht „late“');
});

test('Vergangenheit, zu weit voraus und geschlossene Tage', () => {
  assert.equal(availability(make(), '2026-10-09', 2).reason, 'past');
  assert.equal(availability(make(), '2027-03-01', 2).reason, 'too-far');
  const c = make(); c.settings.hours.special['2026-10-20'] = null;
  assert.equal(availability(c, '2026-10-20', 2).reason, 'closed');
});

test('Kapazität: Belegung zählt 90 min, Ende ist exklusiv', () => {
  const c = make({ seats: { indoor: 10 } }, [bk({ date: '2026-10-12', time: '19:00', party: 6 })]);
  const t = Object.fromEntries(availability(c, '2026-10-12', 5).slots.map(s => [s.time, s.areas.indoor]));
  assert.equal(t['17:30'], true, '17:30–19:00 endet genau, wenn die andere Gruppe beginnt');
  assert.equal(t['18:00'], false);
  assert.equal(t['19:00'], false);
  assert.equal(t['20:00'], false, 'überlappt 20:00–20:30');
  assert.equal(t['20:30'], true, 'Tisch ist um 20:30 wieder frei');
  const small = Object.fromEntries(availability(c, '2026-10-12', 4).slots.map(s => [s.time, s.areas.indoor]));
  assert.equal(small['19:00'], true, '6 + 4 = 10 passt');
});

test('Kapazität: zwei kleine Buchungen nacheinander, Spitze statt Summe', () => {
  // 18:00–19:30 (6) und 19:30–21:00 (6) berühren sich nur — nie mehr als 6 gleichzeitig
  const items = [{ start: 1080, end: 1170, seats: 6 }, { start: 1170, end: 1260, seats: 6 }];
  assert.equal(peak(items, 1080, 1260), 6);
  assert.equal(peak(items, 1110, 1200), 6);
});

test('Nicht-aktive Buchungen belegen nichts', () => {
  const c = make({ seats: { indoor: 4 } }, ['declined', 'cancelled', 'noshow', 'expired', 'completed'].map(status => bk({ status, date: '2026-10-12', time: '19:00', party: 4 })));
  assert.equal(availability(c, '2026-10-12', 4).slots.find(s => s.time === '19:00').areas.indoor, true);
  c.bookings.push(bk({ status: 'pending', date: '2026-10-12', time: '19:00', party: 4 }));
  assert.equal(availability(c, '2026-10-12', 4).slots.find(s => s.time === '19:00').areas.indoor, false, 'Anfragen halten den Platz');
});

test('Bereiche getrennt; „egal“ wählt den freieren', () => {
  const c = make({ seats: { indoor: 6, outdoor: 10 } }, [bk({ date: '2026-10-12', time: '12:00', party: 5, assignedArea: 'indoor' })]);
  const slot = availability(c, '2026-10-12', 3).slots.find(s => s.time === '12:00');
  assert.deepEqual(slot.areas, { indoor: false, outdoor: true });
  assert.equal(slot.available, true);
  assert.equal(assignArea(c, { date: '2026-10-12', time: '12:00', party: 3, area: 'any' }), 'outdoor');
  assert.equal(assignArea(c, { date: '2026-10-12', time: '12:00', party: 3, area: 'indoor' }), false);
  assert.equal(assignArea(c, { date: '2026-10-12', time: '12:00', party: 1, area: 'indoor' }), 'indoor');
});

test('Ohne hinterlegte Plätze bleibt die Zuweisung offen und nichts wird als voll gemeldet', () => {
  const c = make({}, [bk({ date: '2026-10-12', time: '19:00', party: 8, assignedArea: null })]);
  assert.equal(availability(c, '2026-10-12', 8).slots.find(s => s.time === '19:00').available, true);
  assert.equal(assignArea(c, { date: '2026-10-12', time: '19:00', party: 2, area: 'any' }), null);
});

test('Sperren: ganzer Tag, Zeitraum je Bereich, Teilsperre mit Plätzen', () => {
  const day = make({ seats: { indoor: 10, outdoor: 10 } }, [], [{ id: 'b1', date: '2026-10-12', from: '00:00', to: '24:00', area: 'all', seats: null }]);
  const av = availability(day, '2026-10-12', 2);
  assert.equal(av.open, true);
  assert.equal(times(av).length, 0);

  const range = make({ seats: { indoor: 10, outdoor: 10 } }, [], [{ id: 'b2', date: '2026-10-12', from: '18:00', to: '20:00', area: 'indoor', seats: null }]);
  const r = Object.fromEntries(availability(range, '2026-10-12', 2).slots.map(s => [s.time, s.areas]));
  assert.equal(r['16:30'].indoor, true, '16:30–18:00 endet genau bei Beginn der Sperre');
  assert.equal(r['17:00'].indoor, false);
  assert.equal(r['19:30'].indoor, false);
  assert.equal(r['20:00'].indoor, true);
  assert.equal(r['19:00'].outdoor, true, 'draußen bleibt frei');

  const partial = make({ seats: { indoor: 10 } }, [], [{ id: 'b3', date: '2026-10-12', from: '12:00', to: '14:00', area: 'indoor', seats: 8 }]);
  const p = Object.fromEntries(availability(partial, '2026-10-12', 3).slots.map(s => [s.time, s.areas.indoor]));
  assert.equal(p['12:00'], false, '10 − 8 = 2 frei, Gruppe von 3 passt nicht');
  assert.equal(Object.fromEntries(availability(partial, '2026-10-12', 2).slots.map(s => [s.time, s.areas.indoor]))['12:00'], true);
});

test('Tagesübersicht markiert geschlossene und volle Tage', () => {
  const c = make({}, [], [{ id: 'x', date: '2026-10-13', from: '00:00', to: '24:00', area: 'all', seats: null }]);
  const days = daysOverview(c, 2, 5);
  assert.equal(days[0].date, '2026-10-10');
  assert.equal(days.find(d => d.date === '2026-10-13').available, false);
  assert.equal(days.find(d => d.date === '2026-10-12').available, true);
});

test('Eingabeprüfung', () => {
  const s = clone(DEFAULT_SETTINGS);
  const ok = { name: '  Anna   Beispiel ', phone: '+49 2261 12345', date: '2026-10-12', time: '19:00', party: 4, area: 'indoor' };
  const parsed = parseBookingInput(ok, s);
  assert.equal(parsed.name, 'Anna Beispiel');
  const bad = (patch, code) => assert.throws(() => parseBookingInput({ ...ok, ...patch }, s), e => e instanceof ValidationError && e.code === code, code);
  bad({ name: 'A' }, 'name');
  bad({ phone: '', email: '' }, 'contact');
  bad({ phone: 'abc' }, 'phone');
  bad({ email: 'kein-mail', phone: '' }, 'email');
  bad({ date: '2026-13-01' }, 'date');
  bad({ time: '25:00' }, 'time');
  bad({ party: 0 }, 'party');
  bad({ party: 2.5 }, 'party');
  bad({ party: 9 }, 'party-too-large');
  bad({ area: 'dach' }, 'area');
  assert.equal(parseBookingInput({ ...ok, phone: '', email: 'A@B.de' }, s).email, 'a@b.de');
  assert.equal(parseBookingInput({ ...ok, note: 'x'.repeat(500) }, s).note.length, 300);
  assert.equal(parseBookingInput({ ...ok, name: 'Ann\u0000a\u0007' }, s).name, 'Anna', 'Steuerzeichen entfernt');
  assert.equal(parseBookingInput({ ...ok, party: 20 }, s, { staff: true }).party, 20, 'Personal darf größere Gruppen eintragen');
});
