# Prüfwerkzeuge

Diese Skripte gehören nicht zur ausgelieferten Seite. Der Docker-Build
schließt sie über `.dockerignore` aus.

## Einrichtung

```bash
npm install
npx playwright install chromium
```

Ist Playwright global installiert, findet `lib.mjs` es auch dort. Ein
abweichender Chromium-Pfad lässt sich über `CHROMIUM_PATH` setzen.

## Skripte

### `npm run sweep`

Ruft jede Seite in elf Viewportbreiten von 320 bis 1600 px auf, scrollt sie
komplett durch und prüft auf horizontalen Overflow und Skriptfehler.
Fehler aus externen Bildquellen werden gefiltert — die sind kein Defekt der
Seite. 44 Prüfungen.

### `npm run behaviour`

Nagelt die vier Bereiche fest, die im Projekt schon einmal defekt waren:

1. **Mobile Navigation** — Öffnen, Schließen, `aria-expanded`, Escape,
   Fokus-Trap, Fokusrückgabe, Scroll-Sperre, Sprungziele.
2. **Betrieb ohne JavaScript** — kein unsichtbares `.reveal`-Element, volle
   Ritual-Sequenz vorhanden. `.reveal` startet auf `opacity:0`; ohne diesen
   Test bliebe unbemerkt, dass die Seite bei JS-Ausfall leer ist.
3. **`prefers-reduced-motion`** — alle sechs Ritual-Schritte erreichbar,
   Bubble-Animation aus, Ritual nicht mehr über mehrere Bildschirmhöhen.
4. **404** — unbekannte Adresse liefert Status 404 und die FAME-Fehlerseite,
   nicht die Startseite mit Status 200.

26 Prüfungen. Der eingebaute Testserver bildet das 404-Verhalten der
nginx-Konfiguration nach.

### `node tools/qa/styles.mjs`

Regressionsschutz für CSS-Umbauten.

```bash
node tools/qa/styles.mjs snapshot vorher
node tools/qa/styles.mjs snapshot nachher
node tools/qa/styles.mjs diff vorher nachher
```

Nimmt für jede im Dokument vorkommende Klasse 52 berechnete Eigenschaften
plus Boxmaß über elf Breiten auf. Transitions werden vorher eingefroren und
skriptgesetzte Inline-Stile entfernt, sonst misst man laufende Animationen
statt der CSS-Regeln.

Damit wurde die Zusammenführung der drei Stylesheets abgesichert: 598
gemeldete Abweichungen, jede einzeln zurückverfolgt, am Ende nur zwei übrig —
beide bei Eigenschaften ohne Rendering-Wirkung.

### `npm run screens`

Screenshots aller zwölf Abschnitte in drei Gerätebreiten plus Overlay,
Rechtstexte und Fehlerseite. Für die visuelle Abnahme, kein automatischer Test.
Landen in `.screens/` und sind nicht versioniert.

### `npm run scan`

Anti-Pattern-Scan über die impeccable-CLI. Findet unter anderem
Layout-animierende Transitions, zu geringe Kontraste und generische
KI-Muster.

Nicht jeder Fund ist ein Defekt. Die Header-Höhenanimation wird gemeldet,
ist hier aber gemessen unkritisch (0,22 ms pro Umschaltung, Element außerhalb
des Dokumentflusses) — begründet im Stylesheet. Melden, messen, entscheiden;
nicht blind übernehmen.
