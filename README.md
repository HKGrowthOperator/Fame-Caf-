# FAME CAFÉ — Website

Produktionsnahe Website-Grundlage für FAME CAFÉ Gummersbach.
Statisches HTML, ein Stylesheet, ein Skript. Kein Build-Schritt, kein Framework.

## Design Lock

Die bestehende FAME-Designrichtung bleibt geschützt: freigegebene Farbwelt,
FAME-Wortmarke, Editorial-Serif/Sans-System, Coffee × Matcha Hero, Kreis-/
Split-Sprache und Half/Half-Scrollmoment werden nicht ohne ausdrückliche
Freigabe ersetzt. Verbindlich ist `FAME_MASTER_EXECUTION_PROMPT.md`.

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Startseite |
| `impressum.html`, `datenschutz.html` | Rechtstexte |
| `404.html` | Fehlerseite |
| `styles.css` | vollständiges Stylesheet, in 20 nummerierte Abschnitte gegliedert |
| `script.js` | Scroll, Ritual-Sequenz, Navigation |
| `assets/fonts/` | lokal ausgelieferte Schriften (SIL OFL, siehe `LICENSE.md` dort) |
| `assets/favicon.svg`, `assets/fame-og.png` | Markenzeichen und Social-Vorschau |
| `assets/fame-og.source.html` | Vorlage, aus der `fame-og.png` gerendert wurde |
| `site.webmanifest` | Web-App-Manifest |
| `Dockerfile`, `deploy/coolify/` | Coolify-Build und nginx-Konfiguration |
| `health.txt` | Deploy-Prüfpunkt |

## Bilder tauschen

Alle Bildquellen stehen als Custom Properties im `:root`-Block von `styles.css`
unter „Bildslots". Für den Wechsel auf echte FAME-Fotografie werden nur diese
Zeilen geändert — sonst nichts:

```css
--img-coffee:  url('...');   /* große Fassung  */
--img-coffee-s:url('...');   /* mobile Fassung */
--img-matcha: …  --img-acai: …  --img-space: …  --img-craft: …
```

Hinter jedem Foto liegt eine markenfarbige Fläche (`--fallback-*`). Fällt eine
Bildquelle aus, bleibt die FAME-Farbwelt stehen statt einer schwarzen Fläche.

## Echte Speisekarte ergänzen

`index.html` enthält im Menü-Abschnitt einen Kommentar mit dem vorgesehenen
Aufbau. Jede Kategorie bekommt ein `<ul class="menu-list">`; die Klassen
`menu-list-name` und `menu-list-price` sind im Stylesheet vorbereitet.
Bis bestätigte Produkte vorliegen, bleibt die Struktur leer.

## Inhaltlicher Stand

Verifiziert und deshalb verwendbar:

- Fame Cafe ACH UG (haftungsbeschränkt)
- Gummersbacher Straße 12, 51645 Gummersbach
- HRB 129225, Amtsgericht Köln
- Geschäftsführer: Harisch Sivasoruban
- Cafébetrieb, Matcha-Getränke, Açaí-Bowls, Kaffee, Teespezialitäten,
  Kuchen und Backwaren, Cateringdienstleistungen
- Offizieller Instagram-Account: `@fame.cafe.gm`
  (https://www.instagram.com/fame.cafe.gm/)
- Eröffnung: Fr, 09.10.2026 (Grand Opening) 15:00–23:00 Uhr; Sa, 10.10. 10:00–23:00 Uhr; So, 11.10. 10:00–22:00 Uhr; ab Mo, 12.10. täglich 07:00–23:00 Uhr (Quelle: offizielles Instagram-Profil, Stand 04.10.2026).
- Sitzplätze drinnen und draußen
- Produkte: Espresso, Cappuccino, Flat White, Iced Matcha, Matcha Latte,
  Açaí Bowl, Tea Specials, Cake & Bakery (vom Betreiber bestätigt)

Vor Veröffentlichung noch zu bestätigen — nicht erfinden:

- Telefonnummer
- öffentliche Café-E-Mail-Adresse
- finale Domain
- Preise zu den bestätigten Produkten
- Zutaten und Rezepturen
- Rösterei bzw. Bohnenherkunft
- finale FAME-Produktfotos

Die Startseite zeigt die Eröffnungszeiten zeitgesteuert in `opening-2026.js` (Zeitzone Europe/Berlin). Hinweise auf vergangene Eröffnungstage verschwinden automatisch; ab dem 12.10. bleibt nur der reguläre Stundenplan sichtbar. Die strukturierten Daten in `index.html` enthalten die Sonderöffnungszeiten und den Beginn der regulären Zeiten.

## Reservierungssystem

Gäste reservieren online ohne Anruf; das Personal bearbeitet alles in einer
Verwaltung am Handy. Jede Reservierung belegt **90 Minuten**.

```
Besucher ──► nginx (:3000) ──► statische Seite (index.html, admin/)
                         └──► /api/*  ──► server/index.mjs (Node, 127.0.0.1:3001)
                                              └──► /data/state.json
```

Ein Container, zwei Prozesse (`deploy/coolify/start.sh`). Der Dienst hat keine
Abhängigkeiten und keinen Datenbankserver; der Speicher ist eine atomar
geschriebene JSON-Datei.

### Einrichtung in Coolify (Pflicht, sonst startet nichts Sinnvolles)

1. **Persistenter Speicher:** *Storages → Add* → Destination Path `/data`.
   Ohne dieses Volume sind alle Reservierungen nach dem nächsten Deploy weg.
2. **Umgebungsvariable `FAME_ADMIN_TOKEN`:** ein langer, zufälliger Code
   (mindestens 16 Zeichen), z. B. `openssl rand -base64 24`. Er ist das
   Passwort für `/admin/`. Nicht ins Repository schreiben.
3. Optional: `FAME_PUBLIC_BASE` (z. B. `https://deine-domain.de`),
   `FAME_NOTIFY_URL` und `FAME_NOTIFY_FORMAT` (`json` oder `ntfy`) für eine
   Meldung aufs Handy bei neuen Anfragen, `FAME_PROXY_HOPS` (Standard 1, passt
   zu Coolify/Traefik).
4. **Nur eine Instanz** betreiben (keine Replikas): Die Datei wird von einem
   Prozess geschrieben.
5. `/data` in die Sicherung aufnehmen (eine Datei: `state.json`).

Verwaltung: `https://<domain>/admin/`. Wer den Code hat, sieht alle Buchungen.

### Was die Seite zeigt, wenn etwas fehlt

Der Abschnitt „Reserve your table“ steht immer im HTML. Ohne JavaScript, ohne
erreichbaren Dienst oder bei einem Fehler zeigt er einen Hinweis mit
Instagram-Link statt eines Formulars. Es gibt nie ein Formular, das nicht
funktioniert. Das ist durch `npm run booking` abgesichert.

### Betriebswerte, die der Betreiber bestätigen muss

Im Verwaltungsbereich unter *Einstellungen*. Die Startwerte sind technische
Vorgaben, **keine Aussagen über das Café**:

| Wert | Startwert | Hinweis |
|---|---|---|
| Dauer | 90 min | vom Betreiber bestätigt |
| Öffnungszeiten | wie auf der Seite | vom Betreiber bestätigt (Eröffnungstage, ab 12.10. täglich 07:00–23:00) |
| **Plätze drinnen/draußen** | **leer** | echte Zahl eintragen; erst dann schützt das System vor Überbuchung und ist Sofortbuchung möglich |
| Modus | Anfrage (Personal bestätigt) | „Sofortbuchung“ erst nach Eintrag der Plätze |
| Zeitraster | 30 min | |
| Vorlauf | 60 min | kürzere Zeiten heute sind nicht buchbar |
| Max. Personen online | 8 | größere Gruppen werden auf Instagram verwiesen |
| Vorbuchung | 60 Tage | |
| Löschfrist Kontaktdaten | 30 Tage nach dem Termin | steht so in der Datenschutzerklärung; bei Änderung dort anpassen |

### Bedienung

- **Anfragen:** Bestätigen oder Ablehnen. Antworten per Anruf, WhatsApp oder
  E-Mail mit vorbereitetem Text (Knöpfe an der Karte).
- **Tag:** Alle Reservierungen eines Tages, „Gäste sind da“, No-Show, Stornieren,
  Verschieben (prüft die Kapazität), Spitzenbelegung je Bereich.
- **+ Buchung:** Telefon- und Laufkundschaft eintragen.
- **Sperren:** ganzer Tag, Zeitraum, nur drinnen/draußen, oder nur eine Anzahl
  Plätze (z. B. für eine Gruppe). Wirkt sofort online. Bestehende Reservierungen
  bleiben bestehen; die Verwaltung nennt die betroffenen.
- **Einstellungen:** Plätze, Zeiten, Sonderzeiten und Feiertage, Löschfrist.

### Grenzen (bewusst, nicht vergessen)

- **Es gibt keine automatische E-Mail oder SMS an Gäste.** Eine geschäftliche
  E-Mail-Adresse und ein Absenderkonto stehen noch nicht fest. Der Gast sieht
  den Stand auf seiner persönlichen Link-Seite (aktualisiert sich bei offener
  Seite selbst), das Personal antwortet zusätzlich per WhatsApp/E-Mail-Vorlage.
  Ein Mailversand lässt sich später am Server ergänzen.
- Die WhatsApp-Vorlage nimmt bei Nummern ohne Landesvorwahl Deutschland an.
- Die Wartezeit auf eine Bestätigung ist menschlich: Wer im Modus „Anfrage“
  nicht reagiert, dessen Anfrage verfällt 30 Minuten nach der gewünschten Zeit.
- Die Datenschutzerklärung enthält einen neuen Abschnitt zur Reservierung; er
  sollte vor dem Launch rechtlich geprüft werden.

### Bestellen (QR am Tisch, Mitnehmen)

Eigene Unterseite unter `/bestellen/`, unabhängig von der Hauptseite (nicht dort verlinkt,
`noindex`). Zwei Wege:

- **Am Tisch:** Jeder Tisch hat einen QR-Code mit Tisch und geheimem Schlüssel
  (`/bestellen/?t=12&k=…`). Der Gast bestellt vom Platz, ohne sich anzustellen.
- **Mitnehmen/Abholen:** `/bestellen/` ohne Parameter. Name (Pflicht), Telefon (freiwillig),
  Abholzeit im Raster oder „so schnell wie möglich“. Vorbestellen vor der Öffnung geht,
  „sofort“ nur bei geöffnetem Café.

Das Personal arbeitet unter `/admin/bestellungen.html` (derselbe Zugangscode wie die
Reservierung): **Tafel** (Neu → In Arbeit → Fertig → Erledigt, Ton bei neuer Bestellung, Pause),
**Karte** (Preise, Beschreibung, „Verfügbar“-Haken wirkt sofort, wenn etwas ausverkauft ist),
**Tische** (anlegen, gebrandete QR-Karten drucken, 6 pro A4-Seite) und **Einstellungen**.

**Einrichtung, in dieser Reihenfolge:**

1. **Karte prüfen.** Die Startkarte übernimmt die Produkte und die *Vorschau-Preise*, die die
   Website schon zeigt. Bagel hat noch keinen Preis; „Cake & Bakery“ steht auf der Seite nur als
   „ab 4,50 €“ und ist deshalb nicht bestellbar, bis echte Artikel mit Preisen angelegt sind.
   **Artikel ohne Preis sehen Gäste nicht.**
2. **Tische anlegen** (z. B. „1 bis 12“) und die QR-Karten drucken.
3. **Freischalten** unter *Einstellungen*. Bis dahin sehen Gäste „noch nicht freigeschaltet“.

**Grenzen (bewusst, nicht vergessen):**

- **Keine Online-Zahlung.** Bezahlt wird vor Ort; die Seite sagt das so.
- **Keine Varianten oder Extras** (Milchsorte, Größe, Toppings). Wünsche gehen als Freitext in
  die Anmerkung. Echte Optionen brauchen die Angaben des Betreibers und werden nicht erfunden.
- **Keine Allergen- und Zusatzstoffangaben.** Für Speisen und Getränke im Verkauf sind sie
  rechtlich erforderlich (Lebensmittelinformationsverordnung); sie sind hier nicht hinterlegt und
  müssen vor dem Echtbetrieb ergänzt und geprüft werden.
- Der Ton auf der Tafel funktioniert nur, solange die Seite im Browser geöffnet ist.
  Optional meldet `FAME_NOTIFY_URL` neue Bestellungen aufs Handy (ohne Namen).
- Ändert sich eine Tischbezeichnung, muss der Code neu gedruckt werden. Geht `/data` verloren,
  entsteht ein neues Geheimnis — alle gedruckten Codes sind dann ungültig.
- Bestellungen am Tisch brauchen keine personenbezogenen Daten. Abholung speichert Name und
  Telefon 30 Tage (siehe Datenschutzerklärung).

### Tests

```bash
npm run test:server   # Logik und API (node:test, ohne Browser)
npm run booking       # Gast, Verwaltung, Ausfälle, 6 Breiten (Browser)
npm run orders        # Bestellen: Tisch, Mitnehmen, Tafel, Karte, QR-Codes dekodiert (Browser)
npm run mobile        # Schriftgrößen, Tippflächen, Bildgewicht auf dem Handy
npm run qa            # alles zusammen
npm start             # Dienst lokal: FAME_ADMIN_TOKEN=… DATA_DIR=./data npm start
```

Die Browsertests laufen mit festem Datum (Sa 10.10.2026, 12:00 Uhr), damit
kein Ergebnis davon abhängt, wann sie laufen.

### Mobil

Die meisten Besucher kommen über das Handy. `mobile.css` (nur bis 780 px)
setzt Mindestgrößen: Beschriftungen 11 px, Angaben 12–14 px, Tippflächen 44 px.
`mobile-images.css` liefert kleinere Bildvarianten und wird von
`tools/gen-mobile-images.mjs` aus den Quell-Stylesheets erzeugt
(`npm run images`; `npm run qa` prüft, dass sie aktuell ist). Neue Bilder im CSS
brauchen danach einmal `npm run images`.

## Offene Punkte vor dem öffentlichen Launch

1. **Bilder.** Alle Fotos liegen unter `assets/photos/` und werden vom eigenen
   Server ausgeliefert; beim Seitenaufruf geht keine Anfrage an einen fremden
   Bilddienst (`npm run mobile` prüft das). Die Dateien `u-<id>.jpg` stammen von
   Unsplash (Unsplash-Lizenz, `<id>` ist die Foto-ID dort) und sind
   Stimmungsbilder, keine FAME-Fotos — nach und nach durch echte FAME-Fotografie
   ersetzen. Zwei echte Innenraum-Fotos
   sind schon drin (`assets/photos/`: Tische und Stühle in „Drinnen“, Decke und
   Lampen in der Galerie-Kachel „SPACE“). Sie sind **bewusst ohne Personen
   zugeschnitten** und ohne EXIF-/GPS-Daten gespeichert; das Original zeigt
   Gäste mit erkennbaren Gesichtern und gehört so nicht auf die Seite. Neue eigene
   Fotos: `NAME.jpg` plus kleinere Handy-Variante `NAME-m.jpg` ablegen, danach
   `npm run images`.
2. **Domain.** Erst wenn die Produktionsdomain feststeht: `canonical` setzen,
   `sitemap.xml` anlegen, in `robots.txt` verlinken und `og:image` von einem
   relativen Pfad auf eine absolute URL umstellen. Social-Crawler lösen
   relative Pfade nicht auf.
3. **Kontakt.** Geschäftliche E-Mail-Adresse in Impressum und Datenschutz
   ergänzen. Ohne elektronischen Kontaktweg ist das Impressum nicht vollständig.
4. **Preise.** Die Karte zeigt die Preise aus dem Entwurf (Fame Picks und Menü,
   jeweils dieselben Beträge doppelt in `index.html`). Sie sind vom Betreiber
   noch nicht bestätigt. Die Seite sagt dazu: „Maßgeblich sind die Preise auf
   der Karte im Café.“ Sobald die echte Karte da ist, beide Stellen und die
   Bestellkarte unter `/admin/bestellungen.html` angleichen. Die Preise stehen
   nicht in den strukturierten Daten, Google zeigt sie also nicht an.
5. **Reservierung.** Plätze drinnen/draußen eintragen, Betriebsmodus wählen,
   `FAME_ADMIN_TOKEN` und das `/data`-Volume in Coolify einrichten (siehe oben),
   Datenschutzabschnitt rechtlich prüfen lassen, geschäftliche E-Mail für
   automatische Gästebestätigung festlegen.
6. **Karte.** Google Maps lädt erst auf Klick — die iframe entsteht erst,
   wenn ein Besucher sie anfordert. Kommt später eine übergreifende
   Consent-Lösung dazu, wird dieser Button darin aufgehen.

## Coolify — Redeploy Contract

- Source: Git Repository `HKGrowthOperator/Fame-Caf-`
- Build Pack: `Dockerfile`
- **Storage:** `/data` (persistent), **Env:** `FAME_ADMIN_TOKEN` — siehe „Reservierungssystem“
- Base Directory: `/`
- Dockerfile Location: `/Dockerfile`
- Exposed/Container Port: `3000`

`deploy/coolify/Dockerfile` ist inhaltsgleich, falls die bestehende App noch
auf diesen Pfad zeigt. Beide kopieren den Site-Inhalt als Ganzes — neue
Dateien müssen nicht mehr einzeln nachgetragen werden.

Nach einem Redeploy muss `/health.txt` erreichbar sein; der Endpunkt wird
ungecacht ausgeliefert. Für Quellcodeänderungen `Redeploy` verwenden, bei
wiederverwendeten Layern `Force deploy (without cache)`.

### Caching

HTML und `health.txt` werden mit `no-store` ausgeliefert, damit ein Redeploy
sofort sichtbar ist. CSS und JS tragen im Markup einen Versionsparameter
(`?v=v5`) und werden eine Stunde gecacht; Schriften ein Jahr. **Nach einer
Änderung an `styles.css` oder `script.js` den Parameter in allen vier
HTML-Dateien hochzählen.**

## Grundregel

Keine Fake-Daten. Keine erfundenen Preise, Öffnungszeiten, Bewertungen,
Zutaten, Herkunftsangaben oder Social Handles. Fehlende Daten werden
architektonisch vorbereitet, aber nicht als Fakten veröffentlicht.
