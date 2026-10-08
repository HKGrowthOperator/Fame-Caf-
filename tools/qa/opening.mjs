import { loadChromium, serve, report } from './lib.mjs';

const site = await serve();
const browser = await loadChromium();
const failures = [];
let checks = 0;
const check = (condition, label) => { checks++; if (!condition) failures.push(label); };

try {
  // Visit from another timezone: the cafe's Berlin date must win.
  const cases = [
    ['2026-10-08T21:59:00Z', 'Ab 12.10.: täglich 07:00–23:00 Uhr', 3, true],
    ['2026-10-08T22:01:00Z', 'Heute 15:00–23:00 Uhr', 3, true],
    ['2026-10-09T22:01:00Z', 'Heute 10:00–23:00 Uhr', 2, true],
    ['2026-10-10T22:01:00Z', 'Heute 10:00–22:00 Uhr', 1, true],
    ['2026-10-11T22:01:00Z', 'Täglich 07:00–23:00 Uhr', 0, false]
  ];
  for (const [time, summary, days, banner] of cases) {
    const ctx = await browser.newContext({ timezoneId: 'America/Los_Angeles' });
    const page = await ctx.newPage();
    await page.route('https://**/*', route => route.abort());
    await page.clock.install({ time: new Date(time) });
    await page.goto(site.base);
    check(await page.locator('[data-fame-hours-summary]').textContent() === summary, time + ': visit hours');
    check(await page.locator('[data-fame-mobile-hours]').textContent() === summary, time + ': mobile hours');
    check(await page.locator('[data-fame-opening-date]:not([hidden])').count() === days, time + ': opening days');
    check(await page.locator('[data-fame-opening-banner]').isVisible() === banner, time + ': opening banner');
    check(await page.locator('[data-fame-opening-schedule]').isVisible() === (days > 0), time + ': opening schedule');
    await ctx.close();
  }

  for (const mode of ['no-js', 'missing-experience', 'missing-base']) {
    const ctx = await browser.newContext({ javaScriptEnabled: mode !== 'no-js' });
    const page = await ctx.newPage();
    await page.route('https://**/*', route => route.abort());
    if (mode === 'missing-experience') await page.route('**/experience-v6.js*', route => route.abort());
    if (mode === 'missing-base') await page.route('**/script.js*', route => route.abort());
    await page.goto(site.base);
    check(await page.locator('.experience-reveal').evaluateAll(items =>
      items.every(item => Number(getComputedStyle(item).opacity) === 1)
    ), mode + ': experience content remains visible');
    await ctx.close();
  }
} finally {
  await browser.close();
  await site.close();
}
report('Opening und Ausfallsicherheit', failures, checks);
