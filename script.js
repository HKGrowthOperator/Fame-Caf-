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

// FAME social + location connections
const fameInstagramUrl = 'https://www.instagram.com/fame.cafe.gm/';
const fameMapsUrl = 'https://www.google.com/maps/search/?api=1&query=Gummersbacher+Stra%C3%9Fe+12%2C+51645+Gummersbach';

function connectFameProfiles(){
  const visitCopy = document.querySelector('#visit .visit-copy');

  if(visitCopy && !visitCopy.querySelector('.visit-connections')){
    const connections = document.createElement('div');
    connections.className = 'visit-connections reveal';
    connections.setAttribute('aria-label', 'FAME CAFÉ online und vor Ort');
    connections.innerHTML = `
      <a class="visit-connection visit-connection-instagram" href="${fameInstagramUrl}" target="_blank" rel="noopener noreferrer" aria-label="FAME CAFÉ auf Instagram öffnen">
        <span class="visit-connection-label">INSTAGRAM</span>
        <strong>@fame.cafe.gm</strong>
        <span class="visit-connection-detail">FAME online</span>
      </a>
      <a class="visit-connection visit-connection-maps" href="${fameMapsUrl}" target="_blank" rel="noopener noreferrer" aria-label="FAME CAFÉ Adresse in Google Maps öffnen">
        <span class="visit-connection-label">GOOGLE MAPS</span>
        <strong>Gummersbacher Straße 12</strong>
        <span class="visit-connection-detail">Route öffnen</span>
      </a>
    `;

    const visitNote = visitCopy.querySelector('.visit-note');
    if(visitNote){
      visitNote.insertAdjacentElement('beforebegin', connections);
    } else {
      visitCopy.appendChild(connections);
    }

    connections.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  }

  const footerLinks = document.querySelector('.footer-links');
  if(footerLinks && !footerLinks.querySelector('[data-fame-instagram]')){
    const instagramLink = document.createElement('a');
    instagramLink.href = fameInstagramUrl;
    instagramLink.target = '_blank';
    instagramLink.rel = 'noopener noreferrer';
    instagramLink.dataset.fameInstagram = 'true';
    instagramLink.textContent = 'Instagram';
    instagramLink.setAttribute('aria-label', 'FAME CAFÉ auf Instagram');
    footerLinks.appendChild(instagramLink);
  }

  const structuredData = document.querySelector('script[type="application/ld+json"]');
  if(structuredData){
    try {
      const data = JSON.parse(structuredData.textContent);
      data.sameAs = [...new Set([...(Array.isArray(data.sameAs) ? data.sameAs : []), fameInstagramUrl])];
      data.hasMap = fameMapsUrl;
      structuredData.textContent = JSON.stringify(data, null, 2);
    } catch (error) {
      // Keep the existing page functional if structured data ever becomes malformed.
    }
  }

  if(!document.getElementById('fameConnectionStyles')){
    const style = document.createElement('style');
    style.id = 'fameConnectionStyles';
    style.textContent = `
      .visit-connections{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:12px;
        width:min(680px,100%);
        margin:30px 0 24px;
      }
      .visit-connection{
        position:relative;
        display:flex;
        min-height:128px;
        flex-direction:column;
        justify-content:space-between;
        gap:16px;
        padding:20px 22px;
        border:1px solid rgba(22,22,20,.16);
        border-radius:22px;
        background:rgba(255,255,255,.34);
        color:inherit;
        text-decoration:none;
        transition:transform .25s ease,border-color .25s ease,background .25s ease;
        overflow:hidden;
      }
      .visit-connection::after{
        content:'';
        position:absolute;
        width:8px;
        height:8px;
        right:20px;
        top:20px;
        border-radius:50%;
        background:currentColor;
        opacity:.72;
      }
      .visit-connection:hover,
      .visit-connection:focus-visible{
        transform:translateY(-3px);
        border-color:rgba(22,22,20,.34);
        background:rgba(255,255,255,.6);
      }
      .visit-connection:focus-visible{
        outline:2px solid currentColor;
        outline-offset:3px;
      }
      .visit-connection-label,
      .visit-connection-detail{
        font-family:Manrope,sans-serif;
        font-size:10px;
        font-weight:600;
        line-height:1.2;
        letter-spacing:.15em;
        text-transform:uppercase;
      }
      .visit-connection strong{
        max-width:90%;
        font-family:Manrope,sans-serif;
        font-size:clamp(16px,1.45vw,20px);
        font-weight:500;
        line-height:1.25;
        letter-spacing:-.025em;
      }
      .visit-connection-detail{opacity:.58;}
      .visit-connection-instagram{
        background:linear-gradient(135deg,rgba(143,49,91,.09),rgba(255,255,255,.36));
      }
      .visit-connection-maps{
        background:linear-gradient(135deg,rgba(73,105,73,.08),rgba(255,255,255,.36));
      }
      @media (max-width:700px){
        .visit-connections{grid-template-columns:1fr;margin-top:24px;}
        .visit-connection{min-height:112px;border-radius:18px;padding:18px;}
      }
      @media (prefers-reduced-motion:reduce){
        .visit-connection{transition:none;}
      }
    `;
    document.head.appendChild(style);
  }
}

connectFameProfiles();
