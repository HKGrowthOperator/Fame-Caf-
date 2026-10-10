/* FAME CAFÉ — Verwaltung der Bestellungen (Tafel, Karte, Tische/QR, Einstellungen).

   Gleiche Anmeldung wie die Reservierungs-Verwaltung (derselbe Zugangscode, derselbe
   Speicherort im Browser). Alle Texte aus der API gelangen nur über textContent in die Seite. */

(() => {
  'use strict';

  const app = document.getElementById('app');
  const KEY = 'fame-admin-code';
  const SOUND_KEY = 'fame-admin-sound';

  const S = { code: '', tab: 'board', orders: [], today: '', summary: null, menu: null, ordering: null, tables: [], online: true, sound: false, lastNew: null, dirty: false };
  let timer = null;

  /* -- Helfer ------------------------------------------------------------------ */

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  }
  const put = (el, ...nodes) => el.replaceChildren(...nodes.flat(Infinity).filter(n => n != null && n !== false));
  const euro = c => `${(c / 100).toFixed(2).replace('.', ',')} €`;
  const readCode = () => { try { return localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || ''; } catch { return ''; } };
  const rd = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const wr = (k, v) => { try { localStorage.setItem(k, v); } catch { /* privater Modus */ } };

  class ApiError extends Error {
    constructor(res, json) { super(json?.message || `Fehler ${res.status}`); this.status = res.status; this.code = json?.error; }
  }

  async function api(method, path, body) {
    let res;
    try {
      res = await fetch(`/api/admin${path}`, { method, headers: { Authorization: `Bearer ${S.code}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
    } catch { S.online = false; dot(); throw Object.assign(new Error('Keine Verbindung.'), { code: 'network' }); }
    S.online = true; dot();
    let json = null; try { json = await res.json(); } catch { /* leer */ }
    if (res.status === 401) { logout('Zugangscode nicht korrekt.'); throw new ApiError(res, json); }
    if (!res.ok) throw new ApiError(res, json);
    return json;
  }
  function dot() { const d = document.getElementById('dot'); if (d) { d.classList.toggle('off', !S.online); d.title = S.online ? 'verbunden' : 'keine Verbindung'; } }

  function beep() {
    try { const c = new (window.AudioContext || window.webkitAudioContext)(); const o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = 988; g.gain.value = 0.1; o.start(); o.stop(c.currentTime + 0.25); } catch { /* kein Ton */ }
    navigator.vibrate?.([120, 60, 120]);
  }

  /* -- Anmeldung --------------------------------------------------------------- */

  function logout(message = '') {
    try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch { /* ignorieren */ }
    S.code = ''; clearInterval(timer); renderLogin(message);
  }

  function renderLogin(message = '') {
    const code = h('input', { id: 'code', type: 'password', autocomplete: 'current-password', autocapitalize: 'off', spellcheck: 'false', required: true });
    const keep = h('input', { id: 'keep', type: 'checkbox' });
    const err = h('p', { class: 'err', role: 'alert', text: message });
    put(app, h('form', { class: 'login form', onsubmit: async e => {
      e.preventDefault(); S.code = code.value.trim(); err.textContent = '';
      try { await api('GET', '/summary'); try { (keep.checked ? localStorage : sessionStorage).setItem(KEY, S.code); } catch { /* privat */ } start(); }
      catch (ex) { err.textContent = ex.status === 503 || ex.status === 429 ? ex.message : ex.code === 'network' ? 'Keine Verbindung zum Server.' : 'Zugangscode nicht korrekt.'; }
    } }, h('h1', { text: 'FAME CAFÉ' }), h('p', { text: 'Verwaltung der Bestellungen' }),
      h('div', { class: 'f' }, h('label', { for: 'code', text: 'Zugangscode' }), code),
      h('label', { class: 'check' }, keep, h('span', { text: 'Auf diesem Gerät angemeldet bleiben' })), err,
      h('button', { class: 'b primary', type: 'submit', text: 'Anmelden' })));
    code.focus();
  }

  /* -- Rahmen ---------------------------------------------------------------------- */

  async function start() {
    try { S.summary = await api('GET', '/summary'); } catch { return; }
    S.sound = rd(SOUND_KEY) === '1';
    S.lastNew = S.summary.newOrders;
    renderShell();
    await refresh();
    clearInterval(timer);
    timer = setInterval(() => { if (!document.hidden) refresh(true); }, 8000);
  }

  function renderShell() {
    const tab = (id, ico, label) => h('button', { class: 'tab', role: 'tab', id: `tab-${id}`, 'aria-selected': String(S.tab === id), onclick: () => setTab(id) },
      h('span', { class: 'tab-ico', 'aria-hidden': 'true', text: ico }), h('span', { text: label }),
      id === 'board' ? h('span', { class: 'badge', id: 'badge', hidden: true }) : null);
    put(app,
      h('header', { class: 'top' },
        h('div', {}, h('h1', { text: 'FAME Bestellungen' }), h('small', { id: 'sub' })),
        h('div', { class: 'top-actions' }, h('span', { class: 'pulse', id: 'dot', 'aria-hidden': 'true' }),
          h('a', { class: 'btn-ghost', href: 'index.html', style: 'display:inline-flex;align-items:center;text-decoration:none', text: 'Reservierungen' }),
          h('button', { class: 'btn-ghost', type: 'button', onclick: () => logout(), text: 'Abmelden' }))),
      h('nav', { class: 'tabs', role: 'tablist', 'aria-label': 'Bereiche' }, tab('board', '☕', 'Tafel'), tab('menu', '📋', 'Karte'), tab('tables', '▣', 'Tische'), tab('settings', '⚙', 'Einstellungen')),
      h('main', { id: 'view', tabindex: '-1' }));
    paint();
  }

  function setTab(id) {
    if (S.dirty && !confirm('Es gibt ungespeicherte Änderungen an der Karte. Trotzdem wechseln?')) return;
    S.dirty = false; S.tab = id;
    document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', String(t.id === `tab-${id}`)));
    refresh();
  }

  function paint() {
    const n = S.orders.filter(o => o.status === 'new').length;
    const badge = document.getElementById('badge');
    if (badge) { badge.hidden = !n; badge.textContent = String(n); }
    const open = S.orders.filter(o => ['new', 'preparing', 'ready'].includes(o.status)).length;
    const sub = document.getElementById('sub');
    if (sub) sub.textContent = `${open} OFFEN · ${S.orders.length} HEUTE`;
    document.title = `${n ? `(${n}) ` : ''}Bestellungen — FAME CAFÉ`;
  }

  async function refresh(silent = false) {
    try {
      S.summary = await api('GET', '/summary');
      S.ordering = S.summary.settings.ordering;
      const orders = await api('GET', '/orders');
      S.orders = orders.orders; S.today = orders.today;
      const nNew = S.orders.filter(o => o.status === 'new').length;
      if (S.lastNew != null && nNew > S.lastNew && S.sound) beep();
      S.lastNew = nNew;
      paint();
      if (S.tab === 'menu' && !S.dirty) S.menu = (await api('GET', '/menu')).menu;
      if (S.tab === 'tables') S.tables = (await api('GET', '/tables')).tables;
      if (silent && (document.querySelector('dialog[open]') || S.dirty || ['menu', 'tables', 'settings'].includes(S.tab) && document.activeElement?.closest('#view'))) return;
      render();
    } catch (err) { if (!silent) put(document.getElementById('view'), h('p', { class: 'err', role: 'alert', text: err.message })); }
  }

  function render() {
    const view = document.getElementById('view'); if (!view) return;
    const y = window.scrollY;
    ({ board: renderBoard, menu: renderMenu, tables: renderTables, settings: renderSettings })[S.tab](view);
    window.scrollTo(0, y);
  }

  /* -- Tafel ----------------------------------------------------------------------- */

  const ago = iso => { const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)); return m < 1 ? 'gerade eben' : m < 60 ? `vor ${m} min` : `vor ${Math.floor(m / 60)} h`; };

  async function setStatus(o, status) {
    try { await api('PATCH', `/orders/${o.id}`, { status }); await refresh(); } catch (e) { alert(e.message); }
  }

  function orderCard(o) {
    const where = o.mode === 'table' ? `TISCH ${o.table}` : `ABHOLUNG ${o.pickupAt === 'asap' ? 'SOFORT' : `${o.pickupAt} UHR`}`;
    const btn = (label, cls, fn) => h('button', { type: 'button', class: `b ${cls}`, onclick: async e => { e.currentTarget.disabled = true; await fn(); }, text: label });
    const actions = o.status === 'new' ? [btn('Annehmen', 'primary', () => setStatus(o, 'preparing')), btn('Stornieren', 'danger', () => confirm(`Bestellung ${o.number} wirklich stornieren?`) ? setStatus(o, 'cancelled') : refresh())]
      : o.status === 'preparing' ? [btn('Fertig', 'primary', () => setStatus(o, 'ready'))]
      : o.status === 'ready' ? [btn(o.mode === 'table' ? 'Serviert' : 'Abgeholt', 'primary', () => setStatus(o, 'done'))]
      : [btn('Wieder öffnen', 'small', () => setStatus(o, 'new'))];
    return h('article', { class: 'card ord', 'data-status': o.status },
      h('div', { class: 'card-head' },
        h('div', { class: 'time' }, `#${o.number}`, h('small', { text: ago(o.createdAt) })),
        h('div', { class: 'who' }, h('strong', { text: where }), h('span', { text: o.mode === 'pickup' ? `${o.name}${o.phone ? ` · ${o.phone}` : ''}` : (o.name || ' ') })),
        h('span', { class: 'status', 'data-s': o.status === 'new' ? 'pending' : o.status === 'preparing' ? 'confirmed' : o.status === 'ready' ? 'seated' : 'expired', text: { new: 'NEU', preparing: 'IN ARBEIT', ready: 'FERTIG', done: 'ERLEDIGT', cancelled: 'STORNIERT' }[o.status] })),
      h('ul', { class: 'ord-items' }, o.items.map(i => h('li', {}, h('b', { text: `${i.qty}×` }), h('span', { text: i.name })))),
      o.note ? h('p', { class: 'card-note' }, h('b', { text: 'Anmerkung: ' }), o.note) : null,
      h('p', { class: 'card-note', style: 'color:rgba(23,20,18,.6)' }, `Gesamt ${euro(o.totalCents)} · bezahlt wird vor Ort`),
      h('div', { class: 'actions' }, actions));
  }

  function renderBoard(view) {
    const by = st => S.orders.filter(o => o.status === st);
    const o = S.ordering;
    const banner = !o.enabled ? h('div', { class: 'panel', style: 'border-color:#9a5b00' }, h('strong', { text: 'Bestellen ist ausgeschaltet. ' }), 'Gäste können noch nichts bestellen. Prüfe zuerst die Karte, dann schalte es unter ', h('a', { href: '#', onclick: e => { e.preventDefault(); setTab('settings'); }, text: 'Einstellungen' }), ' frei.')
      : o.paused ? h('div', { class: 'panel', style: 'border-color:#9a5b00' }, h('strong', { text: 'Pause aktiv. ' }), 'Es kommen keine neuen Online-Bestellungen an.') : null;
    const section = (title, list, empty) => [h('h3', { text: `${title} (${list.length})` }), list.length ? list.map(orderCard) : (empty ? h('p', { class: 'empty', text: empty }) : null)];
    put(view,
      h('h2', { text: 'Tafel' }),
      banner,
      h('div', { class: 'daytools' },
        h('button', { class: `b ${o.paused ? 'primary' : ''}`, type: 'button', onclick: async () => { await saveOrdering({ paused: !o.paused }); }, text: o.paused ? 'Pause beenden' : 'Pause (keine neuen Bestellungen)' }),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: S.sound, onchange: e => { S.sound = e.target.checked; wr(SOUND_KEY, S.sound ? '1' : '0'); if (S.sound) beep(); } }), h('span', { text: 'Ton bei neuer Bestellung' }))),
      section('Neu', by('new'), 'Keine neuen Bestellungen.'),
      section('In Arbeit', by('preparing')),
      section('Fertig', by('ready')),
      by('done').length + by('cancelled').length ? h('details', { class: 'done' }, h('summary', { text: `Erledigt und storniert heute (${by('done').length + by('cancelled').length})` }), [...by('done'), ...by('cancelled')].reverse().map(orderCard)) : null);
  }

  async function saveOrdering(patch) {
    try { const out = await api('PUT', '/settings', { ordering: patch }); S.ordering = out.settings.ordering; await refresh(); }
    catch (e) { alert(e.message); await refresh(); }
  }

  /* -- Karte ----------------------------------------------------------------------- */

  const toCents = v => { const n = Number(String(v).replace(',', '.')); return String(v).trim() === '' || !Number.isFinite(n) || n <= 0 ? null : Math.round(n * 100); };
  const slug = name => `${name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28) || 'artikel'}-${Math.random().toString(36).slice(2, 6)}`;

  function renderMenu(view) {
    if (!S.menu) { put(view, h('p', { class: 'muted', text: 'Karte wird geladen …' })); return; }
    const m = S.menu;
    const touch = () => { S.dirty = true; const b = document.getElementById('saveMenu'); if (b) b.disabled = false; };
    const itemCard = it => {
      const name = h('input', { type: 'text', value: it.name, maxlength: '60', 'aria-label': 'Name', oninput: e => { it.name = e.target.value; touch(); } });
      const desc = h('input', { type: 'text', value: it.description || '', maxlength: '120', 'aria-label': 'Beschreibung', oninput: e => { it.description = e.target.value; touch(); } });
      const price = h('input', { type: 'text', inputmode: 'decimal', value: it.priceCents ? (it.priceCents / 100).toFixed(2).replace('.', ',') : '', placeholder: 'ohne Preis nicht bestellbar', 'aria-label': 'Preis in Euro', oninput: e => { it.priceCents = toCents(e.target.value); touch(); } });
      const cat = h('select', { 'aria-label': 'Kategorie', onchange: e => { it.category = e.target.value; touch(); } }, m.categories.map(c => h('option', { value: c.id, text: c.name })));
      cat.value = it.category;
      return h('article', { class: 'card', style: 'padding:14px 16px' },
        h('div', { class: 'form' },
          h('div', { class: 'f' }, h('label', { text: 'Name' }), name),
          h('div', { class: 'f' }, h('label', { text: 'Beschreibung' }), desc),
          h('div', { class: 'row2' }, h('div', { class: 'f' }, h('label', { text: 'Preis (€)' }), price), h('div', { class: 'f' }, h('label', { text: 'Kategorie' }), cat)),
          h('div', { class: 'actions', style: 'padding:0' },
            h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: it.available, onchange: async e => {
              const want = e.target.checked;
              try { await api('PATCH', `/menu/items/${it.id}`, { available: want }); it.available = want; }
              catch (ex) { e.target.checked = !want; alert(ex.message); }
            } }), h('span', { text: it.available ? 'Verfügbar' : 'Ausverkauft' })),
            h('button', { type: 'button', class: 'b small danger', onclick: () => { if (confirm(`„${it.name}“ von der Karte löschen?`)) { m.items = m.items.filter(x => x !== it); touch(); render(); } }, text: 'Löschen' }))));
    };
    const catName = h('input', { type: 'text', id: 'newCat', maxlength: '40', placeholder: 'Neue Kategorie' });
    put(view,
      h('h2', { text: 'Karte' }),
      h('p', { class: 'muted', text: 'Der Haken „Verfügbar“ wirkt sofort (z. B. wenn etwas ausverkauft ist). Alles andere gilt erst nach „Karte speichern“. Artikel ohne Preis können Gäste nicht bestellen und sehen sie nicht.' }),
      m.categories.map(c => [
        h('h3', { text: c.name }),
        m.items.filter(i => i.category === c.id).map(itemCard),
        h('button', { type: 'button', class: 'b small', onclick: () => { m.items.push({ id: slug('artikel'), category: c.id, name: 'Neuer Artikel', description: '', priceCents: null, available: true }); touch(); render(); }, text: `+ Artikel in „${c.name}“` })
      ]),
      h('div', { class: 'panel', style: 'margin-top:20px' }, h('div', { class: 'f' }, h('label', { for: 'newCat', text: 'Kategorie hinzufügen' }), catName),
        h('button', { type: 'button', class: 'b small', onclick: () => { const n = catName.value.trim(); if (!n) return; m.categories.push({ id: slug(n), name: n }); touch(); render(); }, text: '+ Kategorie' })),
      h('div', { style: 'position:sticky;bottom:calc(76px + env(safe-area-inset-bottom));margin-top:16px' },
        h('button', { type: 'button', class: 'b primary', id: 'saveMenu', disabled: !S.dirty, style: 'width:100%;min-height:56px', onclick: async e => {
          e.currentTarget.disabled = true;
          try { S.menu = (await api('PUT', '/menu', m)).menu; S.dirty = false; render(); alert('Karte gespeichert.'); }
          catch (ex) { e.currentTarget.disabled = false; alert(ex.message); }
        }, text: 'Karte speichern' })));
  }

  /* -- Tische & QR ------------------------------------------------------------------ */

  /** Gebrandeter QR-Code als SVG: FAME-Farben, DM Serif, runde Suchmuster. */
  function brandedQr(url, big, small) {
    const qr = qrcode(0, 'Q'); qr.addData(url); qr.make();
    const n = qr.getModuleCount(), q = 4, cell = 10, pad = 56;
    const size = (n + q * 2) * cell, W = size + pad * 2, top = 92, bottom = 150, H = top + size + bottom;
    const NS = 'http://www.w3.org/2000/svg';
    const el = (t, a, kids = []) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a || {})) e.setAttribute(k, v); for (const k of [].concat(kids)) e.append(k); return e; };
    const svg = el('svg', { xmlns: NS, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `QR-Code ${big}` });
    svg.append(el('rect', { width: W, height: H, rx: 36, fill: '#F6F3EC' }), el('rect', { x: 8, y: 8, width: W - 16, height: H - 16, rx: 30, fill: 'none', stroke: '#171412', 'stroke-opacity': '.14', 'stroke-width': 2 }));
    const text = (t, x, y, a) => { const e = el('text', { x, y, 'text-anchor': 'middle', ...a }); e.textContent = t; return e; };
    svg.append(text('FAME CAFÉ', W / 2, 62, { 'font-family': '"DM Serif Display",Georgia,serif', 'font-size': 40, fill: '#171412' }));
    // Alle Module in EINEM Pfad mit scharfen Kanten. Einzelne Rechtecke (oder Lücken/Rundungen
    // an den Modulen) erzeugen beim Skalieren feine Nähte; ein strenger Dekoder las solche Codes
    // nicht mehr. Nur die drei Suchmuster sind als abgerundete Ringe gezeichnet (FAME-Rundung) —
    // das bleibt lesbar, wie getestet.
    const inFinder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c) || inFinder(r, c)) continue;
      d += `M${pad + (c + q) * cell} ${top + (r + q) * cell}h${cell}v${cell}h-${cell}z`;
    }
    svg.append(el('path', { d, fill: '#263829', 'shape-rendering': 'crispEdges' }));
    for (const [fr, fc] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      const x = pad + (fc + q) * cell, y = top + (fr + q) * cell;
      svg.append(
        el('rect', { x: x + 5, y: y + 5, width: 60, height: 60, rx: 16, fill: 'none', stroke: '#263829', 'stroke-width': 10 }),
        el('rect', { x: x + 20, y: y + 20, width: 30, height: 30, rx: 8, fill: '#263829' }));
    }
    svg.append(text(big, W / 2, top + size + 72, { 'font-family': '"DM Serif Display",Georgia,serif', 'font-size': 64, fill: '#171412' }));
    svg.append(text(small, W / 2, top + size + 112, { 'font-family': 'Manrope,Arial,sans-serif', 'font-size': 18, 'letter-spacing': 6, 'font-weight': 600, fill: '#263829' }));
    svg.append(el('circle', { cx: W / 2, cy: top + size + 134, r: 4, fill: '#89A86B' }));
    return svg;
  }

  function renderTables(view) {
    const o = S.ordering;
    const area = h('textarea', { id: 'tableList', rows: '3', placeholder: 'z. B. 1, 2, 3, A1, A2' }, o.tables.join(', '));
    const count = h('input', { id: 'tableCount', type: 'number', min: '1', max: '200', inputmode: 'numeric', placeholder: 'z. B. 12' });
    const msg = h('p', { class: 'err', role: 'alert' });
    const origin = location.origin;
    const cards = [
      ...S.tables.map(t => ({ label: `TISCH ${t.label}`, small: 'SCAN · ORDER · ENJOY', url: `${origin}/bestellen/?t=${encodeURIComponent(t.label)}&k=${t.key}`, file: `tisch-${t.label}` })),
      ...(o.takeaway ? [{ label: 'TO GO', small: 'SCAN · ORDER · PICK UP', url: `${origin}/bestellen/`, file: 'mitnehmen' }] : [])
    ];
    const save = async tables => {
      msg.textContent = '';
      try { const out = await api('PUT', '/settings', { ordering: { tables } }); S.ordering = out.settings.ordering; S.tables = (await api('GET', '/tables')).tables; render(); }
      catch (e) { msg.textContent = e.message; }
    };
    put(view,
      h('h2', { text: 'Tische & QR-Codes' }),
      h('p', { class: 'muted', text: 'Jeder Tisch bekommt einen eigenen QR-Code. Er enthält einen geheimen Schlüssel, damit niemand von außen an einen Tisch bestellen kann. Ändert sich eine Tischbezeichnung, muss der Code neu gedruckt werden.' }),
      h('div', { class: 'panel form' },
        h('div', { class: 'row2' }, h('div', { class: 'f' }, h('label', { for: 'tableCount', text: 'Tische 1 bis …' }), count),
          h('div', { class: 'f' }, h('label', { text: ' ' }), h('button', { type: 'button', class: 'b', onclick: () => { const n = Number(count.value); if (Number.isInteger(n) && n > 0) save(Array.from({ length: n }, (_, i) => String(i + 1))); }, text: 'Anlegen' }))),
        h('div', { class: 'f' }, h('label', { for: 'tableList', text: 'oder eigene Bezeichnungen (Komma getrennt)' }), area),
        msg,
        h('button', { type: 'button', class: 'b primary', onclick: () => save(area.value.split(',').map(x => x.trim()).filter(Boolean)), text: 'Tische speichern' })),
      cards.length ? [
        h('div', { class: 'daytools' }, h('button', { type: 'button', class: 'b primary', id: 'printQr', onclick: () => window.print(), text: 'Alle QR-Codes drucken' }), h('span', { class: 'muted', text: `${cards.length} Karten, A4, 6 pro Seite` })),
        h('div', { class: 'qr-sheet', id: 'qrSheet' }, cards.map(c => {
          const svg = brandedQr(c.url, c.label, c.small);
          return h('figure', { class: 'qr-card', 'data-label': c.label }, svg,
            h('figcaption', { class: 'no-print' }, h('button', { type: 'button', class: 'b small', onclick: () => {
              const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
              const a = h('a', { href: URL.createObjectURL(blob), download: `fame-qr-${c.file}.svg` }); document.body.append(a); a.click(); a.remove();
            }, text: 'SVG laden' }), h('a', { class: 'b small', href: c.url, target: '_blank', rel: 'noopener', style: 'display:inline-flex;align-items:center;text-decoration:none', text: 'Testen' })));
        }))
      ] : h('p', { class: 'empty', text: 'Noch keine Tische angelegt.' }));
  }

  /* -- Einstellungen --------------------------------------------------------------- */

  function renderSettings(view) {
    const o = S.ordering;
    const msg = h('p', { class: 'err', role: 'alert' });
    const chk = (id, label, val, hint) => h('div', { class: 'f' }, h('label', { class: 'check' }, h('input', { type: 'checkbox', id, checked: val }), h('span', { text: label })), hint ? h('p', { class: 'hint', text: hint }) : null);
    const num = (id, label, val, min, max) => h('div', { class: 'f' }, h('label', { for: id, text: label }), h('input', { id, type: 'number', inputmode: 'numeric', value: val, min, max }));
    put(view,
      h('h2', { text: 'Einstellungen' }),
      h('form', { class: 'form', onsubmit: async e => {
        e.preventDefault(); msg.textContent = ''; msg.className = 'err';
        const g = id => document.getElementById(id);
        try {
          const out = await api('PUT', '/settings', { ordering: { enabled: g('oEnabled').checked, tableOrdering: g('oTable').checked, takeaway: g('oTake').checked, pickupLeadMin: Number(g('oLead').value), pickupStepMin: Number(g('oStep').value) } });
          S.ordering = out.settings.ordering; msg.className = 'err ok'; msg.textContent = 'Gespeichert.';
        } catch (ex) { msg.textContent = ex.message; }
      } },
        h('div', { class: 'panel form' },
          h('h3', { text: 'Online-Bestellung', style: 'margin-top:0' }),
          chk('oEnabled', 'Bestellen ist freigeschaltet', o.enabled, 'Erst einschalten, wenn Karte und Preise stimmen. Ohne Haken sehen Gäste: „Online bestellen ist noch nicht freigeschaltet“.'),
          chk('oTable', 'Bestellen am Tisch (per QR-Code)', o.tableOrdering, `${o.tables.length} Tische angelegt`),
          chk('oTake', 'Zum Mitnehmen / Abholen', o.takeaway, 'Erreichbar unter /bestellen/. Wird bewusst nicht von der Hauptseite verlinkt.')),
        h('div', { class: 'panel form' },
          h('h3', { text: 'Abholung', style: 'margin-top:0' }),
          h('div', { class: 'row2' }, num('oLead', 'Vorlauf (min)', o.pickupLeadMin, 0, 180), num('oStep', 'Zeitraster (min)', o.pickupStepMin, 5, 60))),
        msg,
        h('button', { class: 'b primary', type: 'submit', text: 'Speichern' })),
      h('div', { class: 'panel', style: 'margin-top:14px' }, h('h3', { text: 'Hinweise', style: 'margin-top:0' }),
        h('p', { class: 'muted', text: 'Bezahlt wird vor Ort; es gibt keine Online-Zahlung. Die Pause-Taste findest du auf der Tafel. Neue Bestellungen melden sich mit einem Ton, solange diese Seite offen ist.' })));
  }

  /* -- Start ------------------------------------------------------------------------ */

  S.code = readCode();
  if (S.code) start(); else renderLogin();
})();
