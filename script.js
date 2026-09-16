const header = document.getElementById('siteHeader');
const heroImages = [...document.querySelectorAll('.hero-image')];
const ritual = document.getElementById('ritual');
const axisProgress = document.getElementById('axisProgress');
const axisDisc = document.getElementById('axisDisc');
const ritualPhotos = [...document.querySelectorAll('.ritual-photo')];

const coffeeNo = document.getElementById('coffeeNo');
const coffeeTitle = document.getElementById('coffeeTitle');
const coffeeText = document.getElementById('coffeeText');
const matchaNo = document.getElementById('matchaNo');
const matchaTitle = document.getElementById('matchaTitle');
const matchaText = document.getElementById('matchaText');

const coffeeSteps = [
  ['01','GRIND.','Frisch gemahlen. Exakt dosiert. Der Anfang von richtig gutem Kaffee.'],
  ['02','EXTRACT.','Druck, Temperatur und Zeit stimmen zusammen. Der Espresso kommt klar und konzentriert.'],
  ['03','TEXTURE.','Milch wird fein, glossy und weich. Nicht zu viel Schaum, sondern genau die richtige Textur.'],
  ['04','POUR.','Espresso und Milch treffen zusammen. Ruhige Bewegung, saubere Balance, fertig.']
];

const matchaSteps = [
  ['01','ICE.','Große Eiswürfel zuerst. Kalt, klar und bereit für die nächsten Schichten.'],
  ['02','COCONUT.','Eine leichte, frische Basis, damit der Matcha im Mittelpunkt bleibt.'],
  ['03','MATCHA.','Das kräftige Grün kommt langsam dazu und zieht sichtbar durch das Glas.'],
  ['04','STRAW.','Deckel drauf, Strohhalm rein. Der letzte Schritt, bevor der Drink an die Bar geht.']
];

const phases = ['START','BUILD','BUILD','FINISH'];
let currentStep = -1;
let ticking = false;

function setStep(index){
  if(index === currentStep) return;
  currentStep = index;

  const c = coffeeSteps[index];
  const m = matchaSteps[index];

  coffeeNo.textContent = c[0];
  coffeeTitle.textContent = c[1];
  coffeeText.textContent = c[2];
  matchaNo.textContent = m[0];
  matchaTitle.textContent = m[1];
  matchaText.textContent = m[2];

  if(axisDisc){
    axisDisc.dataset.step = String(index + 1).padStart(2,'0');
    axisDisc.dataset.phase = phases[index];
  }

  if(ritual){
    ritual.dataset.step = String(index + 1);
  }
}

function update(){
  ticking = false;
  const y = window.scrollY;
  header.classList.toggle('scrolled', y > 36);

  // V3 hero motion: keep the photography full-bleed at all times.
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

      const idx = Math.min(3, Math.floor(Math.min(p, .999999) * 4));
      setStep(idx);

      if(ritualPhotos[0]){
        ritualPhotos[0].style.transform = `scale(${1.055 + p * .012})`;
        ritualPhotos[0].style.filter = `brightness(${.88 + idx * .018})`;
      }

      if(ritualPhotos[1]){
        ritualPhotos[1].style.transform = `scale(${1.055 + p * .014})`;
        ritualPhotos[1].style.filter = `saturate(${1 + idx * .045}) brightness(${.92 + idx * .012})`;
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
window.addEventListener('load', () => {
  setStep(0);
  update();
});

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if(entry.isIntersecting) entry.target.classList.add('in-view');
  });
}, {threshold:.12, rootMargin:'0px 0px -4% 0px'});

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
