/* FAME CAFÉ — Verwaltung der Reservierungen.

   Für das Personal, am Handy oder Tablet. Der Zugangscode wird nur im Browser
   dieses Geräts gehalten (sessionStorage, oder localStorage, wenn „merken“
   gewählt ist) und als Bearer-Header gesendet — nie in der Adresse.

   Alle Texte aus der API (Namen, Anmerkungen) gelangen nur über textContent in
   die Seite, nie als Markup. */

(() => {
  'use strict';

  const app = document.getElementById('app');
  const KEY = 'fame-admin-code';
  const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const STATUS = { pending: 'Anfrage', confirmed: 'Bestätigt', seated: 'Platziert', completed: 'Fertig', declined: 'Abgelehnt', cancelled: 'Storniert', noshow: 'No-Show', expired: 'Abgelaufen' };
  const AREA = { any: 'Egal', indoor: 'Drinnen', outdoor: 'Draußen' };
  const ACTIVE = ['pending', 'confirmed', 'seated'];

  const S = { code: '', summary: null, tab: 'day', date: '', bookings: [], pending: [], blocks: [], online: true, sound: false, lastPending: null };

  /* -- Hilfen --------------------------------------------------------------- */

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
  /** Wie replaceChildren, aber mit verschachtelten Listen und null — replaceChildren schreibt beides als Text in die Seite. */
  const put = (el, ...nodes) => el.replaceChildren(...nodes.flat(Infinity).filter(n => n != null && n !== false));
  const dow = d => new Date(`${d}T00:00:00Z`).getUTCDay();
  const short = d => `${WD[dow(d)]} ${d.slice(8, 10)}.${d.slice(5, 7)}.`;
  const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const toMin = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const toTime = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const store = () => (localStorage.getItem(KEY) ? localStorage : sessionStorage);
  const readCode = () => { try { return localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || ''; } catch { return ''; } };

  class ApiError extends Error {
    constructor(res, json) { super(json?.message || `Fehler ${res.status}`); this.status = res.status; this.code = json?.error; this.canForce = !!json?.canForce; }
  }

  async function api(method, path, body) {
    let res;
    try {
      res = await fetch(`/api/admin${path}`, {
        method, headers: { Authorization: `Bearer ${S.code}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000)
      });
    } catch {
      S.online = false; paintStatusDot();
      throw Object.assign(new Error('Keine Verbindung.'), { code: 'network' });
    }
    S.online = true; paintStatusDot();
    let json = null;
    try { json = await res.json(); } catch { /* ohne Inhalt */ }
    if (res.status === 401) { logout('Zugangscode nicht korrekt.'); throw new ApiError(res, json); }
    if (!res.ok) throw new ApiError(res, json);
    return json;
  }

  function paintStatusDot() {
    const dot = document.getElementById('dot');
    if (dot) { dot.classList.toggle('off', !S.online); dot.title = S.online ? 'verbunden' : 'keine Verbindung'; }
  }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = 0.08;
      o.start(); o.stop(ctx.currentTime + 0.18);
    } catch { /* kein Ton möglich */ }
    navigator.vibrate?.(120);
  }

  /* -- Anmeldung ------------------------------------------------------------ */

  function logout(message = '') {
    try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch { /* ignorieren */ }
    S.code = '';
    clearInterval(timer);
    renderLogin(message);
  }

  function renderLogin(message = '') {
    document.title = 'Anmelden — FAME CAFÉ Verwaltung';
    const code = h('input', { id: 'code', type: 'password', autocomplete: 'current-password', autocapitalize: 'off', spellcheck: 'false', required: true });
    const keep = h('input', { id: 'keep', type: 'checkbox' });
    const err = h('p', { class: 'err', role: 'alert', text: message });
    const form = h('form', { class: 'login form', onsubmit: async e => {
      e.preventDefault();
      S.code = code.value.trim();
      err.textContent = '';
      try {
        await api('GET', '/summary');
        try { (keep.checked ? localStorage : sessionStorage).setItem(KEY, S.code); } catch { /* privater Modus */ }
        start();
      } catch (ex) {
        if (ex.status === 503) err.textContent = ex.message;
        else if (ex.status === 429) err.textContent = ex.message;
        else if (ex.code === 'network') err.textContent = 'Keine Verbindung zum Server.';
        else err.textContent = 'Zugangscode nicht korrekt.';
      }
    } },
      h('h1', { text: 'FAME CAFÉ' }),
      h('p', { text: 'Verwaltung der Reservierungen' }),
      h('div', { class: 'f' }, h('label', { for: 'code', text: 'Zugangscode' }), code),
      h('label', { class: 'check' }, keep, h('span', { text: 'Auf diesem Gerät angemeldet bleiben' })),
      err,
      h('button', { class: 'b primary', type: 'submit', text: 'Anmelden' }));
    app.replaceChildren(form);
    code.focus();
  }

  /* -- Rahmen --------------------------------------------------------------- */

  let timer = null;

  async function start() {
    try {
      S.summary = await api('GET', '/summary');
    } catch { return; }
    S.date = S.date || S.summary.now.date;
    S.lastPending = S.summary.pending;
    renderShell();
    await refresh();
    clearInterval(timer);
    timer = setInterval(() => { if (!document.hidden) refresh(true); }, 20000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && S.code) refresh(true); });
  }

  function renderShell() {
    const tab = (id, ico, label) => h('button', { class: 'tab', role: 'tab', id: `tab-${id}`, 'aria-selected': String(S.tab === id), onclick: () => setTab(id) },
      h('span', { class: 'tab-ico', 'aria-hidden': 'true', text: ico }), h('span', { text: label }),
      id === 'pending' ? h('span', { class: 'badge', id: 'badge', hidden: true }) : null);
    app.replaceChildren(
      h('header', { class: 'top' },
        h('div', {}, h('h1', { text: 'FAME Reservierungen' }), h('small', { id: 'sub', text: '' })),
        h('div', { class: 'top-actions' }, h('span', { class: 'pulse', id: 'dot', 'aria-hidden': 'true' }), h('a', { class: 'btn-ghost', id: 'toOrders', href: 'bestellungen.html', style: 'display:inline-flex;align-items:center;text-decoration:none' }, 'Bestellungen'), h('button', { class: 'btn-ghost', type: 'button', onclick: () => logout() }, 'Abmelden'))),
      h('nav', { class: 'tabs', role: 'tablist', 'aria-label': 'Bereiche' }, tab('day', '▦', 'Tag'), tab('pending', '✉', 'Anfragen'), tab('blocks', '⛔', 'Sperren'), tab('settings', '⚙', 'Einstellungen')),
      h('main', { id: 'view', tabindex: '-1' }),
      h('button', { class: 'fab', id: 'fab', type: 'button', onclick: () => openBookingDialog(), text: '+ Buchung' })
    );
    paintBadge();
  }

  function setTab(id) {
    S.tab = id;
    document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', String(t.id === `tab-${id}`)));
    document.getElementById('fab').hidden = !(id === 'day' || id === 'pending');
    refresh();
  }

  function paintBadge() {
    const n = S.summary?.pending || 0;
    const badge = document.getElementById('badge');
    if (badge) { badge.hidden = !n; badge.textContent = String(n); }
    const toOrders = document.getElementById('toOrders');
    if (toOrders) toOrders.textContent = S.summary?.newOrders ? `Bestellungen (${S.summary.newOrders})` : 'Bestellungen';
    const t = S.summary?.today;
    const sub = document.getElementById('sub');
    if (sub && t) sub.textContent = `HEUTE · ${t.bookings} Reservierungen · ${t.covers} Gäste`;
    document.title = `${n ? `(${n}) ` : ''}Reservierungen — FAME CAFÉ`;
  }

  async function refresh(silent = false) {
    try {
      const prev = S.lastPending;
      S.summary = await api('GET', '/summary');
      if (prev != null && S.summary.pending > prev && S.sound) beep();
      S.lastPending = S.summary.pending;
      paintBadge();
      if (S.tab === 'day') { S.bookings = (await api('GET', `/bookings?date=${S.date}`)).bookings; }
      if (S.tab === 'pending') { S.pending = (await api('GET', '/bookings?status=pending&upcoming=1')).bookings; }
      if (S.tab === 'blocks') { S.blocks = (await api('GET', '/blocks')).blocks; }
      if (silent && document.querySelector('dialog[open]')) return;   // offenen Dialog nicht wegziehen
      render();
    } catch (err) {
      if (!silent) put(document.getElementById('view'), h('p', { class: 'err', role: 'alert', text: err.message }));
    }
  }

  function render() {
    const view = document.getElementById('view');
    if (!view) return;
    const y = window.scrollY;
    ({ day: renderDay, pending: renderPending, blocks: renderBlocks, settings: renderSettings })[S.tab](view);
    window.scrollTo(0, y);
  }

  /* -- Nachrichten-Vorlagen für Rückmeldung --------------------------------- */

  function waNumber(phone) {
    const d = phone.replace(/[^\d+]/g, '');
    if (d.startsWith('+')) return d.slice(1);
    if (d.startsWith('00')) return d.slice(2);
    if (d.startsWith('0')) return `49${d.slice(1)}`;   // Annahme: deutsche Nummer ohne Vorwahl
    return d;
  }
  function messageFor(b) {
    const first = b.name.split(' ')[0];
    const when = `${short(b.date)} um ${b.time} Uhr für ${b.party} ${b.party === 1 ? 'Person' : 'Personen'}`;
    if (b.status === 'declined') return `Hallo ${first}, leider können wir deine Anfrage bei FAME CAFÉ (${when}) nicht bestätigen. Magst du eine andere Zeit probieren? Viele Grüße von FAME`;
    return `Hallo ${first}, deine Reservierung bei FAME CAFÉ ist bestätigt: ${when}. Der Tisch ist für ${b.durationMin} Minuten für dich da. Bis bald! (Nr. ${b.ref})`;
  }

  /* -- Karten --------------------------------------------------------------- */

  async function setStatus(b, status, extra = {}) {
    try {
      await api('PATCH', `/bookings/${b.id}`, { status, ...extra });
      await refresh();
    } catch (err) {
      if (err.canForce && confirm(`${err.message}\n\nTrotzdem ${status === 'confirmed' ? 'bestätigen' : 'eintragen'}?`)) {
        await api('PATCH', `/bookings/${b.id}`, { status, ...extra, force: true }).catch(e => alert(e.message));
        await refresh();
      } else if (!err.canForce) alert(err.message);
    }
  }

  function actionsFor(b) {
    const btn = (label, cls, fn) => h('button', { type: 'button', class: `b ${cls}`, onclick: async e => { e.currentTarget.disabled = true; await fn(); } , text: label });
    const out = [];
    if (b.status === 'pending') {
      out.push(btn('Bestätigen', 'primary', () => setStatus(b, 'confirmed')));
      out.push(btn('Ablehnen', 'danger', () => setStatus(b, 'declined')));
    } else if (b.status === 'confirmed') {
      out.push(btn('Gäste sind da', 'primary', () => setStatus(b, 'seated')));
      out.push(btn('No-Show', '', () => setStatus(b, 'noshow')));
      out.push(btn('Stornieren', 'danger', () => confirm('Reservierung wirklich stornieren?') ? setStatus(b, 'cancelled') : refresh()));
    } else if (b.status === 'seated') {
      out.push(btn('Fertig', 'primary', () => setStatus(b, 'completed')));
    } else {
      out.push(btn('Wieder bestätigen', '', () => setStatus(b, 'confirmed')));
    }
    out.push(h('button', { type: 'button', class: 'b small', onclick: () => openBookingDialog(b), text: 'Bearbeiten' }));
    return h('div', { class: 'actions' }, out);
  }

  function contactLinks(b) {
    const links = [];
    if (b.phone) {
      links.push(h('a', { href: `tel:${b.phone.replace(/[^\d+]/g, '')}`, text: 'Anrufen' }));
      links.push(h('a', { href: `https://wa.me/${waNumber(b.phone)}?text=${encodeURIComponent(messageFor(b))}`, target: '_blank', rel: 'noopener noreferrer', text: 'WhatsApp' }));
    }
    if (b.email) links.push(h('a', { href: `mailto:${b.email}?subject=${encodeURIComponent('Deine Reservierung bei FAME CAFÉ')}&body=${encodeURIComponent(messageFor(b))}`, text: 'E-Mail' }));
    return links.length ? h('div', { class: 'contact' }, links) : null;
  }

  function card(b, { showDate = false } = {}) {
    return h('article', { class: 'card', 'data-status': b.status },
      h('div', { class: 'card-head' },
        h('div', { class: 'time' }, b.time, h('small', { text: showDate ? `${short(b.date)} · bis ${b.endTime}` : `bis ${b.endTime}` })),
        h('div', { class: 'who' }, h('strong', { text: b.name || '—' }), h('span', { text: `${b.party} ${b.party === 1 ? 'Person' : 'Personen'} · ${AREA[b.area] || b.area}${b.assignedArea && b.area === 'any' ? ` → ${AREA[b.assignedArea]}` : ''} · ${b.ref}${b.source === 'staff' ? ' · intern' : ''}` })),
        h('span', { class: 'status', 'data-s': b.status, text: STATUS[b.status] || b.status })),
      b.note ? h('p', { class: 'card-note' }, h('b', { text: 'Gast: ' }), b.note) : null,
      b.staffNote ? h('p', { class: 'card-note' }, h('b', { text: 'Intern: ' }), b.staffNote) : null,
      ACTIVE.includes(b.status) || b.status === 'declined' ? contactLinks(b) : null,
      actionsFor(b));
  }

  /* -- Ansicht: Tag --------------------------------------------------------- */

  function occupancy(list) {
    const seats = S.summary.settings.seats;
    const out = [];
    for (const area of ['indoor', 'outdoor']) {
      const items = list.filter(b => ACTIVE.includes(b.status) && b.assignedArea === area);
      const points = new Set(items.map(b => toMin(b.time)));
      let max = 0, at = 0;
      for (const t of points) {
        const sum = items.filter(b => toMin(b.time) <= t && toMin(b.time) + b.durationMin > t).reduce((n, b) => n + b.party, 0);
        if (sum > max) { max = sum; at = t; }
      }
      const cap = seats[area];
      if (cap == null && !max) continue;
      const bad = cap != null && max > cap, warn = cap != null && max >= cap * 0.85;
      out.push(h('span', { class: `chip ${bad ? 'bad' : warn ? 'warn' : ''}`, text: `${AREA[area]}: ${max ? `Spitze ${max}${cap != null ? `/${cap}` : ''} um ${toTime(at)}` : cap != null ? `0/${cap}` : '—'}` }));
    }
    const loose = list.filter(b => ACTIVE.includes(b.status) && !b.assignedArea).reduce((n, b) => n + b.party, 0);
    if (loose) out.push(h('span', { class: 'chip', text: `${loose} Gäste ohne Platzzuweisung` }));
    return out;
  }

  function renderDay(view) {
    const list = S.bookings;
    const active = list.filter(b => ACTIVE.includes(b.status));
    const rest = list.filter(b => !ACTIVE.includes(b.status));
    const dateInput = h('input', { type: 'date', value: S.date, 'aria-label': 'Datum', onchange: e => { if (e.target.value) { S.date = e.target.value; refresh(); } } });
    put(view, 
      h('h2', { text: S.date === S.summary.now.date ? 'Heute' : short(S.date) }),
      h('div', { class: 'daybar' },
        h('button', { type: 'button', 'aria-label': 'Vorheriger Tag', onclick: () => { S.date = addDays(S.date, -1); refresh(); }, text: '‹' }),
        dateInput,
        h('button', { type: 'button', 'aria-label': 'Nächster Tag', onclick: () => { S.date = addDays(S.date, 1); refresh(); }, text: '›' })),
      h('div', { class: 'daytools' },
        h('span', { class: 'stat', text: `${active.length} Reservierungen · ${active.reduce((n, b) => n + b.party, 0)} Gäste` }),
        S.date !== S.summary.now.date ? h('button', { class: 'b small', type: 'button', onclick: () => { S.date = S.summary.now.date; refresh(); }, text: 'Heute' }) : null),
      h('div', { class: 'daytools' }, occupancy(list)),
      active.length ? active.map(b => card(b)) : h('p', { class: 'empty', text: 'Keine Reservierungen an diesem Tag.' }),
      rest.length ? h('details', { class: 'done' }, h('summary', { text: `Erledigt, storniert, abgelehnt (${rest.length})` }), rest.map(b => card(b))) : null
    );
    document.getElementById('fab').hidden = false;
  }

  /* -- Ansicht: Anfragen ---------------------------------------------------- */

  function renderPending(view) {
    const byDate = new Map();
    for (const b of S.pending) { if (!byDate.has(b.date)) byDate.set(b.date, []); byDate.get(b.date).push(b); }
    put(view, 
      h('h2', { text: 'Offene Anfragen' }),
      S.summary.settings.mode === 'instant' ? h('p', { class: 'hint', text: 'Sofortbuchung ist aktiv. Anfragen entstehen nur, wenn ein Bereich keine hinterlegte Platzzahl hat.' }) : null,
      S.pending.length ? [...byDate].map(([d, items]) => [h('h3', { text: short(d) }), items.map(b => card(b))]) : h('p', { class: 'empty', text: 'Keine offenen Anfragen. Alles bearbeitet.' }));
  }

  /* -- Ansicht: Sperren ----------------------------------------------------- */

  function renderBlocks(view) {
    const date = h('input', { id: 'bdate', type: 'date', value: S.summary.now.date, required: true });
    const from = h('input', { id: 'bfrom', type: 'time', value: '00:00' });
    const to = h('input', { id: 'bto', type: 'time', value: '23:59' });
    const area = h('select', { id: 'barea' }, h('option', { value: 'all', text: 'Alles' }), h('option', { value: 'indoor', text: 'Drinnen' }), h('option', { value: 'outdoor', text: 'Draußen' }));
    const seats = h('input', { id: 'bseats', type: 'number', min: '1', inputmode: 'numeric', placeholder: 'leer = komplett' });
    const reason = h('input', { id: 'breason', type: 'text', maxlength: '80', placeholder: 'z. B. Private Feier' });
    const msg = h('p', { class: 'err', role: 'alert' });
    const post = async body => {
      msg.textContent = '';
      try {
        const out = await api('POST', '/blocks', body);
        if (out.conflicts.length) alert(`Achtung: ${out.conflicts.length} bestehende Reservierung(en) liegen in diesem Zeitraum:\n\n${out.conflicts.map(c => `${c.time} · ${c.party} Pers. · ${c.name} (${c.ref})`).join('\n')}\n\nSie wurden nicht automatisch storniert.`);
        await refresh();
      } catch (e) { msg.textContent = e.message; }
    };
    const nowMin = S.summary.now.minute;
    put(view, 
      h('h2', { text: 'Zeiten sperren' }),
      h('p', { class: 'muted', text: 'Gesperrte Zeiten sind online sofort nicht mehr buchbar. Bestehende Reservierungen bleiben bestehen.' }),
      h('div', { class: 'panel' },
        h('div', { class: 'daytools' },
          h('button', { class: 'b', type: 'button', onclick: () => confirm('Heute komplett für Online-Reservierungen sperren?') && post({ date: S.summary.now.date, from: '00:00', to: '24:00', area: 'all', reason: 'Heute geschlossen' }), text: 'Heute komplett sperren' }),
          h('button', { class: 'b', type: 'button', onclick: () => post({ date: S.summary.now.date, from: toTime(Math.min(nowMin, 1439)), to: '24:00', area: 'all', reason: 'Ab jetzt gesperrt (voll)' }), text: 'Ab jetzt sperren' })),
        h('form', { class: 'form', style: 'margin-top:16px', onsubmit: e => { e.preventDefault(); post({ date: date.value, from: from.value || '00:00', to: to.value === '23:59' ? '24:00' : to.value, area: area.value, seats: seats.value || null, reason: reason.value }); } },
          h('div', { class: 'f' }, h('label', { for: 'bdate', text: 'Datum' }), date),
          h('div', { class: 'row2' }, h('div', { class: 'f' }, h('label', { for: 'bfrom', text: 'Von' }), from), h('div', { class: 'f' }, h('label', { for: 'bto', text: 'Bis' }), to)),
          h('div', { class: 'row2' }, h('div', { class: 'f' }, h('label', { for: 'barea', text: 'Bereich' }), area), h('div', { class: 'f' }, h('label', { for: 'bseats', text: 'Plätze abziehen' }), seats)),
          h('div', { class: 'f' }, h('label', { for: 'breason', text: 'Grund (nur intern)' }), reason),
          h('p', { class: 'hint', text: '„Plätze abziehen“ blockt nur diese Anzahl Plätze, z. B. für eine Gruppe. Leer = der Bereich ist in dieser Zeit komplett gesperrt.' }),
          msg,
          h('button', { class: 'b primary', type: 'submit', text: 'Sperre anlegen' }))),
      h('h3', { text: 'Aktive Sperren' }),
      S.blocks.length ? h('div', { class: 'panel' }, S.blocks.map(b => h('div', { class: 'list-row' },
        h('div', {}, h('strong', { text: `${short(b.date)} · ${b.from}–${b.to}` }), h('span', { class: 'muted', text: `${b.area === 'all' ? 'Alles' : AREA[b.area]}${b.seats ? ` · ${b.seats} Plätze` : ' · komplett'}${b.reason ? ` · ${b.reason}` : ''}` })),
        h('button', { class: 'b small danger', type: 'button', onclick: async () => { await api('DELETE', `/blocks/${b.id}`).catch(e => alert(e.message)); refresh(); }, text: 'Löschen' })))) : h('p', { class: 'empty', text: 'Keine Sperren eingetragen.' }));
    document.getElementById('fab').hidden = true;
  }

  /* -- Ansicht: Einstellungen ----------------------------------------------- */

  function renderSettings(view) {
    const s = S.summary.settings;
    const num = (id, label, value, attrs = {}, hint) => h('div', { class: 'f' }, h('label', { for: id, text: label }), h('input', { id, type: 'number', inputmode: 'numeric', value: value ?? '', ...attrs }), hint ? h('p', { class: 'hint', text: hint }) : null);
    const mode = h('select', { id: 'mode' }, h('option', { value: 'request', text: 'Anfrage — wir bestätigen jede Reservierung' }), h('option', { value: 'instant', text: 'Sofortbuchung — System bestätigt selbst' }));
    mode.value = s.mode;
    const special = Object.entries(s.hours.special).sort(([a], [b]) => a.localeCompare(b));
    const msg = h('p', { class: 'err', role: 'alert' });
    const specialList = h('div', {}, special.map(([d, hrs]) => h('div', { class: 'list-row', 'data-special': d },
      h('div', {}, h('strong', { text: short(d) + ' ' + d.slice(0, 4) }), h('span', { class: 'muted', text: hrs ? `${hrs.open}–${hrs.close}` : 'geschlossen' })),
      h('button', { class: 'b small danger', type: 'button', onclick: async () => { const next = { ...s.hours.special }; delete next[d]; await saveSettings({ hours: { special: next } }, msg); }, text: 'Entfernen' }))));
    const sd = h('input', { id: 'sdate', type: 'date' }), so = h('input', { id: 'sopen', type: 'time', value: '10:00' }), sc = h('input', { id: 'sclose', type: 'time', value: '22:00' });
    const soundBox = h('input', { id: 'sound', type: 'checkbox', checked: S.sound, onchange: e => { S.sound = e.target.checked; if (S.sound) beep(); } });

    put(view, 
      h('h2', { text: 'Einstellungen' }),
      h('form', { class: 'form', onsubmit: async e => {
        e.preventDefault();
        const v = id => document.getElementById(id).value;
        await saveSettings({
          mode: v('mode'), durationMin: Number(v('dur')), slotStepMin: Number(v('step')), minLeadMin: Number(v('lead')),
          maxDaysAhead: Number(v('ahead')), maxParty: Number(v('party')), retentionDays: Number(v('keep')),
          seats: { indoor: v('seatIn') === '' ? null : Number(v('seatIn')), outdoor: v('seatOut') === '' ? null : Number(v('seatOut')) },
          hours: { regular: { open: v('hopen'), close: v('hclose'), from: v('hfrom') } }
        }, msg);
      } },
        h('div', { class: 'panel form' },
          h('h3', { text: 'Betrieb', style: 'margin-top:0' }),
          h('div', { class: 'f' }, h('label', { for: 'mode', text: 'Wie sollen Reservierungen laufen?' }), mode,
            h('p', { class: 'hint', text: 'Sofortbuchung braucht eingetragene Plätze, sonst kann das System nicht vor Überbuchung schützen.' })),
          h('div', { class: 'row2' },
            num('seatIn', 'Plätze drinnen', s.seats.indoor, { min: '1' }),
            num('seatOut', 'Plätze draußen', s.seats.outdoor, { min: '1' })),
          h('p', { class: 'hint', text: 'Leer lassen, solange die echte Zahl nicht feststeht. Dann bleibt jede Zeit anfragbar und Sie entscheiden bei der Bestätigung.' })),
        h('div', { class: 'panel form' },
          h('h3', { text: 'Zeiten', style: 'margin-top:0' }),
          h('div', { class: 'row2' }, num('dur', 'Dauer pro Reservierung (min)', s.durationMin, { min: '30', max: '240' }), num('step', 'Zeitraster (min)', s.slotStepMin, { min: '15', max: '120' })),
          h('div', { class: 'row3' }, num('lead', 'Vorlauf (min)', s.minLeadMin, { min: '0' }), num('ahead', 'Tage im Voraus', s.maxDaysAhead, { min: '1', max: '365' }), num('party', 'Max. Personen', s.maxParty, { min: '1', max: '40' })),
          h('p', { class: 'hint', text: 'Eine geänderte Dauer gilt nur für neue Reservierungen.' })),
        h('div', { class: 'panel form' },
          h('h3', { text: 'Reguläre Öffnungszeiten', style: 'margin-top:0' }),
          h('div', { class: 'row3' },
            h('div', { class: 'f' }, h('label', { for: 'hopen', text: 'Von' }), h('input', { id: 'hopen', type: 'time', value: s.hours.regular.open })),
            h('div', { class: 'f' }, h('label', { for: 'hclose', text: 'Bis' }), h('input', { id: 'hclose', type: 'time', value: s.hours.regular.close })),
            h('div', { class: 'f' }, h('label', { for: 'hfrom', text: 'Gilt ab' }), h('input', { id: 'hfrom', type: 'date', value: s.hours.regular.from }))),
          h('p', { class: 'hint', text: 'Täglich. Der letzte Start liegt eine Reservierungsdauer vor Ladenschluss.' })),
        h('div', { class: 'panel form' },
          h('h3', { text: 'Datenschutz', style: 'margin-top:0' }),
          num('keep', 'Kontaktdaten löschen nach (Tagen)', s.retentionDays, { min: '7', max: '365' }, 'Name, Telefon, E-Mail und Anmerkung werden so viele Tage nach dem Termin entfernt. Die Datenschutzerklärung nennt diese Frist.')),
        msg,
        h('button', { class: 'b primary', type: 'submit', text: 'Einstellungen speichern' })),

      h('div', { class: 'panel', style: 'margin-top:14px' },
        h('h3', { text: 'Sonderzeiten und Feiertage', style: 'margin-top:0' }),
        special.length ? specialList : h('p', { class: 'muted', text: 'Keine Sonderzeiten.' }),
        h('form', { class: 'form', style: 'margin-top:12px', onsubmit: async e => {
          e.preventDefault();
          if (!sd.value) return;
          await saveSettings({ hours: { special: { ...s.hours.special, [sd.value]: { open: so.value, close: sc.value } } } }, msg);
        } },
          h('div', { class: 'row3' },
            h('div', { class: 'f' }, h('label', { for: 'sdate', text: 'Datum' }), sd),
            h('div', { class: 'f' }, h('label', { for: 'sopen', text: 'Von' }), so),
            h('div', { class: 'f' }, h('label', { for: 'sclose', text: 'Bis' }), sc)),
          h('button', { class: 'b', type: 'submit', text: 'Sonderzeit hinzufügen' }),
          h('button', { class: 'b danger', type: 'button', onclick: async () => { if (!sd.value) return alert('Bitte zuerst ein Datum wählen.'); await saveSettings({ hours: { special: { ...s.hours.special, [sd.value]: null } } }, msg); }, text: 'Datum als geschlossen eintragen' }))),

      h('div', { class: 'panel' },
        h('h3', { text: 'Dieses Gerät', style: 'margin-top:0' }),
        h('label', { class: 'check' }, soundBox, h('span', { text: 'Ton und Vibration bei neuen Anfragen (solange diese Seite geöffnet ist)' }))));
    document.getElementById('fab').hidden = true;
  }

  async function saveSettings(patch, msg) {
    msg.textContent = '';
    try {
      const out = await api('PUT', '/settings', patch);
      S.summary.settings = out.settings;
      msg.className = 'err ok'; msg.textContent = 'Gespeichert.';
      setTimeout(() => render(), 600);
    } catch (e) { msg.className = 'err'; msg.textContent = e.message; }
  }

  /* -- Dialog: Buchung anlegen/bearbeiten ----------------------------------- */

  function openBookingDialog(b) {
    const editing = !!b;
    const d = h('dialog', { 'aria-labelledby': 'dlgTitle' });
    const v = {
      name: h('input', { id: 'dn', type: 'text', value: b?.name || '', maxlength: '60', autocomplete: 'off', required: true }),
      phone: h('input', { id: 'dp', type: 'tel', value: b?.phone || '', maxlength: '30', inputmode: 'tel' }),
      email: h('input', { id: 'de', type: 'email', value: b?.email || '', maxlength: '120' }),
      date: h('input', { id: 'dd', type: 'date', value: b?.date || S.date, required: true }),
      time: h('input', { id: 'dt', type: 'time', value: b?.time || '19:00', step: '900', required: true }),
      party: h('input', { id: 'dq', type: 'number', min: '1', max: '40', inputmode: 'numeric', value: b?.party || 2, required: true }),
      area: h('select', { id: 'da' }, ['any', 'indoor', 'outdoor'].map(a => h('option', { value: a, text: AREA[a] }))),
      note: h('textarea', { id: 'dnote', maxlength: '300', text: b?.note || '' }),
      staffNote: h('textarea', { id: 'dsn', maxlength: '300', text: b?.staffNote || '' })
    };
    v.area.value = b?.area || 'any';
    const msg = h('p', { class: 'err', role: 'alert' });
    const f = (id, label, el) => h('div', { class: 'f' }, h('label', { for: id, text: label }), el);

    const body = () => ({
      name: v.name.value, phone: v.phone.value, email: v.email.value, date: v.date.value, time: v.time.value,
      party: Number(v.party.value), area: v.area.value, note: v.note.value, staffNote: v.staffNote.value
    });
    async function submit(force = false) {
      msg.textContent = '';
      try {
        if (editing) await api('PATCH', `/bookings/${b.id}`, { ...body(), ...(force ? { force: true } : {}) });
        else { const { staffNote, ...rest } = body(); await api('POST', '/bookings', { ...rest, ...(force ? { force: true } : {}) }); }
        d.close(); d.remove();
        S.date = v.date.value; await refresh();
      } catch (e) {
        if (e.status === 409 && e.code !== 'outside-hours' && confirm(`${e.message}\n\nTrotzdem eintragen?`)) return submit(true);
        msg.textContent = e.message;
      }
    }

    d.append(h('form', { class: 'dlg form', method: 'dialog', onsubmit: e => { e.preventDefault(); submit(); } },
      h('div', { class: 'dlg-head' },
        h('h2', { id: 'dlgTitle', text: editing ? `Reservierung ${b.ref}` : 'Neue Buchung' }),
        h('button', { class: 'x', type: 'button', 'aria-label': 'Schließen', onclick: () => { d.close(); d.remove(); }, text: '×' })),
      !editing ? h('p', { class: 'muted', text: 'Für Anrufe und Laufkundschaft. Wird sofort als bestätigt eingetragen.' }) : null,
      f('dn', 'Name', v.name),
      h('div', { class: 'row2' }, f('dp', 'Telefon', v.phone), f('de', 'E-Mail', v.email)),
      h('div', { class: 'row2' }, f('dd', 'Datum', v.date), f('dt', 'Uhrzeit', v.time)),
      h('div', { class: 'row2' }, f('dq', 'Personen', v.party), f('da', 'Platz', v.area)),
      f('dnote', 'Anmerkung des Gastes', v.note),
      editing ? f('dsn', 'Interne Notiz', v.staffNote) : null,
      msg,
      h('button', { class: 'b primary', type: 'submit', text: editing ? 'Speichern' : 'Eintragen' }),
      editing && b.history?.length ? h('div', {}, h('h3', { text: 'Verlauf' }), h('ul', { class: 'hist' }, [...b.history].reverse().map(x => h('li', { text: `${new Date(x.at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${x.by === 'guest' ? 'Gast' : x.by === 'staff' ? 'Personal' : 'System'} · ${x.action}` })))) : null));
    document.body.append(d);
    d.addEventListener('close', () => d.remove());
    d.showModal();
    v.name.focus();
  }

  /* -- Start ---------------------------------------------------------------- */

  S.code = readCode();
  if (S.code) start(); else renderLogin();
})();
