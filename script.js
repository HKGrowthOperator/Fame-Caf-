const header = document.getElementById('siteHeader');
const heroImages = [...document.querySelectorAll('.hero-image')];
const ritual = document.getElementById('ritual');
const axisProgress = document.getElementById('axisProgress');
const axisDisc = document.getElementById('axisDisc');
const coffeeShots = [...document.querySelectorAll('.coffee-shot')];
const matchaShots = [...document.querySelectorAll('.matcha-shot')];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const coffeeNo = document.getElementById('coffeeNo');
const coffeeTitle = document.getElementById('coffeeTitle');
const coffeeText = document.getElementById('coffeeText');
const matchaNo = document.getElementById('matchaNo');
const matchaTitle = document.getElementById('matchaTitle');
const matchaText = document.getElementById('matchaText');

const coffeeSteps = [
  ['01','GRIND.','Frisch gemahlen. Der erste Schritt, bevor Espresso, Textur und Pour zusammenkommen.'],
  ['02','EXTRACT.','Espresso läuft. Wärme, Druck und Timing geben dem Coffee-Part sichtbar Bewegung.'],
  ['03','TEXTURE.','Milch wird fein und glossy. Das Bild wechselt mit dem Scroll statt auf einem Motiv stehen zu bleiben.'],
  ['04','POUR.','Der letzte Coffee-Step: Espresso und Milch kommen zusammen. Fertig für FAME.']
];
const matchaSteps = [
  ['01','ICE.','Eis zuerst. Dann baut sich der Drink Schritt für Schritt sichtbar im Glas auf.'],
  ['02','BASE.','Die helle Basis kommt dazu und schafft den Kontrast für das kräftige Matcha-Grün.'],
  ['03','MATCHA.','Matcha übernimmt den Frame. Neue Fotografie, neue Bewegung, klarer Farbwechsel.'],
  ['04','STRAW.','Deckel und Strohhalm schließen den Build ab. Der fertige Drink bleibt im Fokus.']
];
const phases = ['START','BUILD','BUILD','READY'];
let currentStep = -1;
let ticking = false;

// Safari/iPad soll die Seite nicht an einer alten Scrollposition öffnen.
// Ein Sprungziel in der Adresse bleibt aber erhalten: Die frühere Fassung
// hat den Hash per replaceState entfernt, damit landete jeder geteilte Link
// auf /#menu stumm ganz oben.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.addEventListener('pageshow', function(){
  requestAnimationFrame(function(){
    if (window.location.hash) {
      var target = document.getElementById(window.location.hash.slice(1));
      if (target) { target.scrollIntoView(); return; }
    }
    window.scrollTo({top:0,left:0,behavior:'auto'});
  });
}, {once:true});

/* Sicherheitsnetz: .reveal startet auf opacity:0, sobald <html> die Klasse
   .js trägt. Scheitert das Skript, bliebe die Seite ohne diese Zeilen leer. */
function revealEverything(){
  var n = document.querySelectorAll('.reveal');
  for (var i = 0; i < n.length; i++) n[i].classList.add('in-view');
}
window.addEventListener('error', revealEverything);
setTimeout(function(){
  if (!document.querySelector('.reveal.in-view')) revealEverything();
}, 2500);

function setStep(index){
  const i = Math.max(0, Math.min(3, index));
  if(i === currentStep) return;
  currentStep = i;
  const c = coffeeSteps[i];
  const m = matchaSteps[i];
  coffeeNo.textContent = c[0]; coffeeTitle.textContent = c[1]; coffeeText.textContent = c[2];
  matchaNo.textContent = m[0]; matchaTitle.textContent = m[1]; matchaText.textContent = m[2];
  coffeeShots.forEach((shot,idx)=>shot.classList.toggle('is-active',idx===i));
  matchaShots.forEach((shot,idx)=>shot.classList.toggle('is-active',idx===i));
  if(axisDisc){ axisDisc.querySelector('strong').textContent = String(i+1).padStart(2,'0'); axisDisc.querySelector('span').textContent = phases[i]; }
}

function ritualProgress(){
  if(!ritual) return 0;
  const headerH = header?.offsetHeight || 62;
  const start = ritual.offsetTop - headerH;
  const end = ritual.offsetTop + ritual.offsetHeight - window.innerHeight;
  return Math.min(1, Math.max(0, (window.scrollY - start) / Math.max(1, end - start)));
}

function update(){
  ticking = false;
  const y = window.scrollY;
  if(header) header.classList.toggle('scrolled', y > 30);

  if(!reduceMotion.matches){
    const hp = Math.min(1, y / Math.max(1, window.innerHeight));
    heroImages.forEach((img,idx)=>{
      const scale = 1.04 + hp * (idx ? .025 : .018);
      img.style.transform = `scale(${scale})`;
    });
  }

  if(ritual){
    const p = ritualProgress();
    const idx = Math.min(3, Math.floor(Math.min(.999999,p) * 4));
    setStep(idx);
    if(axisProgress) axisProgress.style.height = `${p*100}%`;
    if(axisDisc) axisDisc.style.top = `${12 + p*78}%`;
  }
}

function requestTick(){ if(!ticking){ ticking = true; requestAnimationFrame(update); } }
window.addEventListener('scroll', requestTick, {passive:true});
window.addEventListener('resize', requestTick);
reduceMotion.addEventListener?.('change', requestTick);
window.addEventListener('load', ()=>{ setStep(0); update(); });

const observer = new IntersectionObserver(entries=>{
  entries.forEach(entry=>{
    if(entry.isIntersecting){ entry.target.classList.add('in-view'); observer.unobserve(entry.target); }
  });
},{threshold:.12,rootMargin:'0px 0px -5% 0px'});
document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));


/* ---- Mobile Navigation ----------------------------------------------------
   .desktop-nav ist unter 780px ausgeblendet; ohne dieses Overlay gäbe es
   dort keine Navigation. */

const navToggle = document.getElementById('navToggle');
const mobileNav = document.getElementById('mobileNav');
let lastFocused = null;

function focusableIn(el){
  return Array.prototype.filter.call(
    el.querySelectorAll('a[href], button:not([disabled])'),
    n => n.offsetParent !== null
  );
}
function navIsOpen(){ return !!mobileNav && !mobileNav.hidden; }
function openNav(){
  if(!mobileNav || !navToggle) return;
  lastFocused = document.activeElement;
  mobileNav.hidden = false;
  navToggle.setAttribute('aria-expanded','true');
  document.body.classList.add('nav-open');
  const f = focusableIn(mobileNav);
  if(f.length) f[0].focus();
}
function closeNav(returnFocus){
  if(!mobileNav || !navToggle) return;
  mobileNav.hidden = true;
  navToggle.setAttribute('aria-expanded','false');
  document.body.classList.remove('nav-open');
  if(returnFocus && lastFocused && lastFocused.focus) lastFocused.focus();
}

if(navToggle && mobileNav){
  navToggle.addEventListener('click', () => navIsOpen() ? closeNav(true) : openNav());
  mobileNav.addEventListener('click', e => { if(e.target.closest && e.target.closest('a')) closeNav(false); });

  document.addEventListener('keydown', e => {
    if(!navIsOpen()) return;
    if(e.key === 'Escape'){ closeNav(true); return; }
    if(e.key !== 'Tab') return;
    const f = focusableIn(mobileNav);
    if(!f.length) return;
    const first = f[0], last = f[f.length-1];
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  });

  const desktopQuery = window.matchMedia('(min-width: 781px)');
  const onDesktop = e => { if(e.matches && navIsOpen()) closeNav(false); };
  desktopQuery.addEventListener ? desktopQuery.addEventListener('change', onDesktop)
                                : desktopQuery.addListener(onDesktop);
}

/* ---- Karte erst auf Klick -------------------------------------------------
   Eine direkt eingebettete Maps-iframe überträgt die IP jedes Besuchers an
   Google, bevor jemand zugestimmt hat. Die iframe entsteht erst hier. */

const mapWrap = document.getElementById('mapWrap');
const mapConsentButton = document.getElementById('mapConsentButton');

if(mapWrap && mapConsentButton){
  mapConsentButton.addEventListener('click', () => {
    const src = mapWrap.dataset.mapSrc;
    if(!src) return;
    const frame = document.createElement('iframe');
    frame.title = 'FAME CAFÉ auf Google Maps';
    frame.loading = 'lazy';
    frame.referrerPolicy = 'no-referrer-when-downgrade';
    frame.src = src;
    const consent = document.getElementById('mapConsent');
    if(consent) consent.remove();
    mapWrap.appendChild(frame);
    frame.focus();
  });
}

/* ---- Hero Carousel --------------------------------------------------------
   Separate Assets halten die bestehende Seite stabil und machen den Hero
   unabhängig vom Coffee/Matcha-Ritual darunter. */
(function loadFameHeroCarousel(){
  if(!document.querySelector('link[data-fame-hero-carousel]')){
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'hero-carousel.css?v=fame-hero-20260917';
    css.dataset.fameHeroCarousel = 'true';
    document.head.appendChild(css);
  }
  if(!document.querySelector('script[data-fame-hero-carousel]')){
    const js = document.createElement('script');
    js.src = 'hero-carousel.js?v=fame-hero-20260917';
    js.dataset.fameHeroCarousel = 'true';
    document.body.appendChild(js);
  }
})();
