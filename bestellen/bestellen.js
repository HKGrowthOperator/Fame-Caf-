/* FAME CAFÉ — Bestellseite.

   Zwei Wege: am Tisch (QR-Code mit ?t=<Tisch>&k=<Schlüssel>) und zum Mitnehmen/Abholen
   (ohne Parameter). Der Server entscheidet, was erlaubt ist; diese Seite zeigt es nur an.

   Ausfallsicherheit: Im HTML steht ein Hinweis „bitte im Café bestellen“. Er wird erst
   ersetzt, wenn die Karte geladen ist. Preise im Browser sind reine Anzeige — der Server
   rechnet jede Bestellung selbst neu.

   Nichts wird im Browser gespeichert (kein localStorage, keine Cookies). Wer die Seite
   neu lädt, behält seine Bestellung über den Link in der Adresszeile (?o=…). */

(() => {
  'use strict';

  const root = document.getElementById('oRoot');
  const bar = document.getElementById('oCartbar');
  const params = new URLSearchParams(location.search);
  const tableParam = params.get('t') || '';
  const keyParam = params.get('k') || '';

  const S = { data: null, cart: new Map(), view: 'menu', last: null };
  let poll = null;

  /* -- Helfer ---------------------------------------------------------------- */

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
  const euro = c => `${(c / 100).toFixed(2).replace('.', ',')} €`;
  const put = (...nodes) => root.replaceChildren(...nodes.flat(Infinity).filter(Boolean));

  async function api(path, options = {}) {
    let res;
    try {
      res = await fetch(`/api${path}`, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, signal: AbortSignal.timeout(12000) });
    } catch { throw Object.assign(new Error('Keine Verbindung.'), { code: 'network' }); }
    let json = null;
    try { json = await res.json(); } catch { /* keine JSON-Antwort */ }
    if (!res.ok || !json) throw Object.assign(new Error(json?.message || 'Der Bestelldienst antwortet nicht.'), { status: res.status, code: json?.error || 'server', field: json?.field });
    return json;
  }

  const items = () => (S.data?.menu || []).flatMap(c => c.items);
  const find = id => items().find(i => i.id === id);
  const count = () => [...S.cart.values()].reduce((a, b) => a + b, 0);
  const sum = () => [...S.cart].reduce((a, [id, q]) => a + (find(id)?.priceCents || 0) * q, 0);

  function setQty(id, q) {
    const it = find(id);
    if (!it || !it.available) return;
    const next = Math.max(0, Math.min(10, q));
    if (next) S.cart.set(id, next); else S.cart.delete(id);
    paintBar();
  }

  function paintBar() {
    const n = count();
    bar.hidden = !(n > 0 && S.view === 'menu');
    document.getElementById('oCartCount').textContent = n === 1 ? '1 Artikel' : `${n} Artikel`;
    document.getElementById('oCartSum').textContent = euro(sum());
  }

  /* -- Kopf je nach Modus -------------------------------------------------------- */

  function paintHead() {
    const mode = S.data?.mode;
    const chip = document.getElementById('oChip');
    const eyebrow = document.getElementById('oEyebrow');
    const title = document.getElementById('oTitle');
    const lead = document.getElementById('oLead');
    if (mode === 'table') {
      chip.hidden = false; chip.textContent = `TISCH ${S.data.table}`;
      eyebrow.textContent = 'ORDER AT YOUR TABLE';
      title.replaceChildren('Order', document.createElement('br'), 'from your ', Object.assign(document.createElement('em'), { textContent: 'seat.' }));
      lead.textContent = 'Bestelle direkt von deinem Platz, ohne dich anzustellen. Bezahlt wird vor Ort.';
    } else if (mode === 'pickup') {
      chip.hidden = false; chip.textContent = 'MITNEHMEN';
      eyebrow.textContent = 'ORDER TO GO';
      title.replaceChildren('Order', document.createElement('br'), 'to ', Object.assign(document.createElement('em'), { textContent: 'go.' }));
      lead.textContent = 'Zum Mitnehmen oder Abholen: bestelle vor, wir halten es bereit. Bezahlt wird vor Ort.';
    } else {
      chip.hidden = true;
    }
  }

  /* -- Hinweise --------------------------------------------------------------------- */

  const REASONS = {
    disabled: ['Online bestellen ist noch nicht freigeschaltet', 'Bitte bestelle direkt bei uns im Café.'],
    paused: ['Gerade nehmen wir keine neuen Online-Bestellungen an', 'Bitte versuche es gleich noch einmal oder bestelle direkt bei uns im Café.'],
    closed: ['Wir haben gerade geschlossen', 'Bestellen geht wieder, sobald wir geöffnet haben.'],
    'bad-table': ['Dieser QR-Code ist nicht gültig', 'Bitte sprich unser Team an, wir helfen dir gern.'],
    'no-mode': ['Bestellen geht am Tisch', 'Scanne dazu den QR-Code auf deinem Tisch.'],
    empty: ['Die Karte ist gerade leer', 'Bitte bestelle direkt bei uns im Café.']
  };

  function notice(title, text) {
    return h('div', { class: 'o-card o-notice' }, h('p', { class: 'o-notice-title', text: title }), h('p', { text }));
  }

  function showUnavailable(message) {
    put(notice('Online bestellen ist gerade nicht möglich', message || 'Bitte bestelle direkt bei uns im Café.'));
    bar.hidden = true;
  }

  /* -- Karte --------------------------------------------------------------------------- */

  function renderMenu() {
    S.view = 'menu';
    clearInterval(poll);
    const d = S.data;
    paintHead();
    if (!d.canOrder) {
      const [t, p] = REASONS[d.reason] || REASONS.disabled;
      put(notice(t, p));
      bar.hidden = true;
      return;
    }
    const cats = h('nav', { class: 'o-cats', 'aria-label': 'Kategorien' }, d.menu.map((c, i) => h('button', {
      type: 'button', class: 'o-cat', 'aria-current': String(i === 0), 'data-cat': c.id,
      onclick: () => document.getElementById(`cat-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, c.name)));
    const sections = d.menu.map(c => h('section', { class: 'o-section', id: `cat-${c.id}`, 'aria-labelledby': `cath-${c.id}` },
      h('h2', { class: 'o-section-title', id: `cath-${c.id}`, text: c.name }),
      c.items.map(itemRow)));
    put(cats, sections);
    paintBar();
    // Aktive Kategorie im Reiter mitführen
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => {
        for (const e of es) if (e.isIntersecting) {
          const id = e.target.id.replace('cat-', '');
          cats.querySelectorAll('.o-cat').forEach(b => b.setAttribute('aria-current', String(b.dataset.cat === id)));
        }
      }, { rootMargin: '-96px 0px -70% 0px' });
      root.querySelectorAll('.o-section').forEach(s => io.observe(s));
    }
  }

  function stepper(id) {
    const q = S.cart.get(id) || 0;
    const it = find(id);
    if (!q) return h('button', { type: 'button', class: 'o-add', 'aria-label': `${it.name} hinzufügen`, onclick: () => { setQty(id, 1); repaintRow(id); } }, '+');
    return h('div', { class: 'o-step' },
      h('button', { type: 'button', 'aria-label': `${it.name}: eins weniger`, onclick: () => { setQty(id, q - 1); repaintRow(id); } }, '−'),
      h('output', { 'aria-live': 'polite', text: String(q) }),
      h('button', { type: 'button', 'aria-label': `${it.name}: eins mehr`, disabled: q >= 10, onclick: () => { setQty(id, q + 1); repaintRow(id); } }, '+'));
  }

  function itemRow(it) {
    return h('div', { class: 'o-item', id: `row-${it.id}`, 'data-out': String(!it.available) },
      h('span', { class: 'o-item-name', text: it.name }),
      it.description ? h('span', { class: 'o-item-desc', text: it.description }) : null,
      h('div', { class: 'o-item-side' },
        h('span', { class: 'o-item-price', text: euro(it.priceCents) }),
        it.available ? stepper(it.id) : h('span', { class: 'o-out', text: 'AUSVERKAUFT' })));
  }

  function repaintRow(id) {
    if (S.view === 'review') { renderReview(true); return; }
    const row = document.getElementById(`row-${id}`);
    if (!row) return;
    const next = itemRow(find(id));
    row.replaceWith(next);
    // Der gedrückte Knopf wurde ersetzt; ohne Fokus verlöre die Tastatur ihre Stelle.
    next.querySelector('.o-step button:last-of-type, .o-add')?.focus({ preventScroll: true });
  }

  /* -- Prüfen und bestellen ---------------------------------------------------------- */

  /** Eingetippte Werte merken, bevor die Ansicht neu gezeichnet wird. */
  function captureForm() {
    const v = id => document.getElementById(id)?.value;
    if (document.getElementById('oName') || document.getElementById('oNote')) {
      S.last = { name: v('oName') ?? S.last?.name, phone: v('oPhone') ?? S.last?.phone, note: v('oNote') ?? S.last?.note, pickupAt: v('oWhen') ?? S.last?.pickupAt };
    }
  }

  function renderReview(keepScroll = false) {
    captureForm();
    S.view = 'review';
    clearInterval(poll);
    const d = S.data;
    const lines = [...S.cart].filter(([id]) => find(id));
    if (!lines.length) { renderMenu(); return; }
    const pickup = d.mode === 'pickup';

    const name = h('input', { id: 'oName', type: 'text', maxlength: '40', autocomplete: 'given-name', enterkeyhint: 'next', value: S.last?.name || '' });
    const phone = h('input', { id: 'oPhone', type: 'tel', inputmode: 'tel', autocomplete: 'tel', maxlength: '30', value: S.last?.phone || '' });
    const note = h('textarea', { id: 'oNote', maxlength: '200', placeholder: pickup ? 'z. B. Hafermilch, ohne Zucker' : 'z. B. Wünsche zur Zubereitung' }, S.last?.note || '');
    const when = h('select', { id: 'oWhen' });
    if (pickup) {
      if (d.pickup.asap) when.append(h('option', { value: 'asap', text: 'So schnell wie möglich' }));
      for (const t of d.pickup.slots) when.append(h('option', { value: t, text: `${t} Uhr` }));
      if (S.last?.pickupAt) when.value = S.last.pickupAt;
    }
    const privacy = h('input', { id: 'oPrivacy', type: 'checkbox' });
    const hp = h('input', { id: 'oWebsite', type: 'text', tabindex: '-1', autocomplete: 'off' });
    const err = h('p', { class: 'o-error', id: 'oError', role: 'alert' });
    const submit = h('button', { type: 'submit', class: 'o-btn o-btn-block', id: 'oSubmit' }, `Verbindlich bestellen · ${euro(sum())}`);

    const form = h('form', { novalidate: true, class: 'o-card', onsubmit: async e => {
      e.preventDefault();
      err.textContent = '';
      if (pickup) {
        if (name.value.trim().length < 2) { err.textContent = 'Bitte gib deinen Namen an.'; name.focus(); return; }
        if (!privacy.checked) { err.textContent = 'Bitte bestätige die Datenschutzhinweise.'; privacy.focus(); return; }
        if (!when.value) { err.textContent = 'Heute ist leider keine Abholzeit mehr frei.'; return; }
      }
      S.last = { name: name.value, phone: phone.value, note: note.value, pickupAt: when.value };
      submit.disabled = true; submit.textContent = 'Wird gesendet …';
      try {
        const out = await api('/orders', { method: 'POST', body: JSON.stringify({
          mode: d.mode, t: tableParam, k: keyParam, items: lines.map(([id, qty]) => ({ id, qty })),
          note: note.value, name: name.value, phone: phone.value, pickupAt: pickup ? when.value : undefined, privacy: pickup ? privacy.checked : undefined, website: hp.value
        }) });
        S.cart.clear();
        const next = new URLSearchParams(location.search); next.set('o', `${out.id}.${out.token}`);
        history.replaceState(null, '', `${location.pathname}?${next}`);
        renderStatus(out, out.token);
      } catch (ex) {
        submit.disabled = false; submit.textContent = `Verbindlich bestellen · ${euro(sum())}`;
        err.textContent = ex.code === 'network' ? 'Keine Verbindung. Bitte prüfe dein Netz und versuche es noch einmal.' : ex.message;
        if (['sold-out', 'unknown-item', 'not-available', 'paused', 'closed', 'pickup-time'].includes(ex.code)) await refreshMenu(true, err.textContent);
      }
    } },
      h('div', { class: 'o-lines' }, lines.map(([id, q]) => {
        const it = find(id);
        return h('div', { class: 'o-line' },
          h('span', { class: 'o-line-name', text: it.name }),
          h('span', { class: 'o-line-sum', text: `${euro(it.priceCents)} · ${euro(it.priceCents * q)}` }),
          h('div', { class: 'o-step' },
            h('button', { type: 'button', 'aria-label': `${it.name}: eins weniger`, onclick: () => { setQty(id, q - 1); repaintRow(id); } }, '−'),
            h('output', { text: String(q) }),
            h('button', { type: 'button', 'aria-label': `${it.name}: eins mehr`, disabled: q >= 10, onclick: () => { setQty(id, q + 1); repaintRow(id); } }, '+')));
      })),
      h('div', { class: 'o-total' }, 'GESAMT', h('strong', { text: euro(sum()) })),
      pickup ? [
        h('div', { class: 'o-field' }, h('label', { for: 'oName', text: 'Dein Name' }), name),
        h('div', { class: 'o-field' }, h('label', { for: 'oPhone', text: 'Telefon (optional)' }), phone),
        h('div', { class: 'o-field' }, h('label', { for: 'oWhen', text: 'Abholzeit' }), when)
      ] : null,
      h('div', { class: 'o-field' }, h('label', { for: 'oNote', text: 'Anmerkung (optional)' }), note),
      h('div', { class: 'o-hp', 'aria-hidden': 'true' }, h('label', { for: 'oWebsite', text: 'Website' }), hp),
      pickup ? h('div', { class: 'o-field' }, h('label', { class: 'o-check' }, privacy,
        h('span', {}, 'Ich habe die ', h('a', { href: '../datenschutz.html', target: '_blank', rel: 'noopener' }, 'Datenschutzhinweise'), ' gelesen. Mein Name und meine Telefonnummer werden zur Bearbeitung der Bestellung gespeichert.'))) : null,
      err, submit,
      h('p', { class: 'o-fine', text: 'Bezahlt wird vor Ort. Es findet keine Online-Zahlung statt.' }));
    put(
      h('button', { type: 'button', class: 'o-link', onclick: () => { captureForm(); renderMenu(); }, text: '← Zurück zur Karte' }),
      form);
    paintBar();
    if (!keepScroll) window.scrollTo({ top: 0 });
  }

  async function refreshMenu(keepMessage, message) {
    try {
      S.data = await api(`/order/menu?t=${encodeURIComponent(tableParam)}&k=${encodeURIComponent(keyParam)}`);
    } catch { return; }
    for (const [id] of [...S.cart]) { const it = find(id); if (!it || !it.available) S.cart.delete(id); }
    renderMenu();
    if (keepMessage && message) root.prepend(h('div', { class: 'o-card o-notice', role: 'alert' }, h('p', { text: message })));
  }

  /* -- Status --------------------------------------------------------------------------- */

  const STEPS = [['new', 'Bestellung eingegangen'], ['preparing', 'Wird zubereitet'], ['ready', 'Fertig'], ['done', 'Abgeschlossen']];

  function renderStatus(o, token) {
    S.view = 'status';
    bar.hidden = true;
    clearInterval(poll);
    document.getElementById('oChip').hidden = true;
    const eyebrow = document.getElementById('oEyebrow'), title = document.getElementById('oTitle'), lead = document.getElementById('oLead');
    eyebrow.textContent = 'YOUR ORDER';
    if (o.status === 'cancelled') {
      title.replaceChildren('Order', document.createElement('br'), Object.assign(document.createElement('em'), { textContent: 'cancelled.' }));
      lead.textContent = 'Diese Bestellung wurde storniert.';
    } else if (o.status === 'done') {
      title.replaceChildren('Enjoy', document.createElement('br'), Object.assign(document.createElement('em'), { textContent: 'FAME.' }));
      lead.textContent = 'Guten Appetit!';
    } else {
      title.replaceChildren('Thank', document.createElement('br'), Object.assign(document.createElement('em'), { textContent: 'you.' }));
      lead.textContent = o.mode === 'table' ? 'Wir haben deine Bestellung. Du musst dich nicht anstellen.' : 'Wir haben deine Bestellung und halten sie bereit.';
    }
    const idx = STEPS.findIndex(s => s[0] === o.status);
    const where = o.mode === 'table' ? `Tisch ${o.table}` : o.pickupAt === 'asap' ? 'Zum Mitnehmen · so schnell wie möglich' : `Abholung um ${o.pickupAt} Uhr`;
    const canCancel = o.status === 'new';
    const card = h('div', { class: 'o-card' },
      h('span', { class: 'o-number-label', text: 'BESTELLNUMMER' }),
      h('span', { class: 'o-number', text: String(o.number) }),
      h('p', { class: 'o-where', text: where }),
      o.status === 'cancelled' ? null : h('ol', { class: 'o-steps' }, STEPS.map(([key, label], i) => h('li', { 'data-state': i < idx ? 'done' : i === idx ? 'now' : 'todo', 'aria-current': i === idx ? 'step' : null }, label))),
      h('ul', { class: 'o-summary' }, o.items.map(i => h('li', {}, h('span', { text: `${i.qty} × ${i.name}` }), h('span', { text: euro(i.qty * i.priceCents) }))),
        h('li', {}, h('strong', { text: 'Gesamt' }), h('strong', { text: euro(o.totalCents) }))),
      h('p', { class: 'o-fine', text: 'Bezahlt wird vor Ort.' }),
      h('div', { style: 'display:grid;gap:10px;margin-top:18px' },
        o.status === 'done' || o.status === 'cancelled' || o.status === 'ready'
          ? h('button', { type: 'button', class: 'o-btn o-btn-block', onclick: again, text: 'Noch etwas bestellen' }) : null,
        canCancel ? h('button', { type: 'button', class: 'o-link', onclick: async e => {
          if (!confirm('Bestellung wirklich stornieren?')) return;
          e.target.disabled = true;
          try { renderStatus(await api(`/orders/${o.id}/cancel`, { method: 'POST', body: JSON.stringify({ t: token }) }), token); }
          catch (ex) { e.target.disabled = false; alert(ex.message); }
        }, text: 'Bestellung stornieren' }) : null));
    put(card);
    document.getElementById('oMain').scrollIntoView();
    if (o.status !== 'done' && o.status !== 'cancelled') {
      poll = setInterval(async () => {
        if (document.hidden) return;
        try {
          const next = await api(`/orders/${o.id}?t=${encodeURIComponent(token)}`);
          if (next.status !== o.status) renderStatus(next, token);
        } catch { /* nächster Takt */ }
      }, 6000);
    }
  }

  function again() {
    const next = new URLSearchParams(location.search); next.delete('o');
    history.replaceState(null, '', next.toString() ? `${location.pathname}?${next}` : location.pathname);
    refreshMenu();
  }

  /* -- Start ------------------------------------------------------------------------------ */

  async function start() {
    const resume = params.get('o');
    try {
      S.data = await api(`/order/menu?t=${encodeURIComponent(tableParam)}&k=${encodeURIComponent(keyParam)}`);
    } catch { showUnavailable(); return; }
    if (resume && /^[0-9a-f]{8,}\.[\w-]{10,}$/.test(resume)) {
      const [id, token] = resume.split('.');
      try { renderStatus(await api(`/orders/${id}?t=${encodeURIComponent(token)}`), token); return; }
      catch { /* Link veraltet: normal weiter */ }
    }
    renderMenu();
  }

  document.getElementById('oCartGo').addEventListener('click', () => renderReview());

  start();
})();
