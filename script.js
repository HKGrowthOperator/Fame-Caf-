/* FAME CAFÉ — Scroll, Ritual und Navigation.
   Nativ, kein Framework. Regeln:
   - Nur transform/opacity und CSS-Variablen anfassen, nie Layout-Eigenschaften.
   - Eine Quelle pro Wert: Das Skript setzt --p und --shift, das Aussehen
     steht komplett im Stylesheet.
   - Scheitert irgendetwas, muss der Inhalt trotzdem sichtbar sein. */

(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---- Sicherheitsnetz -------------------------------------------------
     .reveal startet mit opacity:0, sobald die Klasse .js gesetzt ist.
     Wenn hier etwas schiefgeht, wäre die Seite ohne diese Zeilen leer. */
  function revealEverything() {
    var nodes = document.querySelectorAll('.reveal');
    for (var i = 0; i < nodes.length; i++) nodes[i].classList.add('in-view');
  }
  window.addEventListener('error', revealEverything);
  setTimeout(function () {
    // Falls der Observer nie gelaufen ist (alter Browser, blockiertes Skript).
    if (!document.querySelector('.reveal.in-view')) revealEverything();
  }, 2500);

  /* ---- Navigation ------------------------------------------------------ */

  var header = document.getElementById('siteHeader');
  var navToggle = document.getElementById('navToggle');
  var mobileNav = document.getElementById('mobileNav');
  var lastFocused = null;

  function focusableIn(el) {
    return Array.prototype.filter.call(
      el.querySelectorAll('a[href], button:not([disabled])'),
      function (n) { return n.offsetParent !== null; }
    );
  }

  function openNav() {
    if (!mobileNav || !navToggle) return;
    lastFocused = document.activeElement;
    mobileNav.hidden = false;
    navToggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('nav-open');
    var f = focusableIn(mobileNav);
    if (f.length) f[0].focus();
  }

  function closeNav(returnFocus) {
    if (!mobileNav || !navToggle) return;
    mobileNav.hidden = true;
    navToggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-open');
    if (returnFocus && lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function navIsOpen() {
    return !!mobileNav && !mobileNav.hidden;
  }

  if (navToggle && mobileNav) {
    navToggle.addEventListener('click', function () {
      if (navIsOpen()) closeNav(true); else openNav();
    });

    // Sprungziel anspringen und schließen.
    mobileNav.addEventListener('click', function (e) {
      var link = e.target.closest ? e.target.closest('a') : null;
      if (link) closeNav(false);
    });

    document.addEventListener('keydown', function (e) {
      if (!navIsOpen()) return;
      if (e.key === 'Escape') {
        closeNav(true);
        return;
      }
      if (e.key !== 'Tab') return;
      // Fokus im Overlay halten, solange es offen ist.
      var f = focusableIn(mobileNav);
      if (!f.length) return;
      var first = f[0];
      var last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    // Beim Wechsel auf Desktopbreite hat das Overlay keine Bedienung mehr.
    var desktopQuery = window.matchMedia('(min-width: 981px)');
    var onDesktopChange = function (e) { if (e.matches && navIsOpen()) closeNav(false); };
    if (desktopQuery.addEventListener) desktopQuery.addEventListener('change', onDesktopChange);
    else if (desktopQuery.addListener) desktopQuery.addListener(onDesktopChange);
  }

  /* ---- Ritual ---------------------------------------------------------- */

  var ritual = document.getElementById('ritual');
  var axisProgress = document.getElementById('axisProgress');
  var axisDisc = document.getElementById('axisDisc');
  var heroHalves = [].slice.call(document.querySelectorAll('.hero-half[data-parallax]'));

  var coffeeSteps = [
    ['01', 'BEANS.', 'Der Coffee-Moment beginnt mit Materialität, Ruhe und Fokus auf das Produkt.'],
    ['02', 'GRIND.', 'Der nächste Schritt wird sichtbar, ohne die Seite mit technischer Erklärung zu überladen.'],
    ['03', 'DOSE.', 'Präzision als Teil der Bildsprache — kurz, ruhig und kontrolliert.'],
    ['04', 'EXTRACT.', 'Bewegung, Textur und Kontrast tragen die Coffee-Welt durch den Scroll.'],
    ['05', 'POUR.', 'Der Übergang bleibt weich und editorial statt wie eine technische Demo.'],
    ['06', 'SERVE.', 'Der Abschluss gehört dem Produkt und dem Moment an der Bar.']
  ];

  var matchaSteps = [
    ['01', 'FOAM.', 'Eine visuelle Build-Sequenz, Schicht für Schicht.'],
    ['02', 'ICE.', 'Kühle Textur und klare Formen bringen Bewegung in das Glas.'],
    ['03', 'LAYER.', 'Eine neutrale visuelle Schicht ersetzt unbestätigte Zutatenangaben.'],
    ['04', 'MATCHA.', 'Das Grün übernimmt den Frame und macht die Produktwelt sofort erkennbar.'],
    ['05', 'LID.', 'Der Build schließt sich, ohne daraus eine erfundene Rezeptur zu machen.'],
    ['06', 'STRAW.', 'Der letzte visuelle Schritt. Danach gehört der Fokus wieder dem fertigen Moment.']
  ];

  var phases = ['START', 'BUILD', 'BUILD', 'BUILD', 'FINISH', 'READY'];

  var el = {
    coffeeNo: document.getElementById('coffeeNo'),
    coffeeTitle: document.getElementById('coffeeTitle'),
    coffeeText: document.getElementById('coffeeText'),
    matchaNo: document.getElementById('matchaNo'),
    matchaTitle: document.getElementById('matchaTitle'),
    matchaText: document.getElementById('matchaText')
  };

  var currentStep = -1;

  // Animation neu starten, indem die Klasse entfernt, ein Reflow erzwungen
  // und sie wieder gesetzt wird. Ohne den Reflow ignoriert der Browser den
  // Neustart, weil sich der berechnete Wert nicht geändert hat.
  function restartStepAnimation(node) {
    if (!node) return;
    node.classList.remove('step-in');
    void node.offsetWidth;
    node.classList.add('step-in');
  }

  function setStep(index) {
    var i = Math.max(0, Math.min(coffeeSteps.length - 1, index));
    if (i === currentStep) return;
    var first = currentStep === -1;
    currentStep = i;

    var c = coffeeSteps[i];
    var m = matchaSteps[i];

    if (el.coffeeNo) el.coffeeNo.textContent = c[0];
    if (el.coffeeTitle) el.coffeeTitle.textContent = c[1];
    if (el.coffeeText) el.coffeeText.textContent = c[2];
    if (el.matchaNo) el.matchaNo.textContent = m[0];
    if (el.matchaTitle) el.matchaTitle.textContent = m[1];
    if (el.matchaText) el.matchaText.textContent = m[2];

    if (axisDisc) {
      axisDisc.dataset.step = c[0];
      axisDisc.dataset.phase = phases[i];
    }
    if (ritual) ritual.dataset.step = String(i + 1);

    if (!first && !reduceMotion.matches) {
      restartStepAnimation(el.coffeeTitle);
      restartStepAnimation(el.coffeeText);
      restartStepAnimation(el.matchaTitle);
      restartStepAnimation(el.matchaText);
    }
  }

  /* ---- Scroll ---------------------------------------------------------- */

  var ticking = false;

  function update() {
    ticking = false;

    var y = window.scrollY || window.pageYOffset || 0;
    if (header) header.classList.toggle('scrolled', y > 36);

    if (reduceMotion.matches) {
      setStep(0);
      return;
    }

    var vh = window.innerHeight || 1;

    // Hero: gegenläufiger Versatz je Hälfte. Der Wert bleibt innerhalb der
    // Überdeckung aus scale(1.035), sonst entstünden Kanten.
    var heroProgress = Math.min(1, y / vh);
    for (var h = 0; h < heroHalves.length; h++) {
      var dir = parseFloat(heroHalves[h].dataset.parallax) || 0;
      var img = heroHalves[h].querySelector('.hero-image');
      if (img) img.style.setProperty('--shift', (heroProgress * dir * 1.4).toFixed(3) + '%');
    }

    if (!ritual) return;

    var rect = ritual.getBoundingClientRect();
    if (rect.top > vh || rect.bottom < 0) return;

    var total = Math.max(ritual.offsetHeight - vh, 1);
    var p = Math.min(Math.max(-rect.top, 0), total) / total;

    // Eine Variable steuert Zoom, Filter und Farbfläche — siehe Stylesheet.
    ritual.style.setProperty('--p', p.toFixed(4));

    if (axisProgress) axisProgress.style.height = (p * 100).toFixed(2) + '%';
    if (axisDisc) axisDisc.style.top = (8 + p * 84).toFixed(2) + '%';

    var count = coffeeSteps.length;
    setStep(Math.min(count - 1, Math.floor(Math.min(p, 0.999999) * count)));
  }

  function requestTick() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(update);
  }

  window.addEventListener('scroll', requestTick, { passive: true });
  window.addEventListener('resize', requestTick);
  if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', requestTick);
  else if (reduceMotion.addListener) reduceMotion.addListener(requestTick);

  /* ---- Reveal ---------------------------------------------------------- */

  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          entries[i].target.classList.add('in-view');
          observer.unobserve(entries[i].target);
        }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -4% 0px' });

    var reveals = document.querySelectorAll('.reveal');
    for (var r = 0; r < reveals.length; r++) observer.observe(reveals[r]);
  } else {
    revealEverything();
  }

  setStep(0);
  update();
})();
