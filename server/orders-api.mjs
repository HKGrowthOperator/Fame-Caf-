/* FAME CAFÉ — Bestell-API (Gäste und Personal).

   Wird von app.mjs eingehängt und teilt sich dessen Speicher, Missbrauchsbremse und
   Benachrichtigung. Gästedaten sind hier minimal: Am Tisch fällt gar kein
   Personenbezug an; beim Abholen Name (Pflicht) und Telefon (freiwillig). */

import { ValidationError, localNow, clean, daysBetween } from './booking.mjs';
import {
  OPEN_ORDER, ORDER_STATUSES, DEFAULT_ORDERING, euro, orderable, tableKey, validTable, normalizeMenu, guestMenu,
  priceOrder, openNow, pickupSlots, parsePickupTime, parseOrderCustomer, normalizeTables
} from './ordering.mjs';

const MAX_OPEN_PER_TABLE = 5;

export function createOrderApi(d) {
  const { store, clock, send, fail, readBody, limited, notify, newId, newToken, sameSecret } = d;
  const cfg = () => store.settings.ordering;
  const secret = () => store.state.tableSecret;

  const guestView = o => ({
    id: o.id, number: o.number, status: o.status, mode: o.mode, table: o.table, pickupAt: o.pickupAt,
    items: o.items, totalCents: o.totalCents, createdAt: o.createdAt
  });
  const staffView = o => ({ ...o, token: undefined });

  function nextNumber() {
    const today = localNow(clock()).date;
    const c = store.state.orderCounter;
    if (c.date !== today) { c.date = today; c.n = 0; }
    return ++c.n;
  }

  const hasOrderable = () => store.state.menu.items.some(orderable);

  /** Was darf dieser Besucher gerade? Wird von Menü-Abruf und Bestellung gleichermaßen genutzt. */
  function situation(t, k) {
    const s = store.settings, o = s.ordering, now = clock();
    const table = t ? validTable(s, secret(), t, k) : false;
    const open = openNow(s, now);
    const slots = pickupSlots(s, now);
    let mode = 'none', reason = null;
    if (!o.enabled) reason = 'disabled';
    else if (t && !table) reason = 'bad-table';
    else if (table) { mode = 'table'; }
    else if (o.takeaway) { mode = 'pickup'; }
    else reason = 'no-mode';
    if (mode !== 'none' && o.paused) { reason = 'paused'; }
    else if (mode === 'table' && !open) { reason = 'closed'; }
    else if (mode === 'pickup' && !slots.length && !open) { reason = 'closed'; }
    else if (mode !== 'none' && !hasOrderable()) { reason = 'empty'; }
    return { mode, reason, table: table ? t : null, open, slots, canOrder: mode !== 'none' && !reason };
  }

  /* -- Gäste ------------------------------------------------------------- */

  async function handlePublic(req, res, url, parts, ip) {
    const method = req.method;

    if (method === 'GET' && parts[0] === 'order' && parts[1] === 'menu') {
      if (limited(`or:${ip}`, 120, 60_000)) { fail(res, 429, 'rate', 'Zu viele Anfragen. Bitte einen Moment warten.'); return true; }
      const sit = situation(url.searchParams.get('t') || '', url.searchParams.get('k') || '');
      send(res, 200, {
        mode: sit.mode, reason: sit.reason, canOrder: sit.canOrder, table: sit.table,
        menu: guestMenu(store.state.menu),
        pickup: { slots: sit.mode === 'pickup' ? sit.slots : [], asap: sit.mode === 'pickup' && sit.open }
      });
      return true;
    }

    if (method === 'POST' && parts[0] === 'orders' && parts.length === 1) {
      if (limited(`oc:${ip}`, 40, 3_600_000)) { fail(res, 429, 'rate', 'Von diesem Netz kamen sehr viele Bestellungen. Bitte sprich unser Team an.'); return true; }
      const body = await readBody(req);
      if (clean(body.website, 50)) { send(res, 201, { id: 'x', number: 0, status: 'new', items: [], totalCents: 0 }); return true; }

      const sit = situation(String(body.t || ''), String(body.k || ''));
      if (sit.mode === 'none' || body.mode !== sit.mode) throw Object.assign(new ValidationError('not-available', 'Bestellen ist hier gerade nicht möglich.', 'mode'), { status: 409 });
      if (sit.reason === 'paused') throw Object.assign(new ValidationError('paused', 'Wir nehmen gerade keine neuen Bestellungen an. Bitte versuche es gleich noch einmal.', 'mode'), { status: 409 });
      if (sit.reason === 'closed') throw Object.assign(new ValidationError('closed', 'Wir haben gerade geschlossen.', 'mode'), { status: 409 });
      if (!sit.canOrder) throw Object.assign(new ValidationError('not-available', 'Bestellen ist hier gerade nicht möglich.', 'mode'), { status: 409 });

      let pickupAt = null;
      if (sit.mode === 'table') {
        if (limited(`ot:${sit.table}`, 30, 3_600_000)) { fail(res, 429, 'rate', 'Für diesen Tisch gab es sehr viele Bestellungen. Bitte sprich unser Team an.'); return true; }
        const openAtTable = store.orderList().filter(o => o.mode === 'table' && o.table === sit.table && OPEN_ORDER.has(o.status)).length;
        if (openAtTable >= MAX_OPEN_PER_TABLE) throw Object.assign(new ValidationError('table-busy', 'Für diesen Tisch laufen schon mehrere Bestellungen. Bitte warte, bis die ersten fertig sind, oder sprich unser Team an.', 'mode'), { status: 409 });
      } else {
        if (body.privacy !== true) throw new ValidationError('privacy', 'Bitte bestätige die Datenschutzhinweise.', 'privacy');
        if (limited(`op:${ip}`, 8, 3_600_000)) { fail(res, 429, 'rate', 'Du hast in kurzer Zeit sehr viele Bestellungen aufgegeben. Bitte sprich unser Team an.'); return true; }
        pickupAt = parsePickupTime(body.pickupAt, sit.slots, sit.open);
      }
      const customer = parseOrderCustomer(body, sit.mode);
      const priced = priceOrder(store.state.menu, body.items);

      const now = clock();
      const o = {
        id: newId(), token: newToken(), number: nextNumber(), createdAt: now.toISOString(), date: localNow(now).date,
        mode: sit.mode, table: sit.table, pickupAt, ...customer, items: priced.items, totalCents: priced.totalCents,
        status: 'new', history: [{ at: now.toISOString(), by: 'guest', action: 'created' }]
      };
      store.state.orders[o.id] = o;
      store.save();
      const where = o.mode === 'table' ? `Tisch ${o.table}` : `Abholung ${o.pickupAt === 'asap' ? 'sofort' : o.pickupAt}`;
      notify('order.created', `Neue Bestellung Nr. ${o.number} · ${where} · ${o.items.reduce((n, i) => n + i.qty, 0)} Artikel · ${euro(o.totalCents)}`);
      send(res, 201, { ...guestView(o), token: o.token });
      return true;
    }

    if (parts[0] === 'orders' && parts.length >= 2) {
      if (limited(`og:${ip}`, 120, 60_000)) { fail(res, 429, 'rate', 'Zu viele Anfragen. Bitte einen Moment warten.'); return true; }
      const o = store.state.orders[parts[1]];
      let token = url.searchParams.get('t') || '';
      if (method === 'POST') { const body = await readBody(req); token = String(body.t || ''); }
      if (!o || !o.token || !token || !sameSecret(o.token, token)) { fail(res, 404, 'not-found', 'Diese Bestellung wurde nicht gefunden.'); return true; }
      if (method === 'GET' && parts.length === 2) { send(res, 200, guestView(o)); return true; }
      if (method === 'POST' && parts[2] === 'cancel') {
        if (o.status !== 'new') { fail(res, 409, 'not-cancellable', 'Die Bestellung ist schon in Arbeit. Bitte sprich unser Team an.'); return true; }
        o.status = 'cancelled'; o.history.push({ at: clock().toISOString(), by: 'guest', action: 'cancelled' }); store.save();
        notify('order.cancelled', `Bestellung Nr. ${o.number} storniert`);
        send(res, 200, guestView(o));
        return true;
      }
    }
    return false;
  }

  /* -- Personal ---------------------------------------------------------- */

  async function handleAdmin(req, res, url, parts) {
    const method = req.method, sub = parts[1];

    if (method === 'GET' && sub === 'orders') {
      const today = localNow(clock()).date;
      const list = store.orderList().filter(o => o.date === today || OPEN_ORDER.has(o.status)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      send(res, 200, { orders: list.map(staffView), today });
      return true;
    }

    if (method === 'PATCH' && sub === 'orders' && parts[2]) {
      const o = store.state.orders[parts[2]];
      if (!o) { fail(res, 404, 'not-found', 'Bestellung nicht gefunden.'); return true; }
      const body = await readBody(req);
      if (!ORDER_STATUSES.includes(body.status)) throw new ValidationError('status', 'Ungültiger Status.', 'status');
      if (o.status !== body.status) {
        o.history.push({ at: clock().toISOString(), by: 'staff', action: `status ${o.status}→${body.status}` });
        o.status = body.status;
        store.save();
      }
      send(res, 200, { order: staffView(o) });
      return true;
    }

    if (method === 'GET' && sub === 'menu') { send(res, 200, { menu: store.state.menu, ordering: cfg() }); return true; }

    if (method === 'PUT' && sub === 'menu') {
      store.state.menu = normalizeMenu(await readBody(req));
      store.save();
      send(res, 200, { menu: store.state.menu });
      return true;
    }

    // Schnellschalter „ausverkauft“: ändert nur die Verfügbarkeit eines Artikels
    if (method === 'PATCH' && sub === 'menu' && parts[2] === 'items' && parts[3]) {
      const it = store.state.menu.items.find(x => x.id === parts[3]);
      if (!it) { fail(res, 404, 'not-found', 'Artikel nicht gefunden.'); return true; }
      const body = await readBody(req);
      if (typeof body.available !== 'boolean') throw new ValidationError('menu', 'Ungültiger Wert.', 'available');
      it.available = body.available;
      store.save();
      send(res, 200, { item: it });
      return true;
    }

    if (method === 'GET' && sub === 'tables') {
      send(res, 200, { tables: cfg().tables.map(label => ({ label, key: tableKey(secret(), label) })) });
      return true;
    }
    return false;
  }

  /** Bestell-Einstellungen aus einem PUT /settings übernehmen (prüft und schreibt in `next`). */
  function applySettings(input, next) {
    if (!input.ordering) return;
    const i = input.ordering, o = next.ordering;
    const bool = (v, f) => { if (typeof v !== 'boolean') throw new ValidationError('settings', `Ungültiger Wert für ${f}.`, f); return v; };
    for (const f of ['enabled', 'paused', 'tableOrdering', 'takeaway']) if (i[f] !== undefined) o[f] = bool(i[f], f);
    if (i.tables !== undefined) o.tables = normalizeTables(i.tables);
    for (const [f, min, max] of [['pickupLeadMin', 0, 180], ['pickupStepMin', 5, 60]]) {
      if (i[f] === undefined) continue;
      const n = Number(i[f]);
      if (!Number.isInteger(n) || n < min || n > max) throw new ValidationError('settings', `Ungültiger Wert für ${f}.`, f);
      o[f] = n;
    }
    if (o.enabled && !hasOrderable()) {
      throw new ValidationError('no-items', 'Bestellen lässt sich erst freischalten, wenn mindestens ein Artikel mit Preis auf der Karte steht und verfügbar ist.', 'enabled');
    }
    if (o.enabled && !o.takeaway && !(o.tableOrdering && o.tables.length)) {
      throw new ValidationError('no-mode', 'Aktiviere „Mitnehmen“ oder lege Tische für das Bestellen am Tisch an.', 'enabled');
    }
    // Defaults für künftig neue Felder nicht verlieren
    for (const [k, v] of Object.entries(DEFAULT_ORDERING)) if (o[k] === undefined) o[k] = v;
  }

  /** Aufräumen: veraltete offene Bestellungen schließen, Personendaten löschen. */
  function tick() {
    const today = localNow(clock()).date;
    let changed = false;
    for (const o of store.orderList()) {
      if (OPEN_ORDER.has(o.status) && o.date < today) {
        o.status = 'cancelled'; o.history.push({ at: clock().toISOString(), by: 'system', action: 'expired' }); changed = true;
      }
      const age = daysBetween(o.date, today);
      if (age > 400) { delete store.state.orders[o.id]; changed = true; continue; }
      if (age > store.settings.retentionDays && !o.erased) {
        o.name = ''; o.phone = ''; o.note = ''; o.token = ''; o.erased = true; changed = true;
      }
    }
    return changed;
  }

  return { handlePublic, handleAdmin, applySettings, tick, openCount: () => store.orderList().filter(o => o.status === 'new').length };
}
