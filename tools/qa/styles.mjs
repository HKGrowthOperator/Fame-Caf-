/* Regressionsschutz für CSS-Umbauten.
 *
 *   node tools/qa/styles.mjs snapshot vorher   # vor dem Umbau
 *   ... CSS ändern ...
 *   node tools/qa/styles.mjs snapshot nachher
 *   node tools/qa/styles.mjs diff vorher nachher
 *
 * Vergleicht die berechneten Stile aller Komponenten über alle Breakpoints.
 * Damit lässt sich beweisen, dass ein Refactoring nichts am Aussehen ändert —
 * Screenshots allein zeigen das nicht zuverlässig.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadChromium, serve, VIEWPORTS, ROOT } from './lib.mjs';

const OUT = join(ROOT, 'tools/qa/.snapshots');
const PROPS = ['display','position','top','right','bottom','left','width','height','minHeight','maxWidth',
  'margin','padding','fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','color',
  'backgroundColor','backgroundImage','backgroundPosition','backgroundSize','borderRadius','borderTop',
  'borderBottom','borderLeft','borderRight','gridTemplateColumns','gridTemplateRows','gridTemplateAreas',
  'gridColumn','gridRow','gap','flexDirection','justifyContent','alignItems','justifySelf','alignSelf',
  'textAlign','textTransform','opacity','zIndex','overflow','boxShadow','transform','whiteSpace',
  'aspectRatio','isolation','mixBlendMode','flexWrap','inset'];

async function snapshot(label) {
  const site = await serve();
  const browser = await loadChromium();
  const result = {};

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    await page.goto(`${site.base}/index.html`, { waitUntil: 'load' });
    await page.evaluate(() => {
      // Transitions einfrieren und skriptgesetzte Inline-Stile entfernen,
      // sonst misst man laufende Animationen statt der CSS-Regeln.
      const kill = document.createElement('style');
      kill.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
      document.head.appendChild(kill);
      document.querySelectorAll('.reveal').forEach(e => e.classList.add('in-view'));
      document.querySelectorAll('[style]').forEach(e => e.removeAttribute('style'));
    });
    await page.waitForTimeout(300);

    result[vp.name] = await page.evaluate(props => {
      const out = {};
      // Jede im Dokument vorkommende Klasse wird geprüft.
      const classes = new Set();
      document.querySelectorAll('[class]').forEach(el =>
        el.classList.forEach(c => classes.add('.' + c)));
      for (const sel of [...classes].sort().concat(['html','body','footer','main','h1','h2','h3','address'])) {
        let el;
        try { el = document.querySelector(sel); } catch { continue; }
        if (!el) { out[sel] = null; continue; }
        const cs = getComputedStyle(el);
        const row = {};
        for (const p of props) row[p] = cs[p];
        const b = el.getBoundingClientRect();
        row.__box = `${Math.round(b.width)}x${Math.round(b.height)}`;
        out[sel] = row;
      }
      out.__overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      out.__docHeight = Math.round(document.documentElement.scrollHeight);
      return out;
    }, PROPS);

    await ctx.close();
  }

  await browser.close();
  await site.close();
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${label}.json`), JSON.stringify(result, null, 1));
  const n = Object.values(result)[0] ? Object.keys(Object.values(result)[0]).length : 0;
  console.log(`Momentaufnahme "${label}": ${n} Selektoren x ${PROPS.length} Eigenschaften x ${VIEWPORTS.length} Breiten`);
}

function diff(a, b) {
  const A = JSON.parse(readFileSync(join(OUT, `${a}.json`), 'utf8'));
  const B = JSON.parse(readFileSync(join(OUT, `${b}.json`), 'utf8'));
  let n = 0;
  for (const vp of Object.keys(A)) {
    for (const sel of Object.keys(A[vp])) {
      const x = A[vp][sel], y = B[vp]?.[sel];
      if (x === null && (y === null || y === undefined)) continue;
      if (x === null || y === null || y === undefined) { console.log(`${vp} | ${sel} | vorhanden/fehlt`); n++; continue; }
      if (typeof x !== 'object') { if (x !== y) { console.log(`${vp} | ${sel}: ${x} -> ${y}`); n++; } continue; }
      for (const p of Object.keys(x)) {
        if (x[p] !== y[p]) { console.log(`${vp} | ${sel} | ${p}: "${x[p]}" -> "${y[p]}"`); n++; }
      }
    }
  }
  console.log(n ? `\n${n} Abweichungen zwischen "${a}" und "${b}".` : `\nKeine Abweichungen zwischen "${a}" und "${b}".`);
  if (n) process.exitCode = 1;
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'snapshot' && rest[0]) await snapshot(rest[0]);
else if (cmd === 'diff' && rest.length === 2) diff(rest[0], rest[1]);
else {
  console.log('Verwendung:\n  node tools/qa/styles.mjs snapshot <name>\n  node tools/qa/styles.mjs diff <name-a> <name-b>');
  process.exit(2);
}
