/* FAME CAFÉ — Reservierungslogik (rein, ohne I/O).

   Alles hier ist eine Funktion von (Einstellungen, Buchungen, Sperren, Zeit).
   Dadurch lässt sich die Logik ohne Server testen, und der Server bleibt dünn.

   Zeiten sind „Wanduhr in Gummersbach“: Datum als YYYY-MM-DD, Uhrzeit als
   HH:MM, intern Minuten seit Mitternacht. Ein Tag endet für Buchungen um
   24:00 — die Öffnungszeiten reichen nicht über Mitternacht. */

export const TIME_ZONE = 'Europe/Berlin';

/** Betriebsparameter. Die Zahlen mit Kommentar „bestätigt“ stammen vom Betreiber,
 *  alle anderen sind technische Startwerte, die im Verwaltungsbereich änderbar
 *  sind. Sitzplatzzahlen sind absichtlich leer: Sie zu erfinden würde
 *  Überbuchungsschutz vortäuschen, den es ohne echte Zahl nicht gibt. */
export const DEFAULT_SETTINGS = {
  durationMin: 90,          // bestätigt: anderthalb Stunden pro Reservierung
  slotStepMin: 30,
  minLeadMin: 60,
  maxDaysAhead: 60,
  maxParty: 8,
  mode: 'request',          // 'request' = Personal bestätigt, 'instant' = sofort verbindlich
  seats: { indoor: null, outdoor: null },
  hours: {
    // bestätigt: ab 12.10.2026 täglich 07:00–23:00, davor Eröffnungstage
    regular: { open: '07:00', close: '23:00', from: '2026-10-12' },
    special: {
      '2026-10-09': { open: '15:00', close: '23:00' },
      '2026-10-10': { open: '10:00', close: '23:00' },
      '2026-10-11': { open: '10:00', close: '22:00' }
    }
  },
  retentionDays: 30
};

export const AREAS = ['indoor', 'outdoor'];
export const ACTIVE = new Set(['pending', 'confirmed', 'seated']);
export const STATUSES = ['pending', 'confirmed', 'seated', 'completed', 'declined', 'cancelled', 'noshow', 'expired'];

/* -- Datum und Uhrzeit ---------------------------------------------------- */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export const isTime = s => typeof s === 'string' && TIME_RE.test(s);
export const toMin = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const toTime = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

const clockFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

/** Aktuelles Datum und Minute in Gummersbach — unabhängig von der Zeitzone des Servers. */
export function localNow(now = new Date()) {
  const p = Object.fromEntries(clockFmt.formatToParts(now).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minute: Number(p.hour) * 60 + Number(p.minute) };
}

/* -- Öffnungszeiten ------------------------------------------------------- */

/** { open, close } in Minuten oder null, wenn an dem Tag geschlossen ist. */
export function hoursFor(settings, date) {
  const { regular, special } = settings.hours;
  let h = null;
  if (Object.prototype.hasOwnProperty.call(special, date)) h = special[date];
  else if (date >= regular.from) h = regular;
  if (!h || !isTime(h.open) || !isTime(h.close)) return null;
  const open = toMin(h.open), close = toMin(h.close);
  return close > open ? { open, close } : null;
}

/* -- Belegung ------------------------------------------------------------- */

/** Höchste gleichzeitige Belegung in [s, e). items: {start, end, seats}. */
export function peak(items, s, e) {
  const rel = items.filter(i => i.start < e && i.end > s);
  if (!rel.length) return 0;
  const points = new Set([s]);
  for (const i of rel) if (i.start > s && i.start < e) points.add(i.start);
  let max = 0;
  for (const t of points) {
    let sum = 0;
    for (const i of rel) if (i.start <= t && i.end > t) sum += i.seats;
    if (sum > max) max = sum;
  }
  return max;
}

const blockApplies = (b, area) => b.area === 'all' || b.area === area;

/** Belegung/Sperren eines Tages in Rechenform. */
function dayLoad(date, bookings, blocks, skipId) {
  const used = { indoor: [], outdoor: [] };
  const hard = [];     // vollständige Sperren: { start, end, area }
  const soft = { indoor: [], outdoor: [] };  // Teilsperren (Plätze abziehen)
  for (const b of bookings) {
    if (b.date !== date || !ACTIVE.has(b.status) || b.id === skipId) continue;
    if (b.assignedArea && used[b.assignedArea]) {
      used[b.assignedArea].push({ start: toMin(b.time), end: toMin(b.time) + b.durationMin, seats: b.party });
    }
  }
  for (const bl of blocks) {
    if (bl.date !== date) continue;
    const start = toMin(bl.from), end = bl.to === '24:00' ? 1440 : toMin(bl.to);
    if (bl.seats == null) hard.push({ start, end, area: bl.area });
    else for (const a of AREAS) if (blockApplies(bl, a)) soft[a].push({ start, end, seats: bl.seats });
  }
  return { used, hard, soft };
}

/** Passt eine Gruppe in [s, e) in diesen Bereich? */
function areaFits(settings, load, area, s, e, party) {
  if (load.hard.some(h => blockApplies(h, area) && h.start < e && h.end > s)) return false;
  const cap = settings.seats[area];
  if (cap == null) return true;
  return cap - peak([...load.used[area], ...load.soft[area]], s, e) >= party;
}

/* -- Verfügbarkeit -------------------------------------------------------- */

/**
 * Zeitfenster eines Tages mit Verfügbarkeit je Bereich.
 * `late` markiert Zeiten, die nur wegen Vorlaufzeit/Uhrzeit nicht gehen — nicht wegen Belegung.
 * @returns {{ open:boolean, reason?:string, slots:Array<{time:string, available:boolean, late?:boolean, areas:{indoor:boolean,outdoor:boolean}}> }}
 */
export function availability(ctx, date, party, opts = {}) {
  const { settings, bookings, blocks } = ctx;
  const now = localNow(ctx.now);
  if (!isDate(date)) return { open: false, reason: 'invalid', slots: [] };
  if (date < now.date) return { open: false, reason: 'past', slots: [] };
  if (daysBetween(now.date, date) > settings.maxDaysAhead) return { open: false, reason: 'too-far', slots: [] };
  const h = hoursFor(settings, date);
  if (!h) return { open: false, reason: 'closed', slots: [] };

  const load = dayLoad(date, bookings, blocks, opts.skipId);
  const dur = settings.durationMin;
  const slots = [];
  for (let s = h.open; s + dur <= h.close; s += settings.slotStepMin) {
    const e = s + dur;
    const tooSoon = !opts.ignoreLead && date === now.date && s < now.minute + settings.minLeadMin;
    const areas = {};
    for (const a of AREAS) areas[a] = !tooSoon && areaFits(settings, load, a, s, e, party);
    slots.push({ time: toTime(s), available: areas.indoor || areas.outdoor, areas, ...(tooSoon ? { late: true } : {}) });
  }
  return { open: true, slots };
}

/** Kurzüberblick der kommenden Tage für die Datumsauswahl. */
export function daysOverview(ctx, party, count = 21) {
  const today = localNow(ctx.now).date;
  const out = [];
  for (let i = 0; i < count && i <= ctx.settings.maxDaysAhead; i++) {
    const date = addDays(today, i);
    const av = availability(ctx, date, party);
    const late = av.slots.length > 0 && av.slots.every(s => s.late);
    out.push({ date, open: av.open, available: av.slots.some(s => s.available), ...(late ? { late: true } : {}) });
  }
  return out;
}

/**
 * Wählt den Bereich für eine neue Buchung. `any` bekommt den Bereich mit den
 * meisten freien Plätzen; ohne hinterlegte Plätze bleibt die Zuweisung offen.
 * @returns {string|null|false} Bereich, null (ohne Plätze) oder false (nicht möglich)
 */
export function assignArea(ctx, { date, time, party, area }, opts = {}) {
  const { settings, bookings, blocks } = ctx;
  const load = dayLoad(date, bookings, blocks, opts.skipId);
  const s = toMin(time), e = s + settings.durationMin;
  const wanted = area === 'any' ? AREAS : [area];
  const fits = wanted.filter(a => areaFits(settings, load, a, s, e, party));
  if (!fits.length) return false;
  if (area !== 'any') return settings.seats[area] == null ? null : area;
  if (fits.every(a => settings.seats[a] == null)) return null;
  const free = a => settings.seats[a] == null ? Infinity : settings.seats[a] - peak([...load.used[a], ...load.soft[a]], s, e);
  return fits.sort((a, b) => free(b) - free(a))[0];
}

/* -- Eingaben prüfen ------------------------------------------------------ */

export class ValidationError extends Error {
  constructor(code, message, field) { super(message); this.code = code; this.field = field; }
}

const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F]/g;
export const clean = (v, max) => String(v ?? '').replace(CONTROL, '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanMultiline = (v, max) => String(v ?? '').replace(CONTROL, '').replace(/[ \t]+/g, ' ').trim().slice(0, max);

export function normalizePhone(v) {
  const s = clean(v, 30);
  if (!s) return '';
  if (!/^[+\d][\d\s()/.-]{4,}$/.test(s)) throw new ValidationError('phone', 'Bitte eine gültige Telefonnummer angeben.', 'phone');
  const digits = s.replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 16) throw new ValidationError('phone', 'Bitte eine gültige Telefonnummer angeben.', 'phone');
  return s;
}

export function normalizeEmail(v) {
  const s = clean(v, 120).toLowerCase();
  if (!s) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) throw new ValidationError('email', 'Bitte eine gültige E-Mail-Adresse angeben.', 'email');
  return s;
}

/** Prüft und bereinigt eine Buchungsanfrage. `staff` lockert die Kontaktpflicht. */
export function parseBookingInput(raw, settings, { staff = false } = {}) {
  const b = raw && typeof raw === 'object' ? raw : {};
  const name = clean(b.name, 60);
  if (name.length < 2) throw new ValidationError('name', 'Bitte gib einen Namen an.', 'name');
  const phone = normalizePhone(b.phone);
  const email = normalizeEmail(b.email);
  if (!staff && !phone && !email) throw new ValidationError('contact', 'Bitte gib eine Telefonnummer oder E-Mail-Adresse an, damit wir dich erreichen.', 'phone');
  if (!isDate(b.date)) throw new ValidationError('date', 'Bitte wähle ein Datum.', 'date');
  if (!isTime(b.time)) throw new ValidationError('time', 'Bitte wähle eine Uhrzeit.', 'time');
  const party = Number(b.party);
  if (!Number.isInteger(party) || party < 1) throw new ValidationError('party', 'Bitte gib die Personenzahl an.', 'party');
  const limit = staff ? 40 : settings.maxParty;
  if (party > limit) throw new ValidationError('party-too-large', `Online sind Reservierungen bis ${limit} Personen möglich. Für größere Gruppen schreib uns bitte auf Instagram.`, 'party');
  const area = b.area === undefined || b.area === '' ? 'any' : b.area;
  if (area !== 'any' && !AREAS.includes(area)) throw new ValidationError('area', 'Bitte wähle drinnen, draußen oder egal.', 'area');
  return { name, phone, email, date: b.date, time: b.time, party, area, note: cleanMultiline(b.note, 300) };
}

/* -- Kennungen ------------------------------------------------------------ */

const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  // ohne I, L, O, 0, 1
export function makeRef(randomBytes, taken) {
  for (let n = 0; n < 50; n++) {
    const bytes = randomBytes(5);
    const ref = Array.from(bytes, x => REF_ALPHABET[x % REF_ALPHABET.length]).join('');
    if (!taken.has(ref)) return ref;
  }
  throw new Error('Keine freie Kennung gefunden');
}
