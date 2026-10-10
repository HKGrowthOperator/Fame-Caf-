/* Erzeugt mobile-images.css: kleinere Varianten aller CSS-Hintergrundbilder für
   Bildschirme bis 780 px. Die Datei wird per media="(max-width:780px)" geladen —
   Desktop-Besucher laden sie nie.

   Warum nicht von Hand: styles.css und experience-v6.css enthalten zusammen 41
   Bild-Adressen. Eine neue Adresse würde sonst mobil stillschweigend in voller
   Größe ausgeliefert. `--check` (Teil von npm run qa) schlägt an, wenn die
   erzeugte Datei nicht zum Stand der Quellen passt.

   Aufruf:  node tools/gen-mobile-images.mjs          schreibt mobile-images.css
            node tools/gen-mobile-images.mjs --check  prüft nur */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './qa/lib.mjs';

// hero-carousel.css wird erst per Skript an <head> angehängt und steht damit im Cascade später als
// dieses Stylesheet. Deshalb tragen alle erzeugten Selektoren ein `html ` davor (höhere Spezifität),
// und `!important` aus dem Original wird übernommen.
const SOURCES = ['styles.css', 'experience-v6.css', 'hero-carousel.css'];
const OUT = `${ROOT}/mobile-images.css`;
// Karten sind auf dem Handy bis zu 65 % der Bildschirmhöhe hoch; bei cover wird das Bild
// nach der Höhe skaliert. 1100 px Breite reicht dafür gerade noch scharf bei geringerer Qualität.
const WIDTH = 1100, QUALITY = 74;

const rules = [];
const missing = [];
for (const file of SOURCES) {
  const css = readFileSync(`${ROOT}/${file}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*(?:images\.unsplash\.com|assets\/photos\/)[^{}]*)\}/g)) {
    const remote = /url\((['"]?)(https:\/\/images\.unsplash\.com[^'")]+)\1\)/.exec(m[2]);
    // Eigene Fotos (assets/photos/NAME.jpg) haben eine kleinere Handy-Variante NAME-m.jpg daneben.
    const local = /url\((['"]?)(assets\/photos\/([^'")]+?)\.jpg)\1\)/.exec(m[2]);
    let small;
    if (remote) small = remote[2].replace(/&q=\d+/, `&q=${QUALITY}`).replace(/&w=\d+/, `&w=${WIDTH}`);
    else if (local && !local[3].endsWith('-m')) {
      small = `assets/photos/${local[3]}-m.jpg`;
      if (!existsSync(join(ROOT, small))) missing.push(small);
    } else continue;
    const important = /url\([^)]*\)\s*!important/.test(m[2]) ? ' !important' : '';
    const position = /background-position:[^;}]+/.exec(m[2]);
    const selector = m[1].trim().replace(/\s*\n\s*/g, ' ').split(',').map(x => `html ${x.trim()}`).join(',');
    rules.push(`${selector}{background-image:url("${small}")${important}${position ? ';' + position[0] : ''}}`);
  }
}
if (missing.length) {
  console.error(`Handy-Variante fehlt: ${missing.join(', ')}`);
  process.exit(1);
}

const out = `/* GENERIERT von tools/gen-mobile-images.mjs — nicht von Hand ändern.
   Kleinere Bildvarianten für Bildschirme bis 780 px (${rules.length} Regeln).
   Geladen über <link media="(max-width:780px)">. */
${rules.join('\n')}
`;

if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== out) {
    console.error('mobile-images.css ist veraltet. Neu erzeugen: node tools/gen-mobile-images.mjs');
    process.exit(1);
  }
  console.log(`mobile-images.css: aktuell (${rules.length} Regeln)`);
} else {
  writeFileSync(OUT, out);
  console.log(`mobile-images.css geschrieben (${rules.length} Regeln)`);
}
