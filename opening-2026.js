/* FAME opening week, evaluated against Europe/Berlin (not visitor timezone). */
(() => {
  const dateParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const part = type => dateParts.find(item => item.type === type)?.value;
  const today = [part('year'),part('month'),part('day')].join('-');
  const banner = document.querySelector('[data-fame-opening-banner]');
  const dates = document.querySelectorAll('[data-fame-opening-date]');
  const openingSchedule = document.querySelector('[data-fame-opening-schedule]');
  const openingHours = {
    '2026-10-09': '15:00–23:00',
    '2026-10-10': '10:00–23:00',
    '2026-10-11': '10:00–22:00'
  };
  if (openingHours[today]) {
    document.querySelectorAll('[data-fame-hours-summary], [data-fame-mobile-hours]').forEach(item => {
      item.textContent = 'Heute ' + openingHours[today] + ' Uhr';
    });
  }
  dates.forEach(item => { if (today > item.dataset.fameOpeningDate) item.hidden = true; });
  if (openingSchedule && !Array.from(dates).some(item => !item.hidden)) openingSchedule.hidden = true;

  if (today >= '2026-10-12') {
    if (banner) banner.hidden = true;
    const summary = document.querySelector('[data-fame-hours-summary]');
    if (summary) summary.textContent = 'Täglich 07:00–23:00 Uhr';
    const mobile = document.querySelector('[data-fame-mobile-hours]');
    if (mobile) mobile.textContent = 'Täglich 07:00–23:00 Uhr';
    const regular = document.querySelector('[data-fame-regular-label]');
    if (regular) regular.textContent = 'REGULÄRE ÖFFNUNGSZEITEN';
  } else if (banner && (today === '2026-10-10' || today === '2026-10-11')) {
    banner.querySelector('[data-fame-opening-label]').textContent =
      (today === '2026-10-10' ? '10.10.2026' : '11.10.2026') + ' · OPENING WEEKEND';
    banner.querySelector('[data-fame-opening-headline]').textContent = 'FAME is open.';
    banner.querySelector('[data-fame-opening-time]').textContent =
      today === '2026-10-10' ? 'Samstag · 10:00–23:00 Uhr' : 'Sonntag · 10:00–22:00 Uhr';
  } else if (banner && today === '2026-10-09') {
    banner.querySelector('[data-fame-opening-time]').textContent = 'Heute · 15:00–23:00 Uhr';
  }
})();
