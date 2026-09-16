const header = document.getElementById('siteHeader');
const hero = document.querySelector('.hero');
const cursor = document.querySelector('.cursor-orb');
const journey = document.getElementById('journey');
const progressBar = document.getElementById('journeyProgress');
const journeyDot = document.querySelector('.journey-dot');

const coffeeStepNo = document.getElementById('coffeeStepNo');
const coffeeStepTitle = document.getElementById('coffeeStepTitle');
const coffeeStepText = document.getElementById('coffeeStepText');
const matchaStepNo = document.getElementById('matchaStepNo');
const matchaStepTitle = document.getElementById('matchaStepTitle');
const matchaStepText = document.getElementById('matchaStepText');

const coffeeLiquid = document.querySelector('.coffee-liquid');
const milkStream = document.querySelector('.milk-stream');
const ice = document.querySelector('.glass-ice');
const coconut = document.querySelector('.glass-coconut');
const matcha = document.querySelector('.glass-matcha');
const lid = document.querySelector('.glass-lid');
const straw = document.querySelector('.glass-straw');

const coffeeSteps = [
  ['01','EXTRACT.','Der Shot setzt den Ton. Klar, konzentriert und auf den Punkt.'],
  ['02','FOAM.','Milch wird Textur. Fein, glossy und genau so ruhig wie sie sein soll.'],
  ['03','POUR.','Alles kommt zusammen. Espresso, Milch, Bewegung und Handwerk.'],
  ['04','ENJOY.','Keine Show mehr. Nur ein richtig guter Kaffee.']
];

const matchaSteps = [
  ['01','ICE.','Kalt starten. Große Eiswürfel. Klare Basis.'],
  ['02','COCONUT WATER.','Leicht, frisch und bewusst als zweite Ebene aufgebaut.'],
  ['03','MATCHA.','Das Grün kommt oben drauf und zieht langsam durch das Glas.'],
  ['04','LID + STRAW.','Deckel drauf. Strohhalm rein. Ready to go.']
];

function setJourneyStep(index) {
  const c = coffeeSteps[index];
  const m = matchaSteps[index];
  coffeeStepNo.textContent = c[0];
  coffeeStepTitle.textContent = c[1];
  coffeeStepText.textContent = c[2];
  matchaStepNo.textContent = m[0];
  matchaStepTitle.textContent = m[1];
  matchaStepText.textContent = m[2];

  // Coffee visual build
  coffeeLiquid.style.height = index === 0 ? '48%' : index === 1 ? '58%' : index >= 2 ? '72%' : '48%';
  milkStream.style.opacity = index >= 1 && index <= 2 ? '1' : '0';
  milkStream.style.height = index >= 1 && index <= 2 ? '150px' : '0';

  // Matcha visual build
  ice.style.opacity = index >= 0 ? '1' : '0';
  coconut.style.height = index >= 1 ? '62%' : '0%';
  matcha.style.height = index >= 2 ? '82%' : '0%';
  lid.style.opacity = index >= 3 ? '1' : '0';
  straw.style.opacity = index >= 3 ? '1' : '0';
  straw.style.transform = index >= 3 ? 'rotate(7deg) translateY(0)' : 'rotate(7deg) translateY(-40px)';
}

function updateScroll() {
  const y = window.scrollY;
  header.classList.toggle('scrolled', y > 40);

  if (!journey) return;
  const rect = journey.getBoundingClientRect();
  const scrollable = journey.offsetHeight - window.innerHeight;
  const passed = Math.min(Math.max(-rect.top, 0), scrollable);
  const progress = scrollable > 0 ? passed / scrollable : 0;

  if (rect.top <= 0 && rect.bottom >= window.innerHeight) {
    progressBar.style.height = `${progress * 100}%`;
    journeyDot.style.top = `${progress * 100}%`;
    const index = Math.min(3, Math.floor(progress * 4));
    setJourneyStep(index);
  }
}

window.addEventListener('scroll', updateScroll, { passive: true });
window.addEventListener('resize', updateScroll);
window.addEventListener('load', () => {
  hero.classList.add('loaded');
  setJourneyStep(0);
  updateScroll();
});

document.addEventListener('mousemove', (event) => {
  if (!cursor) return;
  cursor.style.left = `${event.clientX}px`;
  cursor.style.top = `${event.clientY}px`;
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add('in-view');
  });
}, { threshold: .16 });

document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
