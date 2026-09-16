# FAME CAFÉ — Website

Produktionsnahe Website-Grundlage für FAME CAFÉ Gummersbach.

## Design Lock

Die bestehende FAME-Designrichtung bleibt geschützt: freigegebene Farbwelt, FAME-Wortmarke, Editorial-Serif/Sans-System, Coffee × Matcha Hero, Kreis-/Split-Sprache und Half/Half-Scrollmoment werden nicht ohne ausdrückliche Freigabe ersetzt.

## Inhaltlicher Stand

Verifiziert und deshalb verwendbar:

- Fame Cafe ACH UG (haftungsbeschränkt)
- Gummersbacher Straße 12, 51645 Gummersbach
- HRB 129225, Amtsgericht Köln
- Geschäftsführer: Harisch Sivasoruban
- Cafébetrieb
- Matcha-Getränke
- Açaí-Bowls
- Kaffee
- Teespezialitäten
- Kuchen und Backwaren
- Cateringdienstleistungen

Nicht erfinden bzw. vor Veröffentlichung noch bestätigen:

- Öffnungszeiten
- Telefonnummer
- öffentliche Café-E-Mail-Adresse
- finale Domain
- finale Social-Media-Accounts
- vollständige Speisekarte
- Preise
- konkrete Zutaten/Rezepturen
- konkrete Rösterei/Bohnenherkunft
- finale Fame-Produktfotos

## Bildstatus

Die aktuell eingebundenen externen Fotografien sind temporäre Entwicklungs-/Demo-Assets. Vor finalem Launch sollen sie durch konsistente echte FAME-Fotografie bzw. final freigegebene Assets ersetzt werden.

## Coolify — Redeploy Contract

Das Repository ist so vorbereitet, dass Coolify direkt aus `main` bauen kann.

Empfohlene Konfiguration:

- Source: Git Repository `HKGrowthOperator/Fame-Caf-`
- Branch: `main`
- Build Pack: `Dockerfile`
- Base Directory: `/`
- Dockerfile Location: `/Dockerfile`
- Exposed/Container Port: `3000`

Kompatibilität: Falls die bestehende Coolify-App weiterhin `/deploy/coolify/Dockerfile` verwendet, ist auch dieser Dockerfile auf demselben Stand und kann ohne Umstellung weiterverwendet werden.

Nach einem Redeploy muss `/health.txt` erreichbar sein. Der Endpunkt wird bewusst ohne Cache ausgeliefert und dient dazu zu prüfen, dass wirklich der neue Repository-Build läuft.

Für Quellcodeänderungen in Coolify `Redeploy` verwenden. Wenn ein alter Layer trotz neuem Commit wiederverwendet wird, `Force deploy (without cache)` verwenden.

## Enthalten

- Coffee × Matcha Hero
- Half/Half Scroll Story
- Coffee-/Matcha-Ritual
- Coffee / Matcha / Açaí Produktwelten
- Tea und Cake & Bakery Kategorien
- Café Experience
- Editorial Gallery
- Catering
- Visit mit verifizierter Adresse
- Impressum / Datenschutz als technischer Stand
- Local SEO / strukturierte Daten nur mit bestätigten Angaben
- Reduced Motion
- responsive Desktop / Tablet / Mobile

## Wichtige Dateien

- `index.html` — Homepage
- `styles.css` — ursprüngliches Basissystem
- `premium-fixes.css` — freigegebene Premium-Designkorrekturen
- `master-upgrade.css` — Ergänzungen des Master-Passes
- `script.js` — Scroll-/Reveal-Logik
- `Dockerfile` — bevorzugter Coolify-Build ab Repo-Root
- `deploy/coolify/Dockerfile` — kompatibler bestehender Coolify-Build
- `deploy/coolify/nginx.conf` — Runtime-Konfiguration
- `health.txt` — Build-/Deploy-Prüfung
- `FAME_MASTER_EXECUTION_PROMPT.md` — verbindlicher Design-/Content-Lock

## Grundregel

Keine Fake-Daten. Keine erfundenen Preise, Öffnungszeiten, Bewertungen, Zutaten, Herkunftsangaben oder Social Handles. Fehlende Daten werden architektonisch vorbereitet, aber nicht als Fakten veröffentlicht.
