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

Vor Veröffentlichung noch zu bestätigen — nicht erfinden:

- Öffnungszeiten
- Telefonnummer
- öffentliche Café-E-Mail-Adresse
- finale Domain
- finale Social-Media-Accounts
- vollständige Speisekarte, Preise, Zutaten, Rezepturen
- Rösterei bzw. Bohnenherkunft
- finale FAME-Produktfotos

## Offene Punkte vor dem öffentlichen Launch

1. **Bilder.** Die eingebundenen Unsplash-Fotos sind Entwicklungsassets.
   Vor dem Launch durch echte FAME-Fotografie ersetzen, lokal ausliefern
   und in modernen Formaten (AVIF/WebP) anbieten.
2. **Domain.** Erst wenn die Produktionsdomain feststeht: `canonical` setzen,
   `sitemap.xml` anlegen, in `robots.txt` verlinken und `og:image` von einem
   relativen Pfad auf eine absolute URL umstellen. Social-Crawler lösen
   relative Pfade nicht auf.
3. **Kontakt.** Geschäftliche E-Mail-Adresse in Impressum und Datenschutz
   ergänzen. Ohne elektronischen Kontaktweg ist das Impressum nicht vollständig.
4. **Öffnungszeiten.** Sobald bestätigt: im Visit-Abschnitt ergänzen und als
   `openingHoursSpecification` in die strukturierten Daten aufnehmen.
5. **Karte.** Erst einbinden, wenn die Consent-Lösung entschieden ist.

## Coolify — Redeploy Contract

- Source: Git Repository `HKGrowthOperator/Fame-Caf-`
- Build Pack: `Dockerfile`
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
