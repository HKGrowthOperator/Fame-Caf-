# Projekt-Skills

## transitions-dev (mitgeliefert)

Zwölf portable CSS-Transitions mit `prefers-reduced-motion`-Guard, jeweils
unter `t-*` benannt. Quelle: `transitions.dev`. Hier eingecheckt, weil die
Seite laufend am Motion-System arbeitet und die Snippets ohne Framework
auskommen — das passt zum statischen Stack.

Für FAME direkt anschlussfähig:

| Snippet | Wofür hier |
|---|---|
| `04-text-states-swap.md` | Textwechsel im Ritual (aktuell handgeschrieben) |
| `05-menu-dropdown.md`, `07-panel-reveal.md` | mobiles Navigations-Overlay |
| `09-icon-swap.md` | Zwei-Linien-Toggle zum X |
| `01-card-resize.md` | Menükarten, sobald echte Produkte dazukommen |

## impeccable (nicht mitgeliefert)

Wird nicht eingecheckt: rund 880 KB, aktualisiert sich über die eigene CLI
und ist in der Regel bereits global verfügbar. Der für dieses Projekt
wichtigste Teil ist der Anti-Pattern-Scanner, der über `npm run scan`
eingebunden ist.

## Was bewusst nicht eingebunden ist

`taste-skill` schreibt eigene Schriften, eine eigene Palette und eigene
Komponentenformen vor (Geist Sans, Instrument Serif, Bento-Grids). Das steht
im direkten Widerspruch zum Design Lock in `FAME_MASTER_EXECUTION_PROMPT.md`.
Brauchbar ist dort allein die Negativliste generischer KI-Muster — als
Checkliste, nicht als Gestaltungsvorgabe.
