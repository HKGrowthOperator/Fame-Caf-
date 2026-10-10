/* FAME CAFÉ — Reservierungs-API.

   createApp() liefert einen Request-Handler für alles unter /api. Der Server
   (index.mjs) und die Tests nutzen dieselbe Funktion, damit getestet wird, was
   auch läuft. Keine Abhängigkeiten.

   Datenschutz im Design:
   - IP-Adressen werden nur für die Missbrauchsbremse im Arbeitsspeicher
     gehalten und nie gespeichert.
   - Benachrichtigungen an Dritte (Webhook) enthalten keine Gästedaten.
   - Personenbezogene Felder werden nach `retentionDays` gelöscht. */

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { openStore } from './store.mjs';
import {
  AREAS, ACTIVE, STATUSES, availability, daysOverview, assignArea, hoursFor, localNow,
  parseBookingInput, ValidationError, isDate, isTime, toMin, toTime, addDays, daysBetween,
  makeRef, clean
} from './booking.mjs';

const MAX_BODY = 16 * 1024;
const WEEKDAY = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export function createApp(options = {}) {
  const {
    dataDir,
    adminToken = '',
    notifyUrl = '',
    notifyFormat = 'json',
    publicBase = '',
    proxyHops = 1,
    clock = () => new Date(),
    random = randomBytes,
    log = () => {}
  } = options;

  const store = openStore(dataDir);
  const ctx = () => ({ settings: store.settings, bookings: store.bookingList(), blocks: store.blockList(), now: clock() });

  /* -- Missbrauchsbremse (nur Arbeitsspeicher) ---------------------------- */
  const buckets = new Map();
  function limited(key, max, windowMs) {
    const t = clock().getTime();
    let b = buckets.get(key);
    if (!b || b.reset <= t) { b = { n: 0, reset: t + windowMs }; buckets.set(key, b); }
    b.n++;
    return b.n > max;
  }
  function pruneBuckets() {
    const t = clock().getTime();
    for (const [k, b] of buckets) if (b.reset <= t) buckets.delete(k);
  }

  function clientIp(req) {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
    if (xff.length) return xff[Math.max(0, xff.length - 1 - proxyHops)] || xff[0];
    return req.socket.remoteAddress || 'unknown';
  }

  /* -- Antworten ---------------------------------------------------------- */
  function send(res, status, body, headers = {}) {
    const isText = typeof body === 'string';
    res.writeHead(status, {
      'Content-Type': isText ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers
    });
    res.end(isText ? body : JSON.stringify(body));
  }
  const fail = (res, status, code, message, extra = {}) => send(res, status, { error: code, message, ...extra });

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0, done = false;
      req.on('data', c => {
        if (done) return;
        size += c.length;
        if (size > MAX_BODY) { done = true; chunks.length = 0; reject(Object.assign(new Error('too large'), { status: 413 })); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (done) return;
        if (!size) return resolve({});
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
          resolve(parsed);
        } catch { reject(Object.assign(new Error('invalid json'), { status: 400 })); }
      });
      req.on('error', err => { if (!done) { done = true; reject(err); } });
    });
  }

  /* -- Hilfen ------------------------------------------------------------- */
  const sha = s => createHash('sha256').update(String(s)).digest();
  const sameSecret = (a, b) => timingSafeEqual(sha(a), sha(b));
  const newId = () => random(8).toString('hex');
  const newToken = () => random(18).toString('base64url');

  const endTime = b => toTime(Math.min(toMin(b.time) + b.durationMin, 1440));
  function guestView(b) {
    return {
      ref: b.ref, status: b.status, date: b.date, time: b.time, endTime: endTime(b),
      party: b.party, area: b.area, name: b.name, durationMin: b.durationMin
    };
  }
  const staffView = b => ({ ...b, endTime: endTime(b), token: undefined });

  const digits = s => String(s || '').replace(/\D/g, '');
  const contactKeys = b => [digits(b.phone) && `p:${digits(b.phone)}`, b.email && `e:${b.email}`].filter(Boolean);

  function history(b, by, action, detail = '') {
    b.history = b.history || [];
    b.history.push({ at: clock().toISOString(), by, action, detail });
    if (b.history.length > 30) b.history.shift();
  }

  function dayLabel(date) {
    const d = new Date(`${date}T00:00:00Z`);
    return `${WEEKDAY[d.getUTCDay()]} ${date.slice(8, 10)}.${date.slice(5, 7)}.`;
  }

  /** Benachrichtigung ohne Gästedaten: Das Ziel kann ein öffentlicher Kanal sein. */
  async function notify(event, text) {
    if (!notifyUrl) return;
    const link = publicBase ? `${publicBase.replace(/\/$/, '')}/admin/` : '';
    try {
      const signal = AbortSignal.timeout(5000);
      if (notifyFormat === 'ntfy') {
        await fetch(notifyUrl, { method: 'POST', body: text, headers: { Title: 'FAME Reservierung', ...(link ? { Click: link } : {}) }, signal });
      } else {
        await fetch(notifyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event, text, url: link }), signal });
      }
    } catch (err) {
      log(`Benachrichtigung fehlgeschlagen: ${err.message}`);
    }
  }

  /* -- Pflege: abgelaufene Anfragen, Datenlöschung ------------------------ */
  function tick() {
    const now = localNow(clock());
    let changed = false;
    for (const b of store.bookingList()) {
      if (b.status === 'pending' && (b.date < now.date || (b.date === now.date && toMin(b.time) + 30 < now.minute))) {
        b.status = 'expired'; history(b, 'system', 'expired'); changed = true;
      }
      if (b.name !== '' && daysBetween(b.date, now.date) > store.settings.retentionDays) {
        b.name = ''; b.phone = ''; b.email = ''; b.note = ''; b.staffNote = ''; b.token = ''; b.history = []; b.erased = true;
        changed = true;
      }
    }
    for (const bl of store.blockList()) {
      if (daysBetween(bl.date, now.date) > 90) { delete store.state.blocks[bl.id]; changed = true; }
    }
    if (changed) store.save();
    pruneBuckets();
  }
  tick();
  const timer = setInterval(() => { try { tick(); } catch (e) { log(e.stack); } }, 30 * 60 * 1000);
  timer.unref?.();

  /* -- Öffentliche Endpunkte ---------------------------------------------- */
  function publicConfig() {
    const s = store.settings;
    return {
      durationMin: s.durationMin, maxParty: s.maxParty, maxDaysAhead: s.maxDaysAhead,
      slotStepMin: s.slotStepMin, instant: s.mode === 'instant' && AREAS.some(a => s.seats[a] != null),
      today: localNow(clock()).date
    };
  }

  function parseParty(url, max) {
    const n = Number(url.searchParams.get('party') || 2);
    return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
  }

  function createBooking(input, { staff, force = false, status } = {}) {
    const c = ctx();
    const { settings } = c;
    let assigned;
    if (staff) {
      const h = hoursFor(settings, input.date);
      const s = toMin(input.time);
      if (!force && (!h || s < h.open || s + settings.durationMin > h.close)) {
        throw Object.assign(new ValidationError('outside-hours', 'Die Uhrzeit liegt außerhalb der Öffnungszeiten (inkl. Dauer).', 'time'), { status: 409 });
      }
      assigned = assignArea(c, input);
      if (assigned === false && !force) {
        throw Object.assign(new ValidationError('full', 'Zu dieser Zeit ist nicht genug Platz oder der Bereich ist gesperrt.', 'time'), { status: 409 });
      }
      if (assigned === false) assigned = input.area === 'any' ? null : input.area;
    } else {
      const av = availability(c, input.date, input.party);
      const slot = av.slots.find(s => s.time === input.time);
      if (!av.open || !slot || !slot.available) {
        throw Object.assign(new ValidationError('slot-unavailable', 'Dieser Zeitpunkt ist leider nicht mehr frei. Bitte wähle eine andere Uhrzeit.', 'time'), { status: 409 });
      }
      assigned = assignArea(c, input);
      if (assigned === false) {
        throw Object.assign(new ValidationError('area-unavailable', 'Im gewählten Bereich ist zu dieser Zeit nichts frei. Bitte wähle „egal“ oder eine andere Uhrzeit.', 'area'), { status: 409 });
      }
      const mine = new Set(contactKeys(input));
      const same = c.bookings.filter(b => b.date === input.date && ACTIVE.has(b.status) && contactKeys(b).some(k => mine.has(k)));
      if (same.length >= 2) {
        throw Object.assign(new ValidationError('duplicate', 'Für diesen Tag liegen bereits Reservierungen mit diesen Kontaktdaten vor. Bitte schreib uns auf Instagram, wenn du etwas ändern möchtest.', 'name'), { status: 409 });
      }
    }

    const refs = new Set(c.bookings.map(b => b.ref));
    const instant = settings.mode === 'instant' && assigned !== null && assigned !== false;
    const b = {
      id: newId(), ref: makeRef(random, refs), token: newToken(),
      createdAt: clock().toISOString(), source: staff ? 'staff' : 'web',
      ...input, durationMin: settings.durationMin, assignedArea: assigned ?? null,
      status: status || (staff ? 'confirmed' : instant ? 'confirmed' : 'pending'), staffNote: '', history: []
    };
    history(b, staff ? 'staff' : 'guest', 'created');
    store.state.bookings[b.id] = b;
    store.save();
    return b;
  }

  async function handlePublic(req, res, url, parts) {
    const method = req.method;
    const ip = clientIp(req);

    if (method === 'GET' && parts[0] === 'config') return send(res, 200, publicConfig());

    if (method === 'GET' && parts[0] === 'days') {
      if (limited(`r:${ip}`, 120, 60_000)) return fail(res, 429, 'rate', 'Zu viele Anfragen. Bitte einen Moment warten.');
      const party = parseParty(url, store.settings.maxParty);
      if (!party) return fail(res, 400, 'party', 'Ungültige Personenzahl.');
      return send(res, 200, { days: daysOverview(ctx(), party) });
    }

    if (method === 'GET' && parts[0] === 'availability') {
      if (limited(`r:${ip}`, 120, 60_000)) return fail(res, 429, 'rate', 'Zu viele Anfragen. Bitte einen Moment warten.');
      const party = parseParty(url, store.settings.maxParty);
      const date = url.searchParams.get('date');
      if (!party) return fail(res, 400, 'party', 'Ungültige Personenzahl.');
      if (!isDate(date)) return fail(res, 400, 'date', 'Ungültiges Datum.');
      const av = availability(ctx(), date, party);
      return send(res, 200, { date, open: av.open, reason: av.reason || null, slots: av.slots });
    }

    if (method === 'POST' && parts[0] === 'bookings' && parts.length === 1) {
      if (limited(`c:${ip}`, 6, 3_600_000)) return fail(res, 429, 'rate', 'Du hast in kurzer Zeit sehr viele Anfragen gesendet. Bitte versuche es später erneut oder schreib uns auf Instagram.');
      const body = await readBody(req);
      // Köderfeld: Menschen sehen es nicht. Bots, die alles ausfüllen, bekommen eine
      // scheinbar erfolgreiche Antwort und nichts wird gespeichert.
      if (clean(body.website, 50)) return send(res, 201, { ref: 'XXXXX', status: 'pending', statusPath: '' });
      if (body.privacy !== true) throw new ValidationError('privacy', 'Bitte bestätige die Datenschutzhinweise.', 'privacy');
      const input = parseBookingInput(body, store.settings);
      const b = createBooking(input, { staff: false });
      notify('booking.created', b.status === 'confirmed'
        ? `Neue Reservierung: ${dayLabel(b.date)} ${b.time}, ${b.party} Pers.`
        : `Neue Reservierungsanfrage: ${dayLabel(b.date)} ${b.time}, ${b.party} Pers. Bitte bestätigen.`);
      return send(res, 201, { ...guestView(b), id: b.id, token: b.token, statusPath: `?b=${b.id}.${b.token}#reservieren` });
    }

    if (parts[0] === 'bookings' && parts.length >= 2) {
      if (limited(`g:${ip}`, 60, 60_000)) return fail(res, 429, 'rate', 'Zu viele Anfragen. Bitte einen Moment warten.');
      const b = store.state.bookings[parts[1]];
      const given = url.searchParams.get('t') || '';
      let tokenFromBody = '';
      let body = {};
      if (method === 'POST') { body = await readBody(req); tokenFromBody = String(body.t || ''); }
      const token = method === 'POST' ? tokenFromBody : given;
      // Gleiche Antwort für „gibt es nicht“ und „falscher Schlüssel“.
      if (!b || !b.token || !token || !sameSecret(b.token, token)) return fail(res, 404, 'not-found', 'Diese Reservierung wurde nicht gefunden.');

      if (method === 'GET' && parts.length === 2) return send(res, 200, guestView(b));

      if (method === 'GET' && parts[2] === 'ics') {
        if (b.status !== 'confirmed' && b.status !== 'seated') return fail(res, 409, 'not-confirmed', 'Der Kalendereintrag ist erst nach der Bestätigung verfügbar.');
        return send(res, 200, icsFor(b), { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="fame-cafe-${b.ref}.ics"` });
      }

      if (method === 'POST' && parts[2] === 'cancel') {
        if (!ACTIVE.has(b.status) || b.status === 'seated') return fail(res, 409, 'not-cancellable', 'Diese Reservierung kann nicht mehr storniert werden.');
        b.status = 'cancelled'; history(b, 'guest', 'cancelled'); store.save();
        notify('booking.cancelled', `Storniert: ${dayLabel(b.date)} ${b.time}, ${b.party} Pers.`);
        return send(res, 200, guestView(b));
      }
    }
    return fail(res, 404, 'not-found', 'Unbekannte Adresse.');
  }

  function icsFor(b) {
    const stamp = s => s.replace(/[-:]/g, '');
    const esc = s => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    const start = `${b.date.replace(/-/g, '')}T${b.time.replace(':', '')}00`;
    const e = Math.min(toMin(b.time) + b.durationMin, 1439);
    const end = `${b.date.replace(/-/g, '')}T${toTime(e).replace(':', '')}00`;
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FAME CAFE//Reservierung//DE', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:${b.ref}@fame-cafe`, `DTSTAMP:${stamp(clock().toISOString().slice(0, 19))}Z`,
      `DTSTART:${start}`, `DTEND:${end}`,
      `SUMMARY:${esc(`FAME CAFÉ — Tisch für ${b.party}`)}`,
      `LOCATION:${esc('FAME CAFÉ, Gummersbacher Straße 12, 51645 Gummersbach')}`,
      `DESCRIPTION:${esc(`Reservierung ${b.ref}`)}`, 'END:VEVENT', 'END:VCALENDAR', ''
    ].join('\r\n');
  }

  /* -- Verwaltung --------------------------------------------------------- */
  function authorized(req) {
    if (!adminToken) return null;   // nicht eingerichtet
    const m = /^Bearer (.+)$/.exec(String(req.headers.authorization || ''));
    return !!m && sameSecret(adminToken, m[1]);
  }

  function checkSettings(input) {
    const s = store.settings;
    const next = JSON.parse(JSON.stringify(s));
    const int = (v, min, max, field) => {
      const n = Number(v);
      if (!Number.isInteger(n) || n < min || n > max) throw new ValidationError('settings', `Ungültiger Wert für ${field}.`, field);
      return n;
    };
    if (input.durationMin !== undefined) next.durationMin = int(input.durationMin, 30, 240, 'durationMin');
    if (input.slotStepMin !== undefined) {
      next.slotStepMin = int(input.slotStepMin, 15, 120, 'slotStepMin');
    }
    if (input.minLeadMin !== undefined) next.minLeadMin = int(input.minLeadMin, 0, 1440, 'minLeadMin');
    if (input.maxDaysAhead !== undefined) next.maxDaysAhead = int(input.maxDaysAhead, 1, 365, 'maxDaysAhead');
    if (input.maxParty !== undefined) next.maxParty = int(input.maxParty, 1, 40, 'maxParty');
    if (input.retentionDays !== undefined) next.retentionDays = int(input.retentionDays, 7, 365, 'retentionDays');
    if (input.seats) {
      for (const a of AREAS) {
        if (a in input.seats) next.seats[a] = input.seats[a] === null || input.seats[a] === '' ? null : int(input.seats[a], 1, 500, `seats.${a}`);
      }
    }
    if (input.mode !== undefined) {
      if (input.mode !== 'request' && input.mode !== 'instant') throw new ValidationError('settings', 'Ungültiger Modus.', 'mode');
      next.mode = input.mode;
    }
    if (next.mode === 'instant' && !AREAS.some(a => next.seats[a] != null)) {
      throw new ValidationError('instant-needs-seats', 'Sofortbuchung geht erst, wenn die Platzzahl für drinnen und/oder draußen eingetragen ist. Ohne Platzzahl könnte das System nicht vor Überbuchung schützen.', 'mode');
    }
    if (input.hours) {
      const okHours = h => h && isTime(h.open) && isTime(h.close) && toMin(h.close) > toMin(h.open);
      if (input.hours.regular) {
        const r = { ...next.hours.regular, ...input.hours.regular };
        if (!okHours(r) || !isDate(r.from)) throw new ValidationError('settings', 'Ungültige reguläre Öffnungszeit.', 'hours');
        next.hours.regular = { open: r.open, close: r.close, from: r.from };
      }
      if (input.hours.special) {
        const sp = {};
        for (const [d, h] of Object.entries(input.hours.special)) {
          if (!isDate(d)) throw new ValidationError('settings', 'Ungültiges Datum bei Sonderzeiten.', 'hours');
          if (h === null) sp[d] = null;
          else if (okHours(h)) sp[d] = { open: h.open, close: h.close };
          else throw new ValidationError('settings', 'Ungültige Sonderöffnungszeit.', 'hours');
        }
        next.hours.special = sp;
      }
    }
    return next;
  }

  function validateBlock(body) {
    if (!isDate(body.date)) throw new ValidationError('date', 'Bitte ein Datum wählen.', 'date');
    const from = body.from || '00:00', to = body.to || '24:00';
    if (!isTime(from) || !(isTime(to) || to === '24:00')) throw new ValidationError('time', 'Bitte gültige Uhrzeiten angeben.', 'time');
    const start = toMin(from), end = to === '24:00' ? 1440 : toMin(to);
    if (end <= start) throw new ValidationError('time', 'Das Ende muss nach dem Beginn liegen.', 'time');
    const area = body.area || 'all';
    if (area !== 'all' && !AREAS.includes(area)) throw new ValidationError('area', 'Ungültiger Bereich.', 'area');
    let seats = null;
    if (body.seats !== undefined && body.seats !== null && body.seats !== '') {
      seats = Number(body.seats);
      if (!Number.isInteger(seats) || seats < 1 || seats > 500) throw new ValidationError('seats', 'Ungültige Platzzahl.', 'seats');
    }
    return { date: body.date, from, to, area, seats, reason: clean(body.reason, 80) };
  }

  async function handleAdmin(req, res, url, parts) {
    const ip = clientIp(req);
    const auth = authorized(req);
    if (auth === null) return fail(res, 503, 'admin-disabled', 'Der Verwaltungsbereich ist noch nicht eingerichtet (FAME_ADMIN_TOKEN fehlt).');
    if (limited(`a:${ip}`, 600, 60_000)) return fail(res, 429, 'rate', 'Zu viele Anfragen.');
    if (!auth) {
      if (limited(`af:${ip}`, 10, 15 * 60_000)) return fail(res, 429, 'rate', 'Zu viele Fehlversuche. Bitte in einigen Minuten erneut versuchen.');
      return fail(res, 401, 'unauthorized', 'Zugangscode nicht korrekt.');
    }
    const method = req.method;
    const sub = parts[1];

    if (method === 'GET' && sub === 'summary') {
      tick();
      const now = localNow(clock());
      const all = store.bookingList();
      const today = all.filter(b => b.date === now.date && ACTIVE.has(b.status));
      return send(res, 200, {
        now, pending: all.filter(b => b.status === 'pending').length,
        today: { bookings: today.length, covers: today.reduce((n, b) => n + b.party, 0) },
        settings: store.settings, instantAvailable: AREAS.some(a => store.settings.seats[a] != null)
      });
    }

    if (method === 'GET' && sub === 'bookings') {
      const date = url.searchParams.get('date');
      const status = url.searchParams.get('status');
      let list = store.bookingList();
      if (date) {
        if (!isDate(date)) return fail(res, 400, 'date', 'Ungültiges Datum.');
        list = list.filter(b => b.date === date);
      }
      if (status) list = list.filter(b => b.status === status);
      if (url.searchParams.get('upcoming')) {
        const today = localNow(clock()).date;
        list = list.filter(b => b.date >= today);
      }
      list.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.createdAt.localeCompare(b.createdAt));
      return send(res, 200, { bookings: list.map(staffView) });
    }

    if (method === 'POST' && sub === 'bookings' && parts.length === 2) {
      const body = await readBody(req);
      const input = parseBookingInput(body, store.settings, { staff: true });
      const status = STATUSES.includes(body.status) ? body.status : undefined;
      const b = createBooking(input, { staff: true, force: body.force === true, status });
      return send(res, 201, { booking: staffView(b) });
    }

    if (method === 'PATCH' && sub === 'bookings' && parts[2]) {
      const b = store.state.bookings[parts[2]];
      if (!b) return fail(res, 404, 'not-found', 'Reservierung nicht gefunden.');
      const body = await readBody(req);
      const force = body.force === true;
      const wasActive = ACTIVE.has(b.status);
      const next = { ...b };

      if (body.status !== undefined) {
        if (!STATUSES.includes(body.status)) throw new ValidationError('status', 'Ungültiger Status.', 'status');
        next.status = body.status;
      }
      if (body.staffNote !== undefined) next.staffNote = clean(body.staffNote, 300);
      for (const f of ['date', 'time', 'party', 'area']) if (body[f] !== undefined) next[f] = body[f];
      if (body.name !== undefined) next.name = body.name;
      if (body.phone !== undefined) next.phone = body.phone;
      if (body.email !== undefined) next.email = body.email;
      if (body.note !== undefined) next.note = body.note;

      let parsed = null;
      if (['date', 'time', 'party', 'area', 'name', 'phone', 'email', 'note'].some(f => body[f] !== undefined)) {
        parsed = parseBookingInput(next, store.settings, { staff: true });
        Object.assign(next, parsed);
      }

      const willBeActive = ACTIVE.has(next.status);
      const moved = parsed && (parsed.date !== b.date || parsed.time !== b.time || parsed.party !== b.party || parsed.area !== b.area);
      if (willBeActive && (!wasActive || moved)) {
        const c = ctx();
        const area = assignArea(c, { date: next.date, time: next.time, party: next.party, area: next.area }, { skipId: b.id });
        if (area === false && !force) {
          return fail(res, 409, 'full', 'Zu dieser Zeit ist nicht genug Platz oder der Bereich ist gesperrt. Mit „Trotzdem“ kannst du es erzwingen.', { canForce: true });
        }
        next.assignedArea = area === false ? (next.area === 'any' ? null : next.area) : area;
      }

      const changes = [];
      if (next.status !== b.status) changes.push(`status ${b.status}→${next.status}`);
      if (moved) changes.push('verschoben/geändert');
      Object.assign(b, next);
      history(b, 'staff', changes.join(', ') || 'bearbeitet');
      store.save();
      return send(res, 200, { booking: staffView(b) });
    }

    if (method === 'GET' && sub === 'blocks') {
      const today = localNow(clock()).date;
      const list = store.blockList().filter(b => b.date >= today).sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from));
      return send(res, 200, { blocks: list });
    }

    if (method === 'POST' && sub === 'blocks') {
      const body = await readBody(req);
      const data = validateBlock(body);
      const block = { id: newId(), ...data };
      store.state.blocks[block.id] = block;
      store.save();
      const conflicts = data.seats == null
        ? store.bookingList().filter(b => b.date === data.date && ACTIVE.has(b.status)
            && toMin(b.time) < (data.to === '24:00' ? 1440 : toMin(data.to)) && toMin(b.time) + b.durationMin > toMin(data.from)
            && (data.area === 'all' || !b.assignedArea || b.assignedArea === data.area)).map(b => ({ id: b.id, ref: b.ref, time: b.time, party: b.party, name: b.name }))
        : [];
      return send(res, 201, { block, conflicts });
    }

    if (method === 'DELETE' && sub === 'blocks' && parts[2]) {
      if (!store.state.blocks[parts[2]]) return fail(res, 404, 'not-found', 'Sperre nicht gefunden.');
      delete store.state.blocks[parts[2]];
      store.save();
      return send(res, 200, { ok: true });
    }

    if (method === 'GET' && sub === 'settings') return send(res, 200, { settings: store.settings });

    if (method === 'PUT' && sub === 'settings') {
      const body = await readBody(req);
      store.settings = checkSettings(body);
      store.save();
      return send(res, 200, { settings: store.settings });
    }

    return fail(res, 404, 'not-found', 'Unbekannte Adresse.');
  }

  /** @returns {Promise<boolean>} true, wenn der Aufruf zur API gehört. */
  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) return false;
    const parts = url.pathname.split('/').filter(Boolean).slice(1).map(decodeURIComponent);
    try {
      if (parts[0] === 'admin') await handleAdmin(req, res, url, parts);
      else await handlePublic(req, res, url, parts);
    } catch (err) {
      if (err instanceof ValidationError) {
        fail(res, err.status || 400, err.code, err.message, { field: err.field });
      } else if (err.status === 413 || err.status === 400) {
        if (err.status === 413) {
          // Erst antworten, dann die Verbindung schließen — sonst sieht der Client nur einen Netzwerkfehler.
          res.setHeader('Connection', 'close');
          res.on('finish', () => req.destroy());
        }
        fail(res, err.status, err.status === 413 ? 'too-large' : 'bad-request', err.status === 413 ? 'Anfrage zu groß.' : 'Ungültige Anfrage.');
      } else {
        log(err.stack || String(err));
        if (!res.headersSent) fail(res, 500, 'server', 'Es ist ein Fehler aufgetreten. Bitte versuche es später erneut.');
      }
    }
    return true;
  }

  return { handle, tick, store, close: () => clearInterval(timer) };
}
