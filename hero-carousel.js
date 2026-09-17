const fameHero = document.querySelector('.hero');
const fameReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const fameHeroSlides = [
  {
    leftImage: 'https://images.unsplash.com/photo-1762657440624-d0b5cfae5bac?auto=format&fit=crop&fm=jpg&q=88&w=2200',
    rightImage: 'https://images.unsplash.com/photo-1775846933630-3c1531299e5a?auto=format&fit=crop&fm=jpg&q=88&w=2200',
    leftLabel: 'SPECIALTY COFFEE', leftCopy: 'Roast · Texture · Craft',
    rightLabel: 'MATCHA', rightCopy: 'Fresh · Iced · FAME'
  },
  {
    leftImage: 'https://images.unsplash.com/photo-1490324028530-3df5a9af0637?auto=format&fit=crop&fm=jpg&q=88&w=2200',
    rightImage: 'https://images.unsplash.com/photo-1770494347810-5aa9e689f13e?auto=format&fit=crop&fm=jpg&q=88&w=2200',
    leftLabel: 'AÇAÍ', leftCopy: 'Fruit · Bowl · Crunch',
    rightLabel: 'COFFEE', rightCopy: 'Barista · Craft · FAME'
  },
  {
    leftImage: 'https://images.unsplash.com/photo-1751563721808-3b81940b88f7?auto=format&fit=crop&fm=jpg&q=88&w=2200',
    rightImage: 'https://images.unsplash.com/photo-1520251715762-b726a31d6149?auto=format&fit=crop&fm=jpg&q=88&w=2200',
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
    left.style.backgroundImage = `url("${slide.leftImage}")`;

    const right = document.createElement('div');
    right.className = 'hero-carousel-panel';
    right.style.backgroundImage = `url("${slide.rightImage}")`;

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
      image.src = src;
    });
  });

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
