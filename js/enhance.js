/* ENHANCE.JS — scroll-to-top button, offer filters, copy-to-clipboard promo codes */
document.addEventListener('DOMContentLoaded', () => {
  /* Scroll to the top without leaving the current page. */
  const scrollTop = document.createElement('button');
  scrollTop.type = 'button';
  scrollTop.className = 'scroll-top';
  scrollTop.setAttribute('aria-label', 'Scroll to top');
  scrollTop.title = 'Scroll to top';
  scrollTop.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
  scrollTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  });
  document.body.appendChild(scrollTop);
  const updateScrollTop = () => { scrollTop.hidden = window.scrollY <= 300; };
  window.addEventListener('scroll', updateScrollTop, { passive: true });
  updateScrollTop();

  /* Offer filters */
  const chips = document.querySelectorAll('.filter-chip[data-offer]');
  const cards = document.querySelectorAll('.offer-card[data-type]');
  chips.forEach(chip => chip.addEventListener('click', () => {
    const t = chip.dataset.offer;
    cards.forEach(c => c.classList.toggle('hide', t !== 'all' && !c.dataset.type.split(' ').includes(t)));
  }));

  /* Copy promo codes */
  document.querySelectorAll('.code-chip').forEach(chip => chip.addEventListener('click', () => {
    const code = chip.dataset.code;
    const done = () => { const s = chip.querySelector('small'); const old = s.textContent; chip.classList.add('copied'); s.textContent = 'Copied!'; setTimeout(()=>{chip.classList.remove('copied'); s.textContent = old;}, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(code).then(done, done); else done();
  }));
});

/* Gift card live preview */
document.addEventListener('DOMContentLoaded', () => {
  const src = document.getElementById('gc-amount-preview'), dst = document.getElementById('gc-live-amt');
  if (!src || !dst) return;
  new MutationObserver(() => { dst.textContent = src.textContent; }).observe(src, { childList:true, characterData:true, subtree:true });
  const to = document.getElementById('gc-recipient-name'), toDst = document.getElementById('gc-live-to');
  to?.addEventListener('input', () => { toDst.textContent = to.value ? 'For ' + to.value : 'For someone special'; });
});

/* =================== FEATURES PAGE INTERACTIONS =================== */
document.addEventListener('DOMContentLoaded', () => {
  /* Flip cards (click/tap/keyboard) */
  document.querySelectorAll('.flip-card').forEach(card => {
    const btn = card.querySelector('.flip-inner');
    btn.addEventListener('click', () => {
      const on = card.classList.toggle('flipped');
      btn.setAttribute('aria-pressed', on);
    });
  });

  /* Rewards calculator */
  const range = document.getElementById('calc-range');
  if (range) {
    const f = n => '₱' + Math.round(n).toLocaleString('en-PH');
    const $ = id => document.getElementById(id);
    const update = () => {
      const monthly = +range.value, yearly = monthly * 12;
      let tier = 'Insider', mult = 1, next = 20000, nextName = 'VIB';
      if (yearly >= 50000) { tier = 'Rouge'; mult = 1.5; next = null; }
      else if (yearly >= 20000) { tier = 'VIB'; mult = 1.25; next = 50000; nextName = 'Rouge'; }
      const pts = yearly * mult;
      $('calc-spend').textContent = f(monthly);
      $('calc-year').textContent = f(yearly);
      $('calc-points').textContent = Math.round(pts).toLocaleString('en-PH');
      $('calc-cash').textContent = f(pts / 10);
      $('calc-tier').textContent = tier;
      $('calc-next').textContent = next ? f(next - yearly) + ' more to reach ' + nextName : 'Top tier unlocked!';
      $('calc-fill').style.width = Math.min(100, yearly / 50000 * 100) + '%';
    };
    range.addEventListener('input', update); update();
  }

  /* Tabs */
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === tab.dataset.tab));
  }));

  /* Lightbox */
  const items = [...document.querySelectorAll('.gallery-item[data-cap]')];
  if (items.length) {
    const lb = document.createElement('div');
    lb.className = 'lb';
    lb.innerHTML = '<button class="lb-x" aria-label="Close">×</button><button class="lb-prev" aria-label="Previous">‹</button><img alt=""><p></p><button class="lb-next" aria-label="Next">›</button>';
    document.body.appendChild(lb);
    let i = 0;
    const show = n => { i = (n + items.length) % items.length; const it = items[i]; lb.querySelector('img').src = it.querySelector('img').src; lb.querySelector('img').alt = it.querySelector('img').alt; lb.querySelector('p').textContent = it.dataset.cap + '  (' + (i+1) + '/' + items.length + ')'; };
    const open = n => { show(n); lb.classList.add('open'); document.body.style.overflow = 'hidden'; };
    const close = () => { lb.classList.remove('open'); document.body.style.overflow = ''; };
    items.forEach((it, n) => { it.addEventListener('click', () => open(n)); it.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(n); } }); });
    lb.querySelector('.lb-x').onclick = close;
    lb.querySelector('.lb-prev').onclick = () => show(i - 1);
    lb.querySelector('.lb-next').onclick = () => show(i + 1);
    lb.addEventListener('click', e => { if (e.target === lb) close(); });
    document.addEventListener('keydown', e => { if (!lb.classList.contains('open')) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') show(i - 1); if (e.key === 'ArrowRight') show(i + 1); });
  }

  /* Video sound toggle */
  const vid = document.getElementById('story-video'), vbtn = document.getElementById('vid-sound');
  vbtn?.addEventListener('click', () => { vid.muted = !vid.muted; vbtn.textContent = vid.muted ? '🔇 Sound off' : '🔊 Sound on'; });

  /* Animated counters */
  const counters = document.querySelectorAll('.count');
  if (counters.length) {
    const run = el => {
      const target = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0), suf = el.dataset.suffix || '', t0 = performance.now(), dur = 1400;
      const step = t => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = (target * e).toFixed(dec) + suf; if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    };
    const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { run(en.target); io.unobserve(en.target); } }), { threshold: .4 });
    counters.forEach(c => io.observe(c));
  }

  /* Accordion */
  document.querySelectorAll('.fx-acc .acc-item').forEach(item => {
    const a = item.querySelector('.acc-a');
    if (item.classList.contains('open')) a.style.maxHeight = a.scrollHeight + 'px';
    item.querySelector('.acc-q').addEventListener('click', () => {
      const open = item.classList.toggle('open');
      a.style.maxHeight = open ? a.scrollHeight + 'px' : 0;
    });
  });
});
