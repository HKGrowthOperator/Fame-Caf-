/* FAME CAFÉ — Speicher.

   Eine JSON-Datei, atomar geschrieben (temporäre Datei, fsync, rename). Für ein
   Café mit Dutzenden Reservierungen am Tag ist das ausreichend und braucht
   weder Datenbankserver noch Abhängigkeiten. Der Prozess ist single-threaded,
   jede Änderung läuft synchron durch — es gibt keine parallelen Schreiber.

   Wichtig im Betrieb: DATA_DIR muss auf ein persistentes Volume zeigen, sonst
   sind alle Buchungen nach dem nächsten Deploy weg. */

import { mkdirSync, readFileSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DEFAULT_SETTINGS } from './booking.mjs';
import { DEFAULT_ORDERING, DEFAULT_MENU } from './ordering.mjs';

const clone = v => JSON.parse(JSON.stringify(v));

export function mergeSettings(saved = {}) {
  const base = clone(DEFAULT_SETTINGS);
  const out = { ...base, ...saved };
  out.seats = { ...base.seats, ...(saved.seats || {}) };
  out.ordering = { ...clone(DEFAULT_ORDERING), ...(saved.ordering || {}) };
  out.hours = {
    regular: { ...base.hours.regular, ...(saved.hours?.regular || {}) },
    special: saved.hours?.special ? clone(saved.hours.special) : base.hours.special
  };
  return out;
}

export function openStore(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, 'state.json');
  let state;
  const raw = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  // Ältere Dateien (nur Reservierungen) werden beim Laden um die Felder fürs Bestellen ergänzt,
  // ohne etwas Bestehendes zu verändern.
  state = {
    version: 2,
    settings: mergeSettings(raw.settings),
    bookings: raw.bookings || {},
    blocks: raw.blocks || {},
    menu: raw.menu || clone(DEFAULT_MENU),
    orders: raw.orders || {},
    orderCounter: raw.orderCounter || { date: '', n: 0 },
    tableSecret: raw.tableSecret || randomBytes(24).toString('hex')
  };

  function save() {
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(state));
    const fd = openSync(tmp, 'r');
    try { fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(tmp, file);
  }

  // Das Tisch-Geheimnis steckt in den gedruckten QR-Codes. Es muss auf der Platte stehen,
  // bevor jemand Codes druckt — sonst würden sie nach dem nächsten Neustart ungültig.
  if (raw.tableSecret === undefined || raw.menu === undefined || raw.version !== 2) save();

  return {
    state,
    save,
    get settings() { return state.settings; },
    set settings(v) { state.settings = v; },
    bookingList: () => Object.values(state.bookings),
    blockList: () => Object.values(state.blocks),
    orderList: () => Object.values(state.orders)
  };
}
