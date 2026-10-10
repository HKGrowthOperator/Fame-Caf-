/* FAME CAFÉ — Tischreservierung (Gäste-Seite).

   Ausfallsicherheit: Der Abschnitt #reservieren steht im HTML mit einem
   ehrlichen Ersatztext (Instagram). Dieses Skript ersetzt ihn erst, wenn
   /api/config antwortet. Scheitert die API, bleibt der Ersatztext stehen —
   die Seite verspricht nie eine Reservierung, die nicht entgegengenommen wird.

   Keine Speicherung im Browser: weder Cookies noch localStorage. Der Link zur
   eigenen Reservierung wird dem Gast angezeigt, nicht gemerkt. */

(() => {
  'use strict';

  const root = document.getElementById('reserveRoot');
  if (!root) return;
  const fallback = document.getElementById('reserveFallback');
  const fab = document.getElementById('reserveFab');
  const INSTAGRAM = 'https://www.instagram.com/fame.cafe.gm/';

  const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const WD_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const AREA_LABEL = { any: 'egal', indoor: 'drinnen', outdoor: 'draußen' };

  const state = { cfg: null, party: 2, date: '', time: '', area: 'any', days: [], slots: [], dayInfo: null };
  let seq = 0;

  /* -- Hilfsfunktionen ------------------------------------------------------ */

  /** Baut DOM ohne innerHTML: Namen und Texte aus der API landen nie als Markup. */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  }

  const dparts = d => d.split('-').map(Number);
  const dow = d => { const [y, m, dd] = dparts(d); return new Date(Date.UTC(y, m - 1, dd)).getUTCDay(); };
  const short = d => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;
  const longDate = d => `${WD_LONG[dow(d)]}, ${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
  const plural = n => (n === 1 ? '1 Person' : `${n} Personen`);
  const minToTime = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const timeToMin = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const endOf = t => minToTime(Math.min(timeToMin(t) + state.cfg.durationMin, 1440));
  const addDays = (d, n) => { const [y, m, dd] = dparts(d); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };

  async function api(path, options = {}) {
    let res;
    try {
      res = await fetch(`/api${path}`, {
        ...options,
        headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
        signal: AbortSignal.timeout(12000)
      });
    } catch {
      throw Object.assign(new Error('Keine Verbindung zum Reservierungssystem.'), { code: 'network' });
    }
    let json = null;
    try { json = await res.json(); } catch { /* kein JSON, z. B. Fehlerseite des Proxys */ }
    if (!res.ok || !json) {
      throw Object.assign(new Error(json?.message || 'Das Reservierungssystem antwortet nicht.'), { status: res.status, code: json?.error || 'server', field: json?.field });
    }
    return json;
  }

  function mount(...nodes) {
    root.replaceChildren(...nodes);
  }

  function focusAndShow(el) {
    el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'start', behavior: 'auto' });
  }

  /* -- Nicht erreichbar ----------------------------------------------------- */

  function showUnavailable(message) {
    if (!fallback) return;
    const title = fallback.querySelector('.reserve-fallback-title');
    const text = fallback.querySelector('p:not(.reserve-fallback-title)');
    if (title) title.textContent = 'Reservieren per Instagram';
    if (text) text.textContent = message || 'Unser Reservierungssystem antwortet gerade nicht. Schreib uns bitte eine Nachricht auf Instagram, wir kümmern uns darum.';
  }

  /* -- Formular ------------------------------------------------------------- */

  function field(id, label, input, hint) {
    return h('div', { class: 'rf-field', 'data-field': id },
      h('label', { for: id }, label),
      input,
      hint ? h('p', { class: 'rf-hint', id: `${id}-hint`, text: hint }) : null,
      h('p', { class: 'rf-error', id: `${id}-error`, role: 'alert' })
    );
  }

  function setError(fieldId, message) {
    const wrap = root.querySelector(`[data-field="${fieldId}"]`);
    if (!wrap) return false;
    const input = wrap.querySelector('input,textarea');
    const err = wrap.querySelector('.rf-error');
    err.textContent = message || '';
    wrap.classList.toggle('has-error', !!message);
    if (input) {
      if (message) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', err.id); }
      else { input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); }
    }
    return true;
  }

  function buildForm() {
    const cfg = state.cfg;
    const form = h('form', { class: 'rf', novalidate: true, autocomplete: 'on' });
    const left = [], right = [];   // zwei Spalten auf dem Desktop, untereinander auf dem Handy

    /* Personen */
    const partyOut = h('output', { class: 'rf-party-num', id: 'rfPartyNum', 'aria-live': 'polite', text: String(state.party) });
    const minus = h('button', { type: 'button', class: 'rf-step', 'aria-label': 'Eine Person weniger', onclick: () => setParty(state.party - 1) }, h('span', { 'aria-hidden': 'true', text: '−' }));
    const plus = h('button', { type: 'button', class: 'rf-step', 'aria-label': 'Eine Person mehr', onclick: () => setParty(state.party + 1) }, h('span', { 'aria-hidden': 'true', text: '+' }));
    left.push(h('fieldset', { class: 'rf-set' },
      h('legend', { text: '01 · PERSONEN' }),
      h('div', { class: 'rf-party' }, minus, h('div', { class: 'rf-party-val' }, partyOut, h('span', { id: 'rfPartyWord', text: 'Personen' })), plus),
      h('p', { class: 'rf-hint', text: `Online bis ${cfg.maxParty} Personen. Für größere Gruppen schreib uns bitte auf Instagram.` })
    ));

    /* Tag */
    const dateInput = h('input', { type: 'date', id: 'rfDate', min: cfg.today, max: addDays(cfg.today, cfg.maxDaysAhead), onchange: e => pickDate(e.target.value, 'input') });
    left.push(h('fieldset', { class: 'rf-set' },
      h('legend', { text: '02 · TAG' }),
      h('div', { class: 'rf-days', id: 'rfDays', role: 'radiogroup', 'aria-label': 'Tag wählen' }),
      h('div', { class: 'rf-other-date' }, h('label', { for: 'rfDate', text: 'Anderes Datum' }), dateInput)
    ));

    /* Uhrzeit */
    left.push(h('fieldset', { class: 'rf-set', id: 'rfTimeSet' },
      h('legend', { text: '03 · UHRZEIT' }),
      h('p', { class: 'rf-status', id: 'rfSlotStatus', role: 'status' }),
      h('div', { class: 'rf-times', id: 'rfTimes' }),
      h('p', { class: 'rf-error', id: 'time-error', role: 'alert' })
    ));

    /* Bereich */
    const seg = (value, label) => h('label', { class: 'rf-seg' },
      h('input', { type: 'radio', name: 'area', value, checked: value === state.area, onchange: () => { state.area = value; renderTimes(); updateSummary(); } }),
      h('span', { text: label }));
    right.push(h('fieldset', { class: 'rf-set' },
      h('legend', { text: '04 · PLATZ' }),
      h('div', { class: 'rf-segs' }, seg('any', 'Egal'), seg('indoor', 'Drinnen'), seg('outdoor', 'Draußen'))
    ));

    /* Kontakt */
    right.push(h('fieldset', { class: 'rf-set' },
      h('legend', { text: '05 · DEINE ANGABEN' }),
      field('name', 'Name', h('input', { id: 'name', name: 'name', type: 'text', autocomplete: 'name', maxlength: '60', required: true, enterkeyhint: 'next' })),
      field('phone', 'Telefon', h('input', { id: 'phone', name: 'phone', type: 'tel', inputmode: 'tel', autocomplete: 'tel', maxlength: '30', enterkeyhint: 'next' }), 'Telefon oder E-Mail genügt. So können wir dich erreichen, falls sich etwas ändert.'),
      field('email', 'E-Mail', h('input', { id: 'email', name: 'email', type: 'email', inputmode: 'email', autocomplete: 'email', autocapitalize: 'off', maxlength: '120', enterkeyhint: 'next' })),
      field('note', 'Anmerkung (optional)', h('textarea', { id: 'note', name: 'note', rows: '2', maxlength: '300', placeholder: 'z. B. Kinderwagen, Hund, Allergie' })),
      h('div', { class: 'rf-hp', 'aria-hidden': 'true' }, h('label', { for: 'website', text: 'Website' }), h('input', { id: 'website', name: 'website', type: 'text', tabindex: '-1', autocomplete: 'off' })),
      h('div', { class: 'rf-field rf-consent', 'data-field': 'privacy' },
        h('label', { class: 'rf-check' },
          h('input', { id: 'privacy', name: 'privacy', type: 'checkbox' }),
          h('span', {}, 'Ich habe die ', h('a', { href: 'datenschutz.html', target: '_blank', rel: 'noopener' }, 'Datenschutzhinweise'), ' gelesen. Meine Angaben werden zur Bearbeitung der Reservierung gespeichert.')
        ),
        h('p', { class: 'rf-error', id: 'privacy-error', role: 'alert' }))
    ));

    form.append(h('div', { class: 'rf-cols' }, h('div', { class: 'rf-col' }, left), h('div', { class: 'rf-col' }, right)));

    /* Abschluss: Hinweis steht vor dem angeklebten Bereich, damit dieser nur
       Zusammenfassung und Button trägt und das Formular nicht verdeckt. */
    form.append(
      h('p', { class: 'rf-note', id: 'rfModeNote', text: cfg.instant ? 'Deine Reservierung ist sofort verbindlich.' : 'Wir bestätigen deine Anfrage. Den Stand siehst du danach über deinen persönlichen Link.' }),
      h('div', { class: 'rf-submit' },
        h('p', { class: 'rf-error rf-form-error', id: 'form-error', role: 'alert' }),
        h('p', { class: 'rf-summary', id: 'rfSummary', 'aria-live': 'polite' }),
        h('button', { class: 'rf-button', type: 'submit', id: 'rfSubmit' }, cfg.instant ? 'Verbindlich reservieren' : 'Reservierung anfragen'))
    );

    form.addEventListener('submit', onSubmit);
    mount(form);
    renderParty();
  }

  /* -- Zustand → Ansicht ---------------------------------------------------- */

  function renderParty() {
    root.querySelector('#rfPartyNum').textContent = String(state.party);
    root.querySelector('#rfPartyWord').textContent = state.party === 1 ? 'Person' : 'Personen';
    const [minus, plus] = root.querySelectorAll('.rf-step');
    minus.disabled = state.party <= 1;
    plus.disabled = state.party >= state.cfg.maxParty;
  }

  async function setParty(n) {
    const next = Math.min(state.cfg.maxParty, Math.max(1, n));
    if (next === state.party) return;
    state.party = next;
    renderParty();
    await loadDays();
  }

  async function loadDays() {
    const mine = ++seq;
    root.querySelector('#rfDays').setAttribute('aria-busy', 'true');
    try {
      const { days } = await api(`/days?party=${state.party}`);
      if (mine !== seq) return;
      state.days = days;
    } catch (err) {
      if (mine !== seq) return;
      return failLoad(err);
    }
    // gewählten Tag behalten, wenn er noch geht; sonst den ersten freien nehmen
    const keep = state.days.find(d => d.date === state.date && d.available);
    const first = state.days.find(d => d.available);
    state.date = keep ? keep.date : (state.date && !state.days.some(d => d.date === state.date) ? state.date : first?.date || '');
    renderDays();
    await loadSlots(mine);
  }

  function failLoad(err) {
    if (err.code === 'network' || err.status >= 500) {
      mount(h('div', { class: 'reserve-fallback' },
        h('p', { class: 'reserve-fallback-title', text: 'Gerade nicht erreichbar' }),
        h('p', { text: 'Unser Reservierungssystem antwortet im Moment nicht. Schreib uns bitte eine Nachricht auf Instagram, wir kümmern uns darum.' }),
        h('a', { class: 'reserve-fallback-link', href: INSTAGRAM, target: '_blank', rel: 'noopener noreferrer', text: '@fame.cafe.gm auf Instagram' })));
    }
  }

  function renderDays() {
    const box = root.querySelector('#rfDays');
    box.removeAttribute('aria-busy');
    const today = state.cfg.today;
    const tomorrow = addDays(today, 1);
    box.replaceChildren(...state.days.map(d => {
      const label = d.date === today ? 'Heute' : d.date === tomorrow ? 'Morgen' : WD[dow(d.date)];
      const stateName = !d.open || d.late ? 'closed' : d.available ? 'ok' : 'full';
      const sub = !d.open ? 'zu' : d.late ? 'vorbei' : stateName === 'full' ? 'voll' : '';
      return h('label', { class: 'rf-day', 'data-state': stateName },
        h('input', { type: 'radio', name: 'date', value: d.date, checked: d.date === state.date, disabled: stateName !== 'ok', 'aria-label': `${WD_LONG[dow(d.date)]}, ${short(d.date)}${!d.open ? ', geschlossen' : d.late ? ', heute nicht mehr buchbar' : stateName === 'full' ? ', ausgebucht' : ''}`, onchange: () => pickDate(d.date, 'chip') }),
        h('span', { class: 'rf-day-wd', text: label }),
        h('span', { class: 'rf-day-d', text: short(d.date) }),
        h('span', { class: 'rf-day-s', text: sub }));
    }));
    const input = root.querySelector('#rfDate');
    if (input && state.date) input.value = state.date;
    // gewählten Tag ins Bild holen, ohne die Seite zu bewegen
    const checked = box.querySelector('input:checked');
    if (checked) {
      const chip = checked.parentElement;
      box.scrollLeft = Math.max(0, chip.offsetLeft - box.clientWidth / 2 + chip.offsetWidth / 2);
    }
  }

  async function pickDate(date, via) {
    if (!date) return;
    state.date = date;
    state.time = '';
    if (via === 'input') {
      const chip = [...root.querySelectorAll('.rf-day input')].find(i => i.value === date && !i.disabled);
      root.querySelectorAll('.rf-day input').forEach(i => { i.checked = i === chip; });
    } else {
      const input = root.querySelector('#rfDate');
      if (input) input.value = date;
    }
    await loadSlots(++seq);
  }

  async function loadSlots(mine = ++seq) {
    const status = root.querySelector('#rfSlotStatus');
    if (!state.date) {
      state.slots = [];
      status.textContent = 'Im Moment sind keine Termine frei. Schreib uns bitte auf Instagram.';
      renderTimes();
      return;
    }
    status.textContent = 'Zeiten werden geladen …';
    try {
      const av = await api(`/availability?date=${state.date}&party=${state.party}`);
      if (mine !== seq) return;
      // Zeiten, die nur wegen Uhrzeit/Vorlauf nicht gehen, wären als „ausgebucht“ irreführend
      state.slots = av.slots.filter(x => !x.late);
      state.dayInfo = av;
    } catch (err) {
      if (mine !== seq) return;
      status.textContent = err.message;
      return failLoad(err);
    }
    if (state.time && !state.slots.some(s => s.time === state.time && slotOk(s))) state.time = '';
    renderTimes();
  }

  const slotOk = s => state.area === 'any' ? s.available : s.areas[state.area];

  function renderTimes() {
    const box = root.querySelector('#rfTimes');
    const status = root.querySelector('#rfSlotStatus');
    const free = state.slots.filter(slotOk);
    if (!state.date) { box.replaceChildren(); updateSummary(); return; }
    if (!state.slots.length) {
      const reason = state.dayInfo?.reason;
      status.textContent = state.dayInfo?.open ? 'Für heute sind keine Online-Reservierungen mehr möglich. Wähle bitte einen anderen Tag.'
        : reason === 'closed' ? 'An diesem Tag haben wir geschlossen.'
        : reason === 'too-far' ? 'So weit im Voraus nehmen wir noch keine Reservierungen an.'
        : reason === 'past' ? 'Dieser Tag liegt in der Vergangenheit.' : 'Für diesen Tag gibt es keine Zeiten.';
    } else if (!free.length) {
      status.textContent = state.area === 'any'
        ? 'An diesem Tag ist leider nichts mehr frei. Probier einen anderen Tag.'
        : `${state.area === 'indoor' ? 'Drinnen' : 'Draußen'} ist an diesem Tag nichts mehr frei. Probier „Egal“ oder einen anderen Tag.`;
    } else {
      status.textContent = `${free.length} freie Zeiten am ${WD_LONG[dow(state.date)]}, ${short(state.date)}`;
    }

    const bands = [['VORMITTAG', 0, 720], ['NACHMITTAG', 720, 1020], ['ABEND', 1020, 1440]];
    const out = [];
    for (const [name, from, to] of bands) {
      const inBand = state.slots.filter(s => timeToMin(s.time) >= from && timeToMin(s.time) < to);
      if (!inBand.length) continue;
      out.push(h('div', { class: 'rf-band' },
        h('p', { class: 'rf-band-name', text: name }),
        h('div', { class: 'rf-band-times' }, inBand.map(s => h('label', { class: 'rf-time' },
          h('input', { type: 'radio', name: 'time', value: s.time, checked: s.time === state.time, disabled: !slotOk(s), onchange: () => { state.time = s.time; setTimeError(''); updateSummary(); } }),
          h('span', { text: s.time }))))));
    }
    box.replaceChildren(...out);
    updateSummary();
  }

  function setTimeError(msg) {
    const el = root.querySelector('#time-error');
    if (el) el.textContent = msg;
  }

  function updateSummary() {
    const el = root.querySelector('#rfSummary');
    if (!el) return;
    if (!state.date || !state.time) {
      el.textContent = state.date ? `${WD[dow(state.date)]} ${short(state.date)} · ${plural(state.party)} · bitte Uhrzeit wählen` : '';
      return;
    }
    el.textContent = `${WD[dow(state.date)]} ${short(state.date)} · ${state.time}–${endOf(state.time)} Uhr · ${plural(state.party)} · ${AREA_LABEL[state.area]}`;
  }

  /* -- Absenden ------------------------------------------------------------- */

  function validate() {
    const v = id => root.querySelector(`#${id}`).value.trim();
    let first = null;
    const bad = (id, msg) => { setError(id, msg); first = first || root.querySelector(`#${id}`); };
    ['name', 'phone', 'email', 'note', 'privacy'].forEach(id => setError(id, ''));
    setTimeError('');
    root.querySelector('#form-error').textContent = '';
    if (!state.date || !state.time) {
      setTimeError('Bitte wähle Tag und Uhrzeit.');
      first = first || root.querySelector('#rfTimeSet');
    }
    if (v('name').length < 2) bad('name', 'Bitte gib deinen Namen an.');
    const phone = v('phone'), email = v('email');
    if (!phone && !email) { bad('phone', 'Bitte gib eine Telefonnummer oder E-Mail-Adresse an.'); }
    else {
      if (phone && !/^[+\d][\d\s()/.-]{4,}$/.test(phone)) bad('phone', 'Bitte prüfe die Telefonnummer.');
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) bad('email', 'Bitte prüfe die E-Mail-Adresse.');
    }
    if (!root.querySelector('#privacy').checked) bad('privacy', 'Bitte bestätige die Datenschutzhinweise.');
    return first;
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    const firstBad = validate();
    if (firstBad) {
      firstBad.scrollIntoView({ block: 'center' });
      if (firstBad.focus) firstBad.focus({ preventScroll: true });
      return;
    }
    const btn = root.querySelector('#rfSubmit');
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Wird gesendet …';
    const v = id => root.querySelector(`#${id}`).value.trim();
    try {
      const out = await api('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          name: v('name'), phone: v('phone'), email: v('email'), note: v('note'), website: v('website'),
          date: state.date, time: state.time, party: state.party, area: state.area,
          privacy: root.querySelector('#privacy').checked
        })
      });
      renderResult(out, { id: out.id, token: out.token, fresh: true });
    } catch (err) {
      btn.disabled = false; btn.textContent = label;
      const el = root.querySelector('#form-error');
      if (['slot-unavailable', 'area-unavailable'].includes(err.code)) {
        state.time = '';
        await loadSlots();
        setTimeError(err.message);
        root.querySelector('#rfTimeSet').scrollIntoView({ block: 'center' });
      } else if (err.field && setError(err.field === 'contact' ? 'phone' : err.field, err.message)) {
        root.querySelector(`#${err.field === 'contact' ? 'phone' : err.field}`)?.focus();
      } else {
        el.textContent = err.code === 'network' ? 'Keine Verbindung. Bitte prüfe dein Netz und versuche es noch einmal.' : err.message;
      }
    }
  }

  /* -- Ergebnis und Status -------------------------------------------------- */

  const STATUS_TEXT = {
    pending: ['Anfrage eingegangen.', 'Wir prüfen sie und bestätigen sie dir. Sobald das passiert ist, siehst du es hier mit deinem Link.'],
    confirmed: ['Dein Tisch ist reserviert.', 'Wir freuen uns auf dich.'],
    seated: ['Schön, dass du da bist.', 'Viel Spaß bei FAME.'],
    declined: ['Das hat leider nicht geklappt.', 'Wir konnten diese Anfrage nicht bestätigen. Versuch es gern mit einer anderen Zeit oder schreib uns auf Instagram.'],
    cancelled: ['Reservierung storniert.', 'Wir haben den Tisch wieder freigegeben.'],
    expired: ['Anfrage abgelaufen.', 'Diese Anfrage wurde nicht rechtzeitig bearbeitet. Bitte frag noch einmal an oder schreib uns auf Instagram.'],
    noshow: ['Nicht erschienen.', 'Du warst zu dieser Reservierung nicht bei uns.'],
    completed: ['Danke für deinen Besuch.', 'Bis zum nächsten Mal.']
  };

  function detailRow(k, v) { return h('div', {}, h('dt', { text: k }), h('dd', { text: v })); }

  function renderResult(view, { id, token, fresh = false }) {
    const [title, text] = STATUS_TEXT[view.status] || ['Reservierung', ''];
    const link = `${location.origin}${location.pathname}?b=${id}.${token}#reservieren`;
    const heading = h('h3', { class: 'rr-title', text: title });
    const card = h('div', { class: 'rr', 'data-status': view.status },
      h('span', { class: 'rr-ref', text: `Nr. ${view.ref}` }),
      heading,
      h('p', { class: 'rr-text', text }),
      h('dl', { class: 'rr-details' },
        detailRow('Tag', longDate(view.date)),
        detailRow('Uhrzeit', `${view.time}–${view.endTime} Uhr`),
        detailRow('Personen', String(view.party)),
        detailRow('Platz', AREA_LABEL[view.area] ? AREA_LABEL[view.area][0].toUpperCase() + AREA_LABEL[view.area].slice(1) : '—')),
      h('div', { class: 'rr-actions' }));
    const actions = card.querySelector('.rr-actions');

    if (view.status === 'confirmed') {
      actions.append(h('a', { class: 'rf-button rf-button-light', href: `/api/bookings/${id}/ics?t=${encodeURIComponent(token)}`, download: `fame-cafe-${view.ref}.ics`, text: 'Zum Kalender hinzufügen' }));
    }
    if (view.status === 'pending' || view.status === 'confirmed') {
      const linkInput = h('input', { class: 'rr-link-input', type: 'text', readonly: true, value: link, 'aria-label': 'Persönlicher Link zu deiner Reservierung', onfocus: e => e.target.select() });
      const copy = h('button', { type: 'button', class: 'rf-button rf-button-light', text: 'Link kopieren', onclick: async () => {
        try { await navigator.clipboard.writeText(link); copy.textContent = 'Kopiert'; }
        catch { linkInput.focus(); linkInput.select(); copy.textContent = 'Zum Kopieren markiert'; }
        setTimeout(() => { copy.textContent = 'Link kopieren'; }, 2500);
      } });
      card.append(h('div', { class: 'rr-link' },
        h('p', { class: 'rr-link-note', text: fresh ? 'Speichere diesen Link oder mach einen Screenshot. Darüber siehst du den Stand und kannst stornieren.' : 'Dein persönlicher Link:' }),
        linkInput, copy));
      card.append(cancelControl(id, token));
    }
    card.append(h('button', { type: 'button', class: 'rr-again', onclick: () => { history.replaceState(null, '', `${location.pathname}#reservieren`); start(); }, text: 'Neue Reservierung' }));

    mount(card);
    focusAndShow(heading);
    watchPending(view, id, token);
  }

  function cancelControl(id, token) {
    const wrap = h('div', { class: 'rr-cancel' });
    const ask = h('button', { type: 'button', class: 'rr-cancel-ask', text: 'Reservierung stornieren', onclick: () => {
      wrap.replaceChildren(
        h('p', { text: 'Wirklich stornieren?' }),
        h('button', { type: 'button', class: 'rf-button rf-button-danger', text: 'Ja, stornieren', onclick: async e => {
          e.target.disabled = true;
          try {
            const out = await api(`/bookings/${id}/cancel`, { method: 'POST', body: JSON.stringify({ t: token }) });
            renderResult(out, { id, token });
          } catch (err) { wrap.replaceChildren(h('p', { class: 'rf-error', role: 'alert', text: err.message })); }
        } }),
        h('button', { type: 'button', class: 'rr-cancel-ask', text: 'Behalten', onclick: () => wrap.replaceChildren(ask) }));
    } });
    wrap.append(ask);
    return wrap;
  }

  let poll = null;
  function watchPending(view, id, token) {
    clearInterval(poll);
    if (view.status !== 'pending') return;
    poll = setInterval(async () => {
      if (document.hidden || !root.isConnected) return;
      try {
        const next = await api(`/bookings/${id}?t=${encodeURIComponent(token)}`);
        if (next.status !== 'pending') { clearInterval(poll); renderResult(next, { id, token }); }
      } catch { /* beim nächsten Takt erneut */ }
    }, 30000);
  }

  async function showStatus(param) {
    const [id, token] = param.split('.');
    try {
      const view = await api(`/bookings/${id}?t=${encodeURIComponent(token)}`);
      renderResult(view, { id, token });
    } catch (err) {
      if (err.status === 404) {
        mount(h('div', { class: 'rr' },
          h('h3', { class: 'rr-title', text: 'Reservierung nicht gefunden.' }),
          h('p', { class: 'rr-text', text: 'Der Link ist unvollständig oder die Reservierung wurde nach Ablauf der Speicherfrist gelöscht.' }),
          h('button', { type: 'button', class: 'rf-button rf-button-light', text: 'Neue Reservierung', onclick: () => { history.replaceState(null, '', `${location.pathname}#reservieren`); start(); } })));
      } else failLoad(err);
    }
  }

  /* -- Start ---------------------------------------------------------------- */

  async function start() {
    clearInterval(poll);
    try {
      state.cfg = await api('/config');
    } catch {
      showUnavailable();
      return;
    }
    const dur = document.querySelector('[data-reserve-duration]');
    if (dur) dur.textContent = `${state.cfg.durationMin} Minuten`;
    state.party = Math.min(state.party, state.cfg.maxParty);
    state.time = '';
    const param = new URLSearchParams(location.search).get('b');
    if (param && /^[0-9a-f]{8,}\.[\w-]{10,}$/.test(param)) { await showStatus(param); return; }
    buildForm();
    await loadDays();
  }

  /* -- Sticky-Button (nur Mobil sichtbar, per CSS) --------------------------- */

  if (fab && 'IntersectionObserver' in window) {
    const hide = new Set();
    const io = new IntersectionObserver(entries => {
      for (const e of entries) (e.isIntersecting ? hide.add(e.target) : hide.delete(e.target));
      fab.classList.toggle('is-hidden', hide.size > 0);
    }, { threshold: 0.12 });
    const hero = document.querySelector('.hero');
    if (hero) io.observe(hero);
    // Das Ritual füllt den Bildschirm; der Button würde dort die Texte unten verdecken.
    const ritual = document.querySelector('.ritual');
    if (ritual) io.observe(ritual);
    io.observe(document.getElementById('reservieren'));
    const footer = document.querySelector('footer');
    if (footer) io.observe(footer);
  }

  start().then(() => {
    // Wer über den Status-Link kommt, soll den Abschnitt sehen, nicht den Seitenanfang.
    if (new URLSearchParams(location.search).has('b')) document.getElementById('reservieren')?.scrollIntoView({ block: 'start' });
  });
})();
