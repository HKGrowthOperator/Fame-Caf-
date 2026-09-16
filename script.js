const header = document.getElementById('siteHeader');
const heroImages = [...document.querySelectorAll('.hero-image')];
const ritual = document.getElementById('ritual');
const axisProgress = document.getElementById('axisProgress');
const axisDisc = document.getElementById('axisDisc');
const ritualPhotos = [...document.querySelectorAll('.ritual-photo')];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const coffeeNo = document.getElementById('coffeeNo');
const coffeeTitle = document.getElementById('coffeeTitle');
const coffeeText = document.getElementById('coffeeText');
const matchaNo = document.getElementById('matchaNo');
const matchaTitle = document.getElementById('matchaTitle');
const matchaText = document.getElementById('matchaText');

const coffeeSteps = [
  ['01','BEANS.','Der Coffee-Moment beginnt mit Materialität, Ruhe und Fokus auf das Produkt.'],
  ['02','GRIND.','Der nächste Schritt wird sichtbar, ohne die Seite mit technischer Erklärung zu überladen.'],
  ['03','DOSE.','Präzision als Teil der Bildsprache — kurz, ruhig und kontrolliert.'],
  ['04','EXTRACT.','Bewegung, Textur und Kontrast tragen die Coffee-Welt durch den Scroll.'],
  ['05','POUR.','Der Übergang bleibt weich und editorial statt wie eine technische Demo.'],
  ['06','SERVE.','Der Abschluss gehört dem Produkt und dem Moment an der Bar.']
];

const matchaSteps = [
  ['01','FOAM.','Eine visuelle Build-Sequenz, Schicht für Schicht.'],
  ['02','ICE.','Kühle Textur und klare Formen bringen Bewegung in das Glas.'],
  ['03','LAYER.','Eine neutrale visuelle Schicht ersetzt unbestätigte Zutatenangaben.'],
  ['04','MATCHA.','Das Grün übernimmt den Frame und macht die Produktwelt sofort erkennbar.'],
  ['05','LID.','Der Build schließt sich, ohne daraus eine erfundene Rezeptur zu machen.'],
  ['06','STRAW.','Der letzte visuelle Schritt. Danach gehört der Fokus wieder dem fertigen Moment.']
];

const phases = ['START','BUILD','BUILD','BUILD','FINISH','READY'];
let currentStep = -1;
let ticking = false;

function setStep(index){
  const safeIndex = Math.max(0, Math.min(coffeeSteps.length - 1, index));
  if(safeIndex === currentStep) return;
  currentStep = safeIndex;

  const c = coffeeSteps[safeIndex];
  const m = matchaSteps[safeIndex];

  if(coffeeNo) coffeeNo.textContent = c[0];
  if(coffeeTitle) coffeeTitle.textContent = c[1];
  if(coffeeText) coffeeText.textContent = c[2];
  if(matchaNo) matchaNo.textContent = m[0];
  if(matchaTitle) matchaTitle.textContent = m[1];
  if(matchaText) matchaText.textContent = m[2];

  if(axisDisc){
    axisDisc.dataset.step = String(safeIndex + 1).padStart(2,'0');
    axisDisc.dataset.phase = phases[safeIndex];
  }

  if(ritual){
    ritual.dataset.step = String(safeIndex + 1);
  }
}

function update(){
  ticking = false;
  const y = window.scrollY;
  if(header) header.classList.toggle('scrolled', y > 36);

  if(reduceMotion.matches){
    setStep(0);
    return;
  }

  const heroProgress = Math.min(1, y / Math.max(1, window.innerHeight));
  heroImages.forEach((img, i) => {
    const scale = 1.035 + heroProgress * (i === 0 ? .018 : .022);
    img.style.transform = `scale(${scale})`;
  });

  if(ritual){
    const rect = ritual.getBoundingClientRect();
    const total = Math.max(ritual.offsetHeight - window.innerHeight, 1);
    const passed = Math.min(Math.max(-rect.top, 0), total);
    const p = passed / total;

    if(rect.top <= window.innerHeight && rect.bottom >= 0){
      if(axisProgress) axisProgress.style.height = `${p * 100}%`;
      if(axisDisc) axisDisc.style.top = `${8 + p * 84}%`;

      const stepCount = coffeeSteps.length;
      const idx = Math.min(stepCount - 1, Math.floor(Math.min(p, .999999) * stepCount));
      setStep(idx);

      if(ritualPhotos[0]){
        ritualPhotos[0].style.transform = `scale(${1.055 + p * .012})`;
        ritualPhotos[0].style.filter = `brightness(${.88 + idx * .012})`;
      }

      if(ritualPhotos[1]){
        ritualPhotos[1].style.transform = `scale(${1.055 + p * .014})`;
        ritualPhotos[1].style.filter = `saturate(${1 + idx * .03}) brightness(${.92 + idx * .009})`;
      }
    }
  }
}

function requestTick(){
  if(!ticking){
    ticking = true;
    requestAnimationFrame(update);
  }
}

window.addEventListener('scroll', requestTick, {passive:true});
window.addEventListener('resize', requestTick);
reduceMotion.addEventListener?.('change', requestTick);
window.addEventListener('load', () => {
  setStep(0);
  update();
});

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if(entry.isIntersecting){
      entry.target.classList.add('in-view');
      observer.unobserve(entry.target);
    }
  });
}, {threshold:.12, rootMargin:'0px 0px -4% 0px'});

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
