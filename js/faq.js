/* ===================================================================
   FAQ.JS — tab switching (Shipping / Payments / Other), accordion
   expand-collapse, and a simple text search across all questions.
=================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  /* ---- Tabs ---- */
  const tabs = document.querySelectorAll('.faq-tab');
  const panels = document.querySelectorAll('.faq-panel');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      panels.forEach(p => p.classList.toggle('active', p.dataset.panel === tab.dataset.target));
    });
  });

  /* ---- Accordion ---- */
  document.querySelectorAll('.accordion-item').forEach(item => {
    const head = item.querySelector('.accordion-head');
    head.addEventListener('click', () => {
      const wasOpen = item.classList.contains('open');
      // close siblings within the same panel for a cleaner reading flow
      item.closest('.faq-panel')?.querySelectorAll('.accordion-item.open').forEach(open => {
        if (open !== item) open.classList.remove('open');
      });
      item.classList.toggle('open', !wasOpen);
    });
  });

  /* ---- Search across all questions ---- */
  const search = document.getElementById('faq-search');
  search?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();

    if (!q) {
      // restore to the active tab's normal state
      const activeTarget = document.querySelector('.faq-tab.active')?.dataset.target;
      panels.forEach(p => p.classList.toggle('active', p.dataset.panel === activeTarget));
      document.querySelectorAll('.accordion-item').forEach(item => item.style.display = 'block');
      return;
    }

    // when searching, look across every panel regardless of active tab
    panels.forEach(p => p.classList.add('active'));
    document.querySelectorAll('.accordion-item').forEach(item => {
      const text = item.textContent.toLowerCase();
      const match = text.includes(q);
      item.style.display = match ? 'block' : 'none';
      if (match) item.classList.add('open');
    });
  });
});
