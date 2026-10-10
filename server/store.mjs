/* FAME CAFÉ — Speicher.

   Eine JSON-Datei, atomar geschrieben (temporäre Datei, fsync, rename). Für ein
   Café mit Dutzenden Reservierungen am Tag ist das ausreichend und braucht
   weder Datenbankserver noch Abhängigkeiten. Der Prozess ist single-threaded,
   jede Änderung läuft synchron durch — es gibt keine parallelen Schreiber.

   Wichtig im Betrieb: DATA_DIR muss auf ein persistentes Volume zeigen, sonst
   sind alle Buchungen nach dem nächsten Deploy weg. */

import { mkdirSync, readFileSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SETTINGS } from './booking.mjs';

const clone = v => JSON.parse(JSON.stringify(v));

export function mergeSettings(saved = {}) {
  const base = clone(DEFAULT_SETTINGS);
  const out = { ...base, ...saved };
  out.seats = { ...base.seats, ...(saved.seats || {}) };
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
  if (existsSync(file)) {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    state = { version: 1, settings: mergeSettings(raw.settings), bookings: raw.bookings || {}, blocks: raw.blocks || {} };
  } else {
    state = { version: 1, settings: mergeSettings(), bookings: {}, blocks: {} };
  }

  function save() {
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(state));
    const fd = openSync(tmp, 'r');
    try { fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(tmp, file);
  }

  return {
    state,
    save,
    get settings() { return state.settings; },
    set settings(v) { state.settings = v; },
    bookingList: () => Object.values(state.bookings),
    blockList: () => Object.values(state.blocks)
  };
}
