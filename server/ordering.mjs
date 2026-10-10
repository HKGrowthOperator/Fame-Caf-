/* FAME CAFÉ — Bestelllogik (rein, ohne I/O).

   Grundsatz: Preise und Verfügbarkeit kommen ausschließlich aus der Karte auf dem
   Server. Der Client schickt nur Artikelnummern und Mengen; jeder Betrag, den ein
   Browser mitschickt, wird ignoriert.

   Es gibt keine Online-Zahlung. Bezahlt wird vor Ort. */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { ValidationError, clean, hoursFor, localNow, toTime, isTime } from './booking.mjs';

export const ORDER_STATUSES = ['new', 'preparing', 'ready', 'done', 'cancelled'];
export const OPEN_ORDER = new Set(['new', 'preparing', 'ready']);

/** Standardwerte. `enabled` ist aus: Der Betreiber prüft zuerst die Karte, dann schaltet er frei. */
export const DEFAULT_ORDERING = {
  enabled: false,
  paused: false,
  tableOrdering: true,
  takeaway: true,
  tables: [],            // Tischbezeichnungen; leer = Bestellen am Tisch nicht möglich
  pickupLeadMin: 15,
  pickupStepMin: 15
};

/** Startkarte = die Produkte und Preise, die die Website schon zeigt (Menü-Vorschau).
 *  Artikel ohne feststehenden Preis sind nicht bestellbar, bis der Betreiber einen Preis einträgt:
 *  „Cake & Bakery“ steht auf der Seite nur als „ab 4,50 €“, Bagel hat noch keinen Preis. */
export const DEFAULT_MENU = {
  categories: [
    { id: 'coffee', name: 'Coffee' },
    { id: 'matcha', name: 'Matcha' },
    { id: 'bowls', name: 'Bowls & Bagel' },
    { id: 'tea', name: 'Tea' },
    { id: 'bakery', name: 'Cake & Bakery' }
  ],
  items: [
    { id: 'espresso', category: 'coffee', name: 'Espresso', description: 'short · intense', priceCents: 280, available: true },
    { id: 'cappuccino', category: 'coffee', name: 'Cappuccino', description: 'espresso · milk', priceCents: 390, available: true },
    { id: 'flat-white', category: 'coffee', name: 'Flat White', description: 'double · silky', priceCents: 450, available: true },
    { id: 'iced-matcha', category: 'matcha', name: 'Iced Matcha', description: 'cold · creamy', priceCents: 590, available: true },
    { id: 'matcha-latte', category: 'matcha', name: 'Matcha Latte', description: 'matcha · milk', priceCents: 550, available: true },
    { id: 'acai-bowl', category: 'bowls', name: 'Açaí Bowl', description: 'fruit · crunch', priceCents: 990, available: true },
    { id: 'bagel', category: 'bowls', name: 'Bagel', description: '', priceCents: null, available: true },
    { id: 'tea-specials', category: 'tea', name: 'Tea Specials', description: 'hot · fresh', priceCents: 420, available: true },
    { id: 'cake-bakery', category: 'bakery', name: 'Cake & Bakery', description: 'daily selection', priceCents: null, available: true }
  ]
};

export const orderable = it => it.available && Number.isInteger(it.priceCents) && it.priceCents > 0;

export const euro = cents => `${(cents / 100).toFixed(2).replace('.', ',')} €`;

/* -- Tisch-Schlüssel ------------------------------------------------------- */

/** Der QR-Code trägt Tisch UND Schlüssel. Ohne Schlüssel könnte jeder aus der Ferne an jeden
 *  Tisch bestellen, indem er eine Tischnummer in die Adresse tippt. */
export function tableKey(secret, label) {
  return createHmac('sha256', secret).update(`table:${label}`).digest('hex').slice(0, 12);
}

export function validTable(settings, secret, label, key) {
  const t = settings.ordering;
  if (!t.tableOrdering || typeof label !== 'string' || typeof key !== 'string') return false;
  if (!t.tables.includes(label)) return false;
  const expected = Buffer.from(tableKey(secret, label));
  const given = Buffer.from(key);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/* -- Karte prüfen ---------------------------------------------------------- */

const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function normalizeMenu(input) {
  if (!input || !Array.isArray(input.categories) || !Array.isArray(input.items)) {
    throw new ValidationError('menu', 'Die Karte hat ein ungültiges Format.', 'menu');
  }
  if (input.categories.length > 20 || input.items.length > 200) throw new ValidationError('menu', 'Die Karte ist zu groß.', 'menu');
  const catIds = new Set();
  const categories = input.categories.map(c => {
    const id = String(c.id || '');
    const name = clean(c.name, 40);
    if (!ID_RE.test(id) || !name || catIds.has(id)) throw new ValidationError('menu', `Ungültige oder doppelte Kategorie „${name || id}“.`, 'menu');
    catIds.add(id);
    return { id, name };
  });
  const itemIds = new Set();
  const items = input.items.map(it => {
    const id = String(it.id || '');
    const name = clean(it.name, 60);
    if (!ID_RE.test(id) || !name || itemIds.has(id)) throw new ValidationError('menu', `Ungültiger oder doppelter Artikel „${name || id}“.`, 'menu');
    if (!catIds.has(it.category)) throw new ValidationError('menu', `Artikel „${name}“ hat keine gültige Kategorie.`, 'menu');
    itemIds.add(id);
    let priceCents = null;
    if (it.priceCents !== null && it.priceCents !== undefined && it.priceCents !== '') {
      priceCents = Number(it.priceCents);
      if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 100000) throw new ValidationError('menu', `Ungültiger Preis bei „${name}“.`, 'menu');
      if (priceCents === 0) priceCents = null;
    }
    return { id, category: it.category, name, description: clean(it.description, 120), priceCents, available: it.available !== false };
  });
  return { categories, items };
}

/** Karte für Gäste: nur Kategorien mit Artikeln; Artikel ohne Preis fehlen ganz
 *  (kein „Preis folgt“ in einer Bestellung), ausverkaufte stehen sichtbar, aber gesperrt da. */
export function guestMenu(menu) {
  const shown = menu.items.filter(it => Number.isInteger(it.priceCents) && it.priceCents > 0);
  return menu.categories
    .map(c => ({ id: c.id, name: c.name, items: shown.filter(it => it.category === c.id).map(it => ({ id: it.id, name: it.name, description: it.description, priceCents: it.priceCents, available: it.available })) }))
    .filter(c => c.items.length);
}

/* -- Bestellung berechnen -------------------------------------------------- */

export const LIMITS = { lines: 30, qtyPerLine: 10, totalQty: 40 };

/** @returns {{items: Array, totalCents: number}} */
export function priceOrder(menu, lines) {
  if (!Array.isArray(lines) || !lines.length) throw new ValidationError('empty', 'Dein Warenkorb ist leer.', 'items');
  if (lines.length > LIMITS.lines) throw new ValidationError('too-many', 'Das sind zu viele verschiedene Artikel in einer Bestellung.', 'items');
  const byId = new Map(menu.items.map(it => [it.id, it]));
  const seen = new Set();
  const items = [];
  const gone = [];
  let totalQty = 0, totalCents = 0;
  for (const line of lines) {
    const it = byId.get(String(line?.id));
    const qty = Number(line?.qty);
    if (!it || seen.has(it.id)) throw new ValidationError('unknown-item', 'Ein Artikel im Warenkorb gibt es nicht mehr. Bitte lade die Seite neu.', 'items');
    if (!Number.isInteger(qty) || qty < 1 || qty > LIMITS.qtyPerLine) throw new ValidationError('qty', `Pro Artikel sind 1 bis ${LIMITS.qtyPerLine} möglich.`, 'items');
    seen.add(it.id);
    if (!orderable(it)) { gone.push(it.name); continue; }
    totalQty += qty;
    totalCents += qty * it.priceCents;
    items.push({ id: it.id, name: it.name, qty, priceCents: it.priceCents });
  }
  if (gone.length) {
    throw Object.assign(new ValidationError('sold-out', `Gerade nicht mehr verfügbar: ${gone.join(', ')}. Bitte nimm die Artikel aus dem Warenkorb.`, 'items'), { status: 409, soldOut: gone });
  }
  if (totalQty > LIMITS.totalQty) throw new ValidationError('too-many', `Pro Bestellung sind höchstens ${LIMITS.totalQty} Artikel möglich.`, 'items');
  return { items, totalCents };
}

/* -- Öffnungszeit, Abholzeiten --------------------------------------------- */

/** Offen bedeutet: innerhalb der Öffnungszeit des heutigen Tages. */
export function openNow(settings, now) {
  const n = localNow(now);
  const h = hoursFor(settings, n.date);
  return !!h && n.minute >= h.open && n.minute < h.close;
}

/** Abholzeiten heute: ab jetzt + Vorlauf, im Raster, bis zur Schließzeit. */
export function pickupSlots(settings, now) {
  const n = localNow(now);
  const h = hoursFor(settings, n.date);
  if (!h) return [];
  const { pickupLeadMin: lead, pickupStepMin: step } = settings.ordering;
  const first = Math.max(h.open, Math.ceil((n.minute + lead) / step) * step);
  const slots = [];
  for (let m = first; m <= h.close - step; m += step) slots.push(toTime(m));
  return slots;
}

export function parsePickupTime(value, slots, canAsap) {
  if (value === 'asap') {
    if (!canAsap) throw new ValidationError('pickup-time', 'Bitte wähle eine Abholzeit.', 'pickupAt');
    return 'asap';
  }
  if (!isTime(value) || !slots.includes(value)) throw new ValidationError('pickup-time', 'Diese Abholzeit ist nicht mehr möglich. Bitte wähle eine andere.', 'pickupAt');
  return value;
}

/* -- Eingaben ---------------------------------------------------------------- */

export function parseOrderCustomer(body, mode) {
  const note = clean(body.note, 200);
  if (mode === 'table') return { name: clean(body.name, 40), phone: '', note };
  const name = clean(body.name, 40);
  if (name.length < 2) throw new ValidationError('name', 'Bitte gib einen Namen an, damit wir deine Bestellung aufrufen können.', 'name');
  const phone = clean(body.phone, 30);
  if (phone && !/^[+\d][\d\s()/.-]{4,}$/.test(phone)) throw new ValidationError('phone', 'Bitte prüfe die Telefonnummer.', 'phone');
  return { name, phone, note };
}

/** Tischbezeichnungen bereinigen: kurz, ohne Sonderzeichen, eindeutig. */
export function normalizeTables(list) {
  if (!Array.isArray(list)) throw new ValidationError('tables', 'Ungültige Tischliste.', 'tables');
  if (list.length > 200) throw new ValidationError('tables', 'Es sind höchstens 200 Tische möglich.', 'tables');
  const seen = new Set();
  return list.map(x => {
    const label = clean(x, 12);
    if (!/^[A-Za-z0-9ÄÖÜäöüß][A-Za-z0-9ÄÖÜäöüß .-]{0,11}$/.test(label)) throw new ValidationError('tables', `Ungültige Tischbezeichnung „${label}“. Erlaubt: Buchstaben, Zahlen, Leerzeichen, Punkt, Bindestrich (bis 12 Zeichen).`, 'tables');
    if (seen.has(label.toLowerCase())) throw new ValidationError('tables', `Tisch „${label}“ kommt doppelt vor.`, 'tables');
    seen.add(label.toLowerCase());
    return label;
  });
}

