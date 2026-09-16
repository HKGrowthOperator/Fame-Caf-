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
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
function forceTopOnFreshLoad(){
  if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search);
  window.scrollTo({top:0,left:0,behavior:'auto'});
}
window.addEventListener('pageshow', () => requestAnimationFrame(forceTopOnFreshLoad), {once:true});

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
