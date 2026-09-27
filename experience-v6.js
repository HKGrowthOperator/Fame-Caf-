/* FAME Experience Layer v6 — additive, reduced-motion safe */
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

  // page progress: tiny, brand-neutral and independent from the base header.
  const progress = document.createElement('div');
  progress.className = 'fame-scroll-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.appendChild(progress);

  let ticking = false;
  function frame(){
    ticking = false;
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    const p = Math.min(1, Math.max(0, window.scrollY / max));
    progress.style.transform = 'scaleX(' + p + ')';

    if(!reduceMotion.matches){
      document.querySelectorAll('[data-fame-parallax]').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if(rect.bottom < 0 || rect.top > window.innerHeight) return;
        const center = rect.top + rect.height / 2;
        const delta = (center - window.innerHeight / 2) / window.innerHeight;
        el.style.setProperty('--fame-parallax', (delta * -22).toFixed(1) + 'px');
      });
    }
  }
  function requestFrame(){
    if(ticking) return;
    ticking = true;
    requestAnimationFrame(frame);
  }
  addEventListener('scroll', requestFrame, {passive:true});
  addEventListener('resize', requestFrame);
  requestFrame();

  // Additional reveals don't interfere with the base .reveal observer.
  const items = [...document.querySelectorAll('.experience-reveal')];
  if('IntersectionObserver' in window && !reduceMotion.matches){
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if(entry.isIntersecting){
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, {threshold:.12, rootMargin:'0px 0px -5% 0px'});
    items.forEach((item) => io.observe(item));
  } else {
    items.forEach((item) => item.classList.add('is-visible'));
  }

  // Quiet 3D depth on product cards. No effect on touch devices.
  function bindTilt(){
    document.querySelectorAll('.tilt-card').forEach((card) => {
      if(card.dataset.tiltReady) return;
      card.dataset.tiltReady = '1';

      card.addEventListener('pointermove', (event) => {
        if(!finePointer.matches || reduceMotion.matches) return;
        const r = card.getBoundingClientRect();
        const x = (event.clientX - r.left) / r.width - .5;
        const y = (event.clientY - r.top) / r.height - .5;
        card.style.setProperty('--ry', (x * 3.2).toFixed(2) + 'deg');
        card.style.setProperty('--rx', (y * -2.8).toFixed(2) + 'deg');
      });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--ry', '0deg');
        card.style.setProperty('--rx', '0deg');
      });
    });
  }
  bindTilt();

  // Local café clock: useful micro-detail, no network call.
  const clock = document.querySelector('[data-fame-clock]');
  function updateClock(){
    if(!clock) return;
    const now = new Date();
    clock.textContent = new Intl.DateTimeFormat('de-DE', {
      hour:'2-digit', minute:'2-digit', second:'2-digit',
      timeZone:'Europe/Berlin'
    }).format(now);
    clock.setAttribute('datetime', now.toISOString());
  }
  updateClock();
  if(clock) setInterval(updateClock, 1000);

  // Optional mouse wheel support on the editorial reel when pointer is over it.
  const reel = document.querySelector('.fame-reel-track');
  if(reel && finePointer.matches){
    reel.addEventListener('wheel', (event) => {
      if(Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      if(reel.scrollWidth <= reel.clientWidth) return;
      const atStart = reel.scrollLeft <= 0 && event.deltaY < 0;
      const atEnd = Math.ceil(reel.scrollLeft + reel.clientWidth) >= reel.scrollWidth && event.deltaY > 0;
      if(atStart || atEnd) return;
      event.preventDefault();
      reel.scrollLeft += event.deltaY * .8;
    }, {passive:false});
  }

  reduceMotion.addEventListener?.('change', requestFrame);
})();
