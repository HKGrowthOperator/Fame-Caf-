# CLAUDE.md — FAME CAFÉ Website

## Projekt

Statische Website für FAME CAFÉ Gummersbach. HTML, ein Stylesheet, ein Skript.
Kein Framework, kein Build-Schritt für die Seite selbst. Deploy über Coolify
mit nginx im Container.

Verbindlich ist `FAME_MASTER_EXECUTION_PROMPT.md`. Bei Widersprüchen gewinnt
dieses Dokument.

## Zwei Regeln, die alles andere schlagen

**1. Design Lock.** Farbwelt, FAME-Wortmarke, Serif/Sans-System, Hero-Komposition,
Half/Half Coffee × Matcha und die Kreis-/Bubble-Sprache werden nicht ersetzt.
Kein Redesign, kein Framework-Wechsel, keine neue Designrichtung. Verfeinern ja,
austauschen nein. Sieht etwas bereits gut aus: nicht anfassen.

**2. Keine erfundenen Daten.** Niemals Öffnungszeiten, Telefonnummern,
E-Mail-Adressen, Preise, Produktnamen, Zutaten, Rezepturen, Rösterei-Herkunft,
Bewertungen, Social-Handles oder Events erfinden. Fehlt eine Angabe, wird die
Struktur vorbereitet und der offene Punkt im README dokumentiert — der Wert
selbst bleibt leer.

Öffentlich bestätigt und damit verwendbar: Fame Cafe ACH UG
(haftungsbeschränkt), Gummersbacher Straße 12, 51645 Gummersbach, HRB 129225,
Amtsgericht Köln, Geschäftsführer Harisch Sivasoruban, sowie die
Produktbereiche Kaffee, Matcha-Getränke, Açaí-Bowls, Teespezialitäten,
Kuchen und Backwaren, Catering.

Vom Betreiber zusätzlich bestätigt: Instagram `@fame.cafe.gm`, Öffnungszeiten
täglich 07:00–17:00 Uhr, Sitzplätze drinnen und draußen, sowie die Produkte
Espresso, Cappuccino, Flat White, Iced Matcha, Matcha Latte, Açaí Bowl,
Tea Specials und Cake & Bakery. Preise fehlen weiterhin und werden nicht
erfunden.

## Befehle

```bash
npm install && npx playwright install chromium   # einmalig
npm run qa          # Sweep + Verhaltensprüfungen — vor jedem Commit
npm run sweep       # Overflow und Skriptfehler, 4 Seiten x 11 Breiten
npm run behaviour   # Navigation, Tastatur, ohne JS, reduced motion, 404
npm run screens     # Screenshots aller Abschnitte nach tools/qa/.screens/
npm run scan        # Anti-Pattern-Scan (impeccable)
```

Vor und nach einem CSS-Umbau:

```bash
node tools/qa/styles.mjs snapshot vorher
# ... umbauen ...
node tools/qa/styles.mjs snapshot nachher
node tools/qa/styles.mjs diff vorher nachher
```

Der Diff vergleicht alle im Dokument vorkommenden Klassen mit je 52 berechneten Eigenschaften
über 11 Viewportbreiten. Ein Refactoring, das nichts am Aussehen ändern soll,
muss hier leer ausgehen. Screenshots allein zeigen solche Abweichungen nicht.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | Startseite, Abschnittsreihenfolge laut Master-Prompt |
| `impressum.html`, `datenschutz.html`, `404.html` | Rechtstexte und Fehlerseite |
| `styles.css` | vollständiges Stylesheet |
| `script.js` | Scroll, Ritual-Sequenz, Navigation |
| `tools/qa/` | Prüfwerkzeuge (nicht Teil der ausgelieferten Seite) |
| `deploy/coolify/nginx.conf` | Routing, Caching, Header |

## Konventionen

- **Nur `transform` und `opacity` animieren.** Ausnahme ist die Header-Höhe;
  gemessen 0,22 ms pro Umschaltung bei einem Element außerhalb des
  Dokumentflusses, also unkritisch.
- **Keine externen Ressourcen ohne Zustimmung.** Schriften liegen lokal.
  Google Maps lädt erst, wenn ein Besucher den Button drückt — eine direkt
  eingebettete iframe überträgt die IP-Adresse vor jeder Zustimmung.
  Kommt etwas Neues dazu, gilt dieselbe Regel.
- **`.reveal` wird nur ausgeblendet, wenn `<html>` die Klasse `.js` trägt.**
  Diese Regel nicht umdrehen. Ohne sie ist die Seite bei JS-Ausfall leer.
- **Das Sicherheitsnetz steht inline im `<head>`, nicht in `script.js`.**
  Es setzt die Klasse auf `no-js` zurück, wenn ein `<script>` scheitert oder
  nach drei Sekunden nichts eingeblendet wurde. In `script.js` wäre es
  wirkungslos, genau wenn es gebraucht wird — nämlich wenn diese Datei nicht
  ankommt. Live ist daraus schon einmal eine komplett schwarze Seite
  geworden.
- **Jede Scroll-Choreografie braucht eine Textfassung.** Was nur beim
  Scrollen erscheint, muss bei `prefers-reduced-motion` und ohne JavaScript
  als Text vorhanden sein (Vorbild: `.ritual-steps`).
- **Dekorative Flächen sind `aria-hidden`.** Keine Projektnotizen in
  `aria-label` — das liest der Screenreader vor.
- **Cache-Busting.** Nach Änderungen an `styles.css` oder `script.js` den
  Parameter `?v=` in allen vier HTML-Dateien hochzählen. CSS und JS werden
  eine Stunde gecacht.
- **Commits auf Deutsch**, Format `typ(bereich): beschreibung`. Beschreiben,
  was vorher falsch war, nicht nur was jetzt da ist.

## Skills

`.claude/skills/transitions-dev` enthält zwölf portable CSS-Transitions mit
Reduced-Motion-Guard — erste Anlaufstelle für neue Bewegung, statt jedes Mal
neu zu schreiben. `.claude/skills/README.md` erklärt, was bewusst nicht
eingebunden ist und warum.

## Arbeitsreihenfolge

Audit → Design Lock prüfen → Daten verifizieren → Frontend → Motion →
Responsive → Performance → SEO → visuelle Abnahme.

Vor größeren Änderungen den bestehenden Stand ansehen. Ist eine vorhandene
Variante visuell besser, bleibt sie. Visuelle Qualität schlägt aufgeräumten
Code, und Ruhe schlägt ein weiteres Element.

## Offene Punkte

Stehen im README unter „Offene Punkte vor dem öffentlichen Launch". Kurz:
echte FAME-Fotos, Produktionsdomain (danach Canonical, Sitemap, absolute
`og:image`-URL), geschäftliche E-Mail-Adresse, Öffnungszeiten, Karte erst
nach Consent-Entscheidung.
