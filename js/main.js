/* ===================================================================
   MAIN.JS — sitewide navigation, mobile menu, search toggle,
   scroll-reveal animations, and the hero headline reveal.
=================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- Mobile nav ---------- */
  const hamburger = document.querySelector('.hamburger');
  const mobileNav = document.querySelector('.mobile-nav');
  const mobileClose = document.querySelector('.mobile-nav-close');
  const scrim = document.querySelector('.scrim');

  function openMobileNav(){
    mobileNav?.classList.add('open');
    scrim?.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
  function closeMobileNav(){
    mobileNav?.classList.remove('open');
    scrim?.classList.remove('show');
    document.body.style.overflow = '';
  }
  hamburger?.addEventListener('click', openMobileNav);
  mobileClose?.addEventListener('click', closeMobileNav);
  scrim?.addEventListener('click', closeMobileNav);

  /* ---------- Search panel toggle ---------- */
  const searchToggle = document.querySelector('.search-toggle');
  const searchPanel = document.querySelector('.search-panel');
  searchToggle?.addEventListener('click', () => {
    searchPanel?.classList.toggle('open');
    if (searchPanel?.classList.contains('open')) {
      searchPanel.querySelector('input')?.focus();
    }
  });

  /* ---------- Header search — searches products AND brands ----------
     On products.html it filters the grid in place; on every other page
     it navigates to products.html?q=<term>, which products.js reads
     on load to pre-fill the search box and the results. ---------- */
  const headerSearchForm = document.getElementById('header-search-form');
  const headerSearchInput = document.getElementById('header-search-input');
  const onShopPage = !!document.getElementById('product-grid');
  const localSearchInput = document.getElementById('product-search');
  if (onShopPage && localSearchInput && headerSearchInput) {
    // Keep the header search box and the on-page search box in sync.
    const syncFromLocal = () => { headerSearchInput.value = localSearchInput.value; };
    localSearchInput.addEventListener('input', syncFromLocal);
    const urlParams = new URLSearchParams(window.location.search);
    const preTerm = urlParams.get('brand') || urlParams.get('q') || '';
    if (preTerm) headerSearchInput.value = preTerm;
  }
  headerSearchForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const term = (headerSearchInput?.value || '').trim();
    if (onShopPage && localSearchInput) {
      localSearchInput.value = term;
      localSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchPanel?.classList.remove('open');
    } else {
      window.location.href = 'products.html' + (term ? `?q=${encodeURIComponent(term)}` : '');
    }
  });

  /* ---------- Scroll reveal (single orchestrated fade/slide) ---------- */
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in'));
  }

  /* ---------- Hero headline line-by-line reveal ---------- */
  const heroH1 = document.querySelector('.hero-copy h1');
  if (heroH1 && !heroH1.dataset.split) {
    heroH1.dataset.split = '1';
    const html = heroH1.innerHTML;
    const lines = html.split('<br>');
    heroH1.innerHTML = lines.map((line, i) =>
      `<span class="line-in" style="animation-delay:${i * 0.12 + 0.1}s">${line}</span>`
    ).join('');
  }

  /* ---------- Header shadow on scroll ---------- */
  const header = document.querySelector('.site-header');
  if (header) {
    const onScroll = () => {
      header.style.boxShadow = window.scrollY > 12 ? '0 6px 20px -14px rgba(23,19,16,.25)' : 'none';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Accordion-style jump list smooth scroll offset already handled by scroll-behavior ---------- */

  /* ---------- Generic filter-chip active toggle (offers.html, and any chip without a data-category handler) ---------- */
  document.querySelectorAll('.filter-chip:not([data-category])').forEach(chip => {
    chip.addEventListener('click', () => {
      const group = chip.parentElement;
      group.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });

  /* ---------- A–Z brand filter (brands.html) ---------- */
  const azBar = document.querySelector('.az-bar');
  if (azBar) {
    const letters = azBar.querySelectorAll('button');
    const tiles = document.querySelectorAll('.brand-tile');
    letters.forEach(btn => {
      btn.addEventListener('click', () => {
        const letter = btn.textContent.trim().toUpperCase();
        const alreadyActive = btn.classList.contains('active');
        letters.forEach(b => b.classList.remove('active'));
        if (alreadyActive) {
          tiles.forEach(t => t.style.display = 'flex');
          return;
        }
        btn.classList.add('active');
        let anyVisible = false;
        tiles.forEach(t => {
          const name = (t.dataset.brand || t.querySelector('span')?.textContent || t.textContent).trim();
          const match = name.toUpperCase().startsWith(letter);
          t.style.display = match ? 'flex' : 'none';
          if (match) anyVisible = true;
        });
        let emptyMsg = document.getElementById('az-empty-msg');
        const grid = document.getElementById('brand-grid');
        if (!anyVisible && grid) {
          if (!emptyMsg) {
            emptyMsg = document.createElement('p');
            emptyMsg.id = 'az-empty-msg';
            emptyMsg.style.cssText = 'grid-column:1/-1;text-align:center;color:var(--taupe);padding:40px 0;';
            grid.appendChild(emptyMsg);
          }
          emptyMsg.textContent = `No brands starting with "${letter}" yet — try another letter.`;
          emptyMsg.style.display = 'block';
        } else if (emptyMsg) {
          emptyMsg.style.display = 'none';
        }
      });
    });
  }
});
