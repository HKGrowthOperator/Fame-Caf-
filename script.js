const header = document.getElementById('siteHeader');
const heroImages = [...document.querySelectorAll('.hero-image')];
const ritual = document.getElementById('ritual');
const axisProgress = document.getElementById('axisProgress');
const axisDisc = document.getElementById('axisDisc');
const stageToast = document.getElementById('stageToast');
const ritualPhotos = [...document.querySelectorAll('.ritual-photo')];

const coffeeNo = document.getElementById('coffeeNo');
const coffeeTitle = document.getElementById('coffeeTitle');
const coffeeText = document.getElementById('coffeeText');
const matchaNo = document.getElementById('matchaNo');
const matchaTitle = document.getElementById('matchaTitle');
const matchaText = document.getElementById('matchaText');

const coffeeSteps = [
  ['01','GRIND.','Good coffee starts before the first drop. Fresh grind. Exact dose. No shortcuts.'],
  ['02','EXTRACT.','Pressure, temperature and time. The espresso lands clean and concentrated.'],
  ['03','TEXTURE.','Milk turns glossy and soft. No giant bubbles. No heavy foam. Just texture.'],
  ['04','POUR.','The final movement brings it together. Espresso, milk and control.']
];
const matchaSteps = [
  ['01','ICE.','Big cubes first. Cold, clear and ready for layers.'],
  ['02','COCONUT.','A bright base. Light, fresh and clean enough to let the matcha lead.'],
  ['03','MATCHA.','Vibrant green poured slowly so the layers stay visible for a moment.'],
  ['04','STRAW.','Lid on. Straw in. One final detail and it is ready to leave the bar.']
];

let currentStep = -1;
let ticking = false;

function setStep(index){
  if(index === currentStep) return;
  currentStep = index;
  const c = coffeeSteps[index];
  const m = matchaSteps[index];
  coffeeNo.textContent = c[0]; coffeeTitle.textContent = c[1]; coffeeText.textContent = c[2];
  matchaNo.textContent = m[0]; matchaTitle.textContent = m[1]; matchaText.textContent = m[2];
  stageToast.textContent = `${String(index+1).padStart(2,'0')} / ${index === 0 ? 'START' : index === 3 ? 'FINISH' : 'BUILD'}`;
  document.documentElement.style.setProperty('--ritual-step', index);
}

function update(){
  ticking = false;
  const y = window.scrollY;
  header.classList.toggle('scrolled', y > 44);

  const heroProgress = Math.min(1, y / Math.max(1, window.innerHeight));
  heroImages.forEach((img, i) => {
    const dir = i === 0 ? -1 : 1;
    img.style.transform = `scale(${1.04 + heroProgress * .025}) translate3d(0, ${heroProgress * dir * 12}px, 0)`;
  });

  if(ritual){
    const rect = ritual.getBoundingClientRect();
    const total = ritual.offsetHeight - window.innerHeight;
    const passed = Math.min(Math.max(-rect.top,0), Math.max(total,1));
    const p = passed / Math.max(total,1);
    if(rect.top <= 0 && rect.bottom >= window.innerHeight){
      axisProgress.style.height = `${p*100}%`;
      axisDisc.style.top = `${8 + p*84}%`;
      const idx = Math.min(3, Math.floor(p*4));
      setStep(idx);
      ritualPhotos[0].style.transform = `scale(${1.07 - p*.025}) translate3d(0, ${p*-16}px,0)`;
      ritualPhotos[1].style.transform = `scale(${1.07 - p*.02}) translate3d(0, ${p*16}px,0)`;
      const coffeeBrightness = .86 + idx*.03;
      const matchaSat = 1 + idx*.08;
      ritualPhotos[0].style.filter = `brightness(${coffeeBrightness})`;
      ritualPhotos[1].style.filter = `saturate(${matchaSat}) brightness(${.9 + idx*.02})`;
    }
  }
}

function requestTick(){ if(!ticking){ ticking = true; requestAnimationFrame(update); } }
window.addEventListener('scroll', requestTick, {passive:true});
window.addEventListener('resize', requestTick);
window.addEventListener('load', () => { setStep(0); update(); });

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => { if(entry.isIntersecting) entry.target.classList.add('in-view'); });
}, {threshold:.14, rootMargin:'0px 0px -5% 0px'});
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
