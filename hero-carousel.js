const fameHero = document.querySelector('.hero');
const fameReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const fameHeroSlides = [
  {
    leftImage: 'assets/photos/u-1762657440624-d0b5cfae5bac.jpg',
    rightImage: 'assets/photos/u-1775846933630-3c1531299e5a.jpg',
    leftLabel: 'SPECIALTY COFFEE', leftCopy: 'Roast · Texture · Craft',
    rightLabel: 'MATCHA', rightCopy: 'Fresh · Iced · FAME'
  },
  {
    leftImage: 'assets/photos/u-1490324028530-3df5a9af0637.jpg',
    rightImage: 'assets/photos/u-1770494347810-5aa9e689f13e.jpg',
    leftLabel: 'AÇAÍ', leftCopy: 'Fruit · Bowl · Crunch',
    rightLabel: 'COFFEE', rightCopy: 'Barista · Craft · FAME'
  },
  {
    leftImage: 'assets/photos/u-1751563721808-3b81940b88f7.jpg',
    rightImage: 'assets/photos/u-1520251715762-b726a31d6149.jpg',
    leftLabel: 'MATCHA', leftCopy: 'Cold · Green · Smooth',
    rightLabel: 'AÇAÍ', rightCopy: 'Berry · Fresh · FAME'
  }
];

let fameHeroIndex = 0;
let fameHeroTimer = null;

function fameShowHeroSlide(index, restart = false){
  if(!fameHero) return;
  fameHeroIndex = (index + fameHeroSlides.length) % fameHeroSlides.length;

  fameHero.querySelectorAll('.hero-carousel-slide').forEach((slide, idx) => {
    slide.classList.toggle('is-active', idx === fameHeroIndex);
  });

  fameHero.querySelectorAll('.hero-dot').forEach((dot, idx) => {
    const active = idx === fameHeroIndex;
    dot.classList.toggle('is-active', active);
    dot.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  const data = fameHeroSlides[fameHeroIndex];
  const leftMeta = fameHero.querySelector('.hero-meta-left');
  const rightMeta = fameHero.querySelector('.hero-meta-right');
  if(leftMeta){
    leftMeta.querySelector('span').textContent = data.leftLabel;
    leftMeta.querySelector('p').textContent = data.leftCopy;
  }
  if(rightMeta){
    rightMeta.querySelector('span').textContent = data.rightLabel;
    rightMeta.querySelector('p').textContent = data.rightCopy;
  }

  if(restart) fameStartHeroAutoplay();
}

function fameStartHeroAutoplay(){
  if(fameHeroTimer) clearInterval(fameHeroTimer);
  fameHeroTimer = null;
  if(!fameHero || fameReduceMotion.matches) return;
  fameHeroTimer = window.setInterval(() => fameShowHeroSlide(fameHeroIndex + 1), 2500);
}

/* Auf dem Handy reichen 1400 px Breite bei geringerer Qualität; die Originale
   (2200 px, q=88) sind für große Bildschirme und kosten mobil das Mehrfache an
   Daten. 12 solcher Bilder laden beim Start gleichzeitig. */
const fameSmallScreen = window.matchMedia('(max-width: 780px)');
const fameHeroImage = url => fameSmallScreen.matches ? url.replace(/\.jpg$/, '-m.jpg') : url;

function fameInstallHeroCarousel(){
  if(!fameHero || fameHero.querySelector('.hero-carousel')) return;

  const carousel = document.createElement('div');
  carousel.className = 'hero-carousel';
  carousel.setAttribute('aria-hidden', 'true');

  fameHeroSlides.forEach((slide, index) => {
    const item = document.createElement('div');
    item.className = `hero-carousel-slide${index === 0 ? ' is-active' : ''}`;

    const left = document.createElement('div');
    left.className = 'hero-carousel-panel';
    left.style.backgroundImage = `url("${fameHeroImage(slide.leftImage)}")`;

    const right = document.createElement('div');
    right.className = 'hero-carousel-panel';
    right.style.backgroundImage = `url("${fameHeroImage(slide.rightImage)}")`;

    item.append(left, right);
    carousel.appendChild(item);
  });

  fameHero.prepend(carousel);

  const dots = document.createElement('div');
  dots.className = 'hero-dots';
  dots.setAttribute('role', 'tablist');
  dots.setAttribute('aria-label', 'Hero Slides');

  fameHeroSlides.forEach((_, index) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = `hero-dot${index === 0 ? ' is-active' : ''}`;
    dot.setAttribute('aria-label', `Slide ${index + 1}`);
    dot.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
    dot.addEventListener('click', () => fameShowHeroSlide(index, true));
    dots.appendChild(dot);
  });
  fameHero.appendChild(dots);

  fameHeroSlides.forEach(slide => {
    [slide.leftImage, slide.rightImage].forEach(src => {
      const image = new Image();
      image.decoding = 'async';
      image.src = fameHeroImage(src);   // dieselbe Größe wie der Hintergrund, sonst lädt jedes Bild zweimal
    });
  });

  // Erst jetzt dürfen die statischen Hero-Hälften verschwinden: Ab hier
  // steht das Karussell wirklich im DOM.
  fameHero.classList.add('has-carousel');

  fameShowHeroSlide(0);
  fameStartHeroAutoplay();
}

document.addEventListener('visibilitychange', () => {
  if(document.hidden){
    if(fameHeroTimer) clearInterval(fameHeroTimer);
    fameHeroTimer = null;
  } else {
    fameStartHeroAutoplay();
  }
});

fameReduceMotion.addEventListener?.('change', fameStartHeroAutoplay);
fameInstallHeroCarousel();
