/* ===================================================================
   PRODUCTS.JS — GET data/products.json and render product cards on:
   index.html (#featured-grid), products.html (#product-grid + filters),
   product-detail.html (#product-detail + #related-grid), cart.html (#featured-grid)
=================================================================== */

(function () {
  let PRODUCTS = [];

  async function loadProducts() {
    if (PRODUCTS.length) return PRODUCTS;
    PRODUCTS = await window.Api.products();   // /api/products (SQLite) or data/products.json fallback
    return PRODUCTS;
  }

  function fmt(n) {
    return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function stars(rating) {
    const full = Math.round(rating);
    return '★'.repeat(full) + '☆'.repeat(5 - full);
  }

  function availInfo(p) {
    const a = (p.availability || 'In Stock').toLowerCase();
    if (a.includes('out')) return { cls: 'out', label: 'Out of Stock', note: 'Inquire to be notified' };
    if (a.includes('low')) return { cls: 'low', label: 'Low Stock', note: (p.stock > 0 ? 'Only ' + p.stock + ' left' : 'Only a few left') };
    return { cls: 'in', label: 'In Stock', note: 'Ready to ship' };
  }

  function cardHTML(p) {
    const av = availInfo(p);
    const badge = av.cls === 'low'
      ? '<span class="badge">Low Stock</span>'
      : (p.id === 'p002' || p.id === 'p005' || p.id === 'p008' ? '<span class="badge">Bestseller</span>' : '');
    const disabled = av.cls === 'out' ? 'disabled' : '';
    return `
    <div class="product-card" data-id="${p.id}" data-category="${p.category}">
      <a href="product-detail.html?id=${p.id}" class="thumb">
        ${badge}
        <img src="${p.image}" alt="${p.name}" loading="lazy">
      </a>
      <div class="body">
        <span class="brand">${p.brand}</span>
        <h3><a href="product-detail.html?id=${p.id}">${p.name}</a></h3>
        <p class="product-desc">${p.description}</p>
        <div class="stars">${stars(p.rating)} <span style="color:var(--taupe);font-size:.75rem;">(${p.reviews})</span></div>
        <div class="price-row">
          <span class="price">${fmt(p.price)}</span>
        </div>
        <div class="stock ${av.cls}"><span class="dot"></span><strong>${av.label}</strong><span class="stock-note">· ${av.note}</span></div>
        <div class="cta-row">
          <button type="button" class="cta cta-order" data-order="${p.id}" ${disabled}>Order Now</button>
          <button type="button" class="cta cta-cart add-btn" data-add="${p.id}" ${disabled}>Add to Cart</button>
        </div>
        <div class="cta-links">
          <a href="product-detail.html?id=${p.id}" class="cta-link">View Details</a>
          <button type="button" class="cta-link" data-inquire="${p.id}">Inquire Now</button>
          <button type="button" class="cta-link" data-learn="${p.id}" aria-haspopup="dialog">Learn More</button>
        </div>
      </div>
    </div>`;
  }

  function wireAddButtons() { /* handled by delegated listeners below */ }

  /* ---------- Short product explanations, shown without navigation ---------- */
  const PRODUCT_DETAILS = {
    "p001": "A cushion foundation combines liquid makeup with a sponge compact for convenient application. Build the coverage gradually for a natural-looking finish and use the compact for touch-ups.",
    "p002": "This vitamin C serum is designed for a skincare routine focused on a brighter, more even-looking complexion. Its lightweight texture makes it an easy step before moisturizer.",
    "p003": "This lipstick gives lips a matte look with rich color and a soft finish. A light layer creates a more subtle look, while another layer adds stronger color.",
    "p004": "This translucent powder helps set foundation and soften the appearance of shine. A light dusting finishes your makeup without adding another layer of foundation color.",
    "p005": "Warm vanilla and amber give this fragrance a soft, rich character. It suits someone who prefers a warm signature scent over a fresh citrus or floral perfume.",
    "p006": "This rich night cream is intended as a moisturizing step in an evening skincare routine. Its ceramide-focused formula is designed for skin that feels dry and needs extra comfort.",
    "p007": "This set lets you explore warm, woody fragrances in portable rollerball bottles. The small applicators make it convenient to try different scents or carry a favorite in your bag.",
    "p008": "This brush set provides different shapes for applying and blending face and eye makeup. The reusable pouch keeps the brushes together for storage or travel.",
    "p009": "The shampoo cleanses while the conditioner helps soften and smooth the lengths of your hair. Used as a pair, they form a simple wash-day routine for hair that feels dry or looks dull.",
    "p010": "This whipped body butter offers a richer moisturizing texture than a light body lotion. It is designed to leave dry-feeling areas of the body softer and more comfortable.",
    "p011": "This charcoal cleanser is designed to wash away daily buildup and excess oil. It fits into the cleansing step of a routine when your skin needs a refreshed, clean feel.",
    "p012": "This grooming balm helps keep beard hair looking tidy while adding a light conditioning feel. Cedar and sage give it a warm, woody scent for everyday grooming.",
    "p013": "This smaller version of the Glow Drops serum is convenient for travel or trying the product before choosing a full-size bottle. It serves the same brightening-focused step in your skincare routine.",
    "p014": "This kit groups cleanser, toner, moisturizer, and SPF in travel-size portions. It keeps the main steps of a skincare routine together for short trips.",
    "p015": "This gift set brings together foundation, setting powder, and a mini brush for a coordinated makeup routine. The items work together to apply, blend, and finish a base look.",
    "p016": "This discovery set gives you several fragrances to explore before choosing a favorite. Wear one on its own or experiment with combinations to find a scent pairing you enjoy.",
    "p017": "This daily moisturizer focuses on keeping skin hydrated and comfortable. Its ceramide-rich texture is intended for a routine that supports the skin’s moisture barrier.",
    "p018": "This styling cream helps waves and curls look more defined while keeping a soft finish. It is intended for shaping your natural curl pattern without a stiff, crunchy feel.",
    "p019": "This foundation offers more coverage for a polished, even-looking base. Its smooth finish makes it suitable for makeup looks where you want a more refined appearance in photos.",
    "p020": "This mineral-rich mask is a targeted skincare step for a cleaner-looking complexion. Use it according to the product label rather than treating it as a daily cleanser.",
    "p021": "This primer goes between skincare and foundation to create a smoother-looking makeup base. Its lightweight texture helps soften the appearance of uneven skin texture.",
    "p022": "These false lashes add definition and fullness to your lash line without mascara alone doing all the work. The flexible band is designed to follow the eye’s shape for a comfortable-looking fit.",
    "p023": "The stick format makes it easy to place foundation exactly where you want coverage. Blend it out for an even base or use it on selected areas for a lighter makeup look.",
    "p024": "This liquid blush adds a soft flush of color to the cheeks. Start with a small amount and blend, then build up the color to suit your look.",
    "p025": "This lip gloss adds shine with a hint of color. Wear it alone for a simple glossy look or over lipstick to give the finish more dimension.",
    "p026": "This fragrance combines rose with smoky notes, warm woods, and dark spice. It offers a deeper floral character for someone who prefers a less sweet rose scent.",
    "p027": "This tinted serum provides light coverage for a fresh, natural-looking complexion. It suits days when you want to even out your skin’s appearance with a lighter base.",
    "p028": "This loose mineral foundation gives coverage in powder form. Build it gradually with a brush for anything from a light, natural finish to a more even-looking base.",
    "p029": "These liquid drops add a warm bronze tone to your makeup look. Adjust the amount for a subtle hint of warmth or a stronger glow, following the product’s mixing directions.",
    "p030": "This solid shampoo offers a compact alternative to bottled shampoo. It is designed to cleanse while keeping hair feeling light, making it useful for a volume-focused wash routine.",
    "p031": "This eyeshadow palette combines matte and metallic finishes for a range of eye looks. Use softer shades for a simple daytime look, then add deeper tones or shimmer for more definition."
  };

  let learnDialog, learnTrigger, previousBodyOverflow;

  function openLearnMore(product, trigger) {
    if (!learnDialog) {
      const style = document.createElement('style');
      style.textContent = `
        .product-learn-dialog{border:1px solid var(--line,#e5d3c5);margin:auto;width:calc(100% - 32px);max-width:820px;max-height:88vh;padding:0;background:var(--white,#fff);color:var(--ink,#241c17);border-radius:20px;box-shadow:0 24px 80px #0005;overflow:auto;}
        .product-learn-dialog::backdrop{background:rgba(15,10,8,.7);}
        .product-learn-dialog .learn-toolbar{position:absolute;top:12px;right:16px;z-index:1;display:flex;justify-content:flex-end;}
        .product-learn-dialog .learn-close{background:var(--white,#fff);font-size:.85rem;padding:6px 12px;border:1px solid var(--line,#e5d3c5);border-radius:999px;}
        .product-learn-dialog .learn-close:hover{background:var(--soft-beige,#f7eee3);}
        .product-learn-dialog .learn-layout{display:grid;grid-template-columns:minmax(0,.95fr) minmax(0,1.05fr);}
        .product-learn-dialog .learn-summary{padding:28px;background:var(--soft-beige,#f7eee3);border-top-right-radius:20px;}
        .product-learn-dialog .learn-photo{display:block;width:100%;aspect-ratio:1;object-fit:contain;background:#fff;border:1px solid var(--line,#e5d3c5);border-radius:12px;margin:0 0 22px;}
        .product-learn-dialog .learn-brand{font-size:.7rem;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--warm-caramel,#a67451);}
        .product-learn-dialog h2{font-size:1.55rem;line-height:1.2;margin:8px 0 12px;overflow-wrap:anywhere;}
        .product-learn-dialog .learn-price{font-family:'Fraunces',Georgia,serif;font-size:1.45rem;color:var(--ink,#241c17);}
        .product-learn-dialog .learn-tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;}
        .product-learn-dialog .learn-tags span{font-size:.7rem;padding:4px 9px;border:1px solid var(--line,#e5d3c5);border-radius:999px;background:#fff;}
        .product-learn-dialog .learn-copy{padding:64px 32px 32px;align-self:center;min-width:0;}
        .product-learn-dialog .learn-copy h3{font-size:1.65rem;margin:4px 0 18px;}
        .product-learn-dialog p{margin:0;line-height:1.7;}
        .product-learn-dialog .learn-benefits{border-top:1px solid var(--line,#e5d3c5);margin-top:24px;padding-top:20px;}
        .product-learn-dialog .learn-benefits h4{font-family:inherit;font-size:.8rem;font-weight:600;margin:0 0 12px;}
        .product-learn-dialog .learn-benefits ul{list-style:disc;padding-left:18px;margin:0;}
        .product-learn-dialog .learn-benefits li{font-size:.85rem;line-height:1.6;margin:8px 0;color:var(--ink-soft,#67584e);}
        .product-learn-dialog .learn-benefits li::marker{color:var(--warm-caramel,#a67451);}
        @media(max-width:600px){.product-learn-dialog .learn-layout{grid-template-columns:1fr;}.product-learn-dialog .learn-summary{padding:64px 22px 22px;border-top-right-radius:0;}.product-learn-dialog .learn-photo{max-width:220px;margin:0 auto 20px;}.product-learn-dialog .learn-copy{padding:26px 22px;}}
      `;
      document.head.appendChild(style);

      learnDialog = document.createElement('dialog');
      learnDialog.className = 'product-learn-dialog';
      learnDialog.setAttribute('aria-labelledby', 'product-learn-title');
      learnDialog.setAttribute('aria-describedby', 'product-learn-description');
      learnDialog.innerHTML = `
        <div class="learn-toolbar"><button type="button" class="learn-close" aria-label="Close product information" autofocus>Close ×</button></div>
        <div class="learn-layout">
          <div class="learn-summary">
            <img class="learn-photo" id="product-learn-image" alt="">
            <p class="learn-brand" id="product-learn-brand"></p>
            <h2 id="product-learn-title"></h2>
            <p class="learn-price" id="product-learn-price"></p>
            <div class="learn-tags"><span id="product-learn-category"></span><span id="product-learn-stock"></span></div>
          </div>
          <div class="learn-copy">
            <span class="eyebrow">A Closer Look</span>
            <h3>About This Product</h3>
            <p id="product-learn-description"></p>
            <div class="learn-benefits" id="product-learn-benefits"><h4>Key Benefits</h4><ul></ul></div>
          </div>
        </div>`;
      document.body.appendChild(learnDialog);

      learnDialog.querySelector('.learn-close').addEventListener('click', () => learnDialog.close());

      learnDialog.addEventListener('click', e => {
        const rect = learnDialog.getBoundingClientRect();
        if (
          e.target === learnDialog &&
          (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
        ) {
          learnDialog.close();
        }
      });

      learnDialog.addEventListener('close', () => {
        document.body.style.overflow = previousBodyOverflow;
        if (learnTrigger?.isConnected) learnTrigger.focus({ preventScroll: true });
      });
    }

    learnDialog.querySelector('#product-learn-title').textContent = product.name;

    const photo = learnDialog.querySelector('#product-learn-image');
    photo.src = product.image;
    photo.alt = product.name;

    learnDialog.querySelector('#product-learn-brand').textContent = product.brand;
    learnDialog.querySelector('#product-learn-price').textContent = fmt(product.price);
    learnDialog.querySelector('#product-learn-category').textContent = product.category;
    learnDialog.querySelector('#product-learn-stock').textContent = product.availability || 'In Stock';

    const benefits = learnDialog.querySelector('#product-learn-benefits');
    const benefitList = benefits.querySelector('ul');
    benefitList.replaceChildren();

    (product.benefits || []).slice(0, 3).forEach(text => {
      const item = document.createElement('li');
      item.textContent = text;
      benefitList.appendChild(item);
    });

    benefits.hidden = !benefitList.childElementCount;
    learnDialog.querySelector('#product-learn-description').textContent =
      PRODUCT_DETAILS[product.id] || product.description || 'More information is coming soon.';

    if (!learnDialog.open) {
      learnTrigger = trigger;
      previousBodyOverflow = document.body.style.overflow;
      learnDialog.showModal();
      document.body.style.overflow = 'hidden';
    }
  }

  /* ---------- Inquiry modal ---------- */
  let modal;

  function buildModal() {
    if (modal) return modal;

    modal = document.createElement('div');
    modal.className = 'inq-modal';
    modal.innerHTML = `
      <div class="inq-box" role="dialog" aria-modal="true" aria-labelledby="inq-title">
        <button type="button" class="inq-x" aria-label="Close">×</button>
        <span class="eyebrow">Product Inquiry</span>
        <h3 id="inq-title">Inquire Now</h3>
        <p class="inq-product"></p>
        <form id="inq-form" novalidate>
          <div class="field"><label for="inq-name">Your Name</label><input type="text" id="inq-name" required><span class="err-msg">Please enter your name.</span></div>
          <div class="field"><label for="inq-email">Email Address</label><input type="email" id="inq-email" required><span class="err-msg">Please enter a valid email.</span></div>
          <div class="field"><label for="inq-msg">Your Question</label><textarea id="inq-msg" rows="3" required placeholder="Shade availability, ingredients, bulk orders..."></textarea><span class="err-msg">Please add a short message.</span></div>
          <button type="submit" class="btn btn-primary btn-block">Send Inquiry</button>
        </form>
        <div class="form-msg success inq-done" style="display:none;"></div>
      </div>`;

    document.body.appendChild(modal);

    const close = () => {
      modal.classList.remove('open');
      document.body.style.overflow = '';
    };

    modal.querySelector('.inq-x').addEventListener('click', close);
    modal.addEventListener('click', e => {
      if (e.target === modal) close();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') close();
    });

    modal.querySelector('#inq-form').addEventListener('submit', e => {
      e.preventDefault();
      let ok = true;

      ['inq-name', 'inq-email', 'inq-msg'].forEach(id => {
        const el = document.getElementById(id);
        const f = el.closest('.field');
        f.classList.remove('error');

        const bad = !el.value.trim() ||
          (id === 'inq-email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value));

        if (bad) {
          f.classList.add('error');
          ok = false;
        }
      });

      if (!ok) return;

      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true;
      btn.textContent = 'Sending…';

      window.Api.sendInquiry({
        productId: modal.dataset.pid,
        name: inq_val('inq-name'),
        email: inq_val('inq-email'),
        message: inq_val('inq-msg')
      })
        .then(() => {
          const done = modal.querySelector('.inq-done');
          done.style.display = 'block';
          done.textContent = 'Thank you, ' + inq_val('inq-name') +
            '! Our team will reply to ' + inq_val('inq-email') + ' within 24 hours.';
          e.target.style.display = 'none';
          setTimeout(close, 3200);
        })
        .catch(err => {
          const f = document.getElementById('inq-msg').closest('.field');
          f.classList.add('error');
          f.querySelector('.err-msg').textContent = err.message;
        })
        .finally(() => {
          btn.disabled = false;
          btn.textContent = 'Send Inquiry';
        });
    });

    return modal;
  }

  function inq_val(id) {
    return document.getElementById(id).value.trim();
  }

  function openInquiry(p) {
    const m = buildModal();
    m.dataset.pid = p.id;
    m.querySelector('.inq-product').textContent = p.name + ' · ' + p.brand + ' · ' + fmt(p.price);

    const form = m.querySelector('#inq-form');
    form.reset();
    form.style.display = '';
    form.querySelectorAll('.field').forEach(f => f.classList.remove('error'));

    m.querySelector('.inq-done').style.display = 'none';
    document.getElementById('inq-msg').value = 'Hi, I would like to ask about ' + p.name + '. ';

    m.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('inq-name').focus(), 50);
  }

  /* ---------- One delegated listener for every product grid ---------- */
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-add],[data-order],[data-inquire],[data-learn]');
    if (!t || t.disabled) return;

    await loadProducts();

    if (t.dataset.add) {
      const p = PRODUCTS.find(x => x.id === t.dataset.add);

      if (p && window.Cart && !t.classList.contains('pd-handled')) {
        window.Cart.addItem(p, 1);
        const old = t.textContent;
        t.textContent = 'Added ✓';
        t.classList.add('added');

        setTimeout(() => {
          t.textContent = old;
          t.classList.remove('added');
        }, 1500);
      }
    } else if (t.dataset.order) {
      const p = PRODUCTS.find(x => x.id === t.dataset.order);

      if (p && window.Cart) {
        window.Cart.addItem(p, 1);
        window.location.href = 'checkout.html';
      }
    } else if (t.dataset.inquire) {
      const p = PRODUCTS.find(x => x.id === t.dataset.inquire);
      if (p) openInquiry(p);
    } else if (t.dataset.learn) {
      e.preventDefault();
      const p = PRODUCTS.find(x => x.id === t.dataset.learn);
      if (p) openLearnMore(p, t);
    }
  });

  /* ---------- Featured grid (index.html, cart.html) ---------- */
  async function renderFeatured() {
    const grid = document.getElementById('featured-grid');
    if (!grid) return;

    await loadProducts();

    const featured = PRODUCTS
      .filter(p => ['p002', 'p003', 'p004', 'p005', 'p008', 'p001'].includes(p.id))
      .slice(0, 4);

    grid.innerHTML = featured.map(cardHTML).join('');
    wireAddButtons(grid);
  }

  /* ---------- Full grid with filters + search (products.html) ---------- */
  async function renderProductGrid() {
    const grid = document.getElementById('product-grid');
    if (!grid) return;

    await loadProducts();

    window.Api.mode().then(m => {
      const el = document.getElementById('data-source');
      if (!el) return;

      el.classList.toggle('server', m === 'server');
      el.textContent = (
        m === 'server'
          ? 'Live data: GET /api/products (SQLite database)'
          : 'Static data: data/products.json'
      ) + ' · ' + PRODUCTS.length + ' products loaded';
    });

    const params = new URLSearchParams(window.location.search);
    const urlCategory = params.get('category');
    const urlBrand = params.get('brand');
    const urlQuery = params.get('q');

    let activeCategory = 'All';
    let query = '';

    // Exact brand lock — set once from the URL when a brand tile/link is
    // clicked. Unlike the free-text `query`, this only matches the brand
    // field exactly (case-insensitive), so it can never accidentally widen
    // to unrelated products, and it stays applied even if the person also
    // types in the search box afterward.
    let brandLock = urlBrand ? urlBrand.trim().toLowerCase() : '';
    let stockOnly = false;

    function updateHero() {
      const eyebrow = document.getElementById('shop-eyebrow');
      const heading = document.getElementById('shop-heading');
      const sub = document.getElementById('shop-subheading');
      const crumb = document.getElementById('shop-breadcrumb');
      const label = brandLock ? urlBrand : (query ? query : '');

      const count = PRODUCTS.filter(p => {
        const matchCat = activeCategory === 'All' || p.category === activeCategory;
        const matchBrand = !brandLock || p.brand.trim().toLowerCase() === brandLock;
        const matchQuery = !query ||
          p.name.toLowerCase().includes(query) ||
          p.brand.toLowerCase().includes(query) ||
          p.category.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query);
        const matchStock = !stockOnly || !/out/i.test(p.availability);

        return matchCat && matchBrand && matchQuery && matchStock;
      }).length;

      if (label) {
        if (eyebrow) eyebrow.textContent = brandLock ? 'Shop By Brand' : 'Search Results';
        if (heading) heading.textContent = `Results for "${label}"`;

        if (sub) {
          sub.style.display = 'block';
          sub.textContent = `${count} product${count === 1 ? '' : 's'} matching your search.`;
        }

        if (crumb) {
          crumb.innerHTML = `<a href="index.html">Home</a> / <a href="products.html">Shop</a> / ${label}`;
        }

        document.title = `${label} | Sephora`;
      } else {
        if (eyebrow) eyebrow.textContent = 'Shop All Beauty';
        if (heading) heading.textContent = 'Shop All Beauty';
        if (sub) sub.style.display = 'none';

        if (crumb) {
          crumb.innerHTML = `<a href="index.html">Home</a> / Products`;
        }

        document.title = 'Shop All Products | Sephora';
      }
    }

    function draw() {
      const filtered = PRODUCTS.filter(p => {
        const matchCat = activeCategory === 'All' || p.category === activeCategory;
        const matchBrand = !brandLock || p.brand.trim().toLowerCase() === brandLock;
        const matchQuery = !query ||
          p.name.toLowerCase().includes(query) ||
          p.brand.toLowerCase().includes(query) ||
          p.category.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query);
        const matchStock = !stockOnly || !/out/i.test(p.availability);

        return matchCat && matchBrand && matchQuery && matchStock;
      });

      updateHero();

      grid.innerHTML = filtered.length
        ? filtered.map(cardHTML).join('')
        : `<p style="grid-column:1/-1;text-align:center;color:var(--taupe);padding:60px 0;">No products match your search — try a different term or category.</p>`;

      wireAddButtons(grid);
    }

    document.querySelectorAll('.filter-chip[data-category]').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip[data-category]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        activeCategory = chip.dataset.category;
        draw();
      });
    });

    document.getElementById('in-stock-only')?.addEventListener('change', (e) => {
      stockOnly = e.target.checked;
      draw();
    });

    const searchInput = document.getElementById('product-search');

    searchInput?.addEventListener('input', (e) => {
      // Typing a new search takes over from the brand lock, so results
      // widen as expected instead of staying stuck on one brand.
      brandLock = '';
      query = e.target.value.trim().toLowerCase();
      draw();
    });

    /* ---- Pre-fill from URL: ?brand=, ?category=, ?q= (all sent here by
       brand tiles, header search, and featured-category cards) ---- */
    if (urlBrand) {
      if (searchInput) searchInput.value = urlBrand;
    } else if (urlQuery) {
      query = urlQuery.trim().toLowerCase();
      if (searchInput) searchInput.value = urlQuery;
    }

    if (urlCategory) {
      const chip = document.querySelector(`.filter-chip[data-category="${CSS.escape(urlCategory)}"]`);

      if (chip) {
        document.querySelectorAll('.filter-chip[data-category]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        activeCategory = urlCategory;
      }
    }

    draw();
  }

  /* ---------- Single product detail (product-detail.html) ---------- */
  async function renderProductDetail() {
    const wrap = document.getElementById('product-detail');
    if (!wrap) return;

    await loadProducts();

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || PRODUCTS[0]?.id;
    const p = PRODUCTS.find(x => x.id === id) || PRODUCTS[0];

    if (!p) return;

    const availClass = p.availability === 'Low Stock' ? 'low' : 'in-stock';
    const keyBenefits = (p.benefits && p.benefits.length ? p.benefits : [
      'Dermatologist tested',
      'Cruelty-free formula',
      'Earns Beauty Insider points',
      'Easy 60-day returns'
    ]);

    wrap.innerHTML = `
      <div class="two-col pd-layout" style="align-items:flex-start;">
        <div class="reveal in">
          <img src="${p.image}" alt="${p.name}" class="pd-image">
        </div>
        <div class="reveal in">
          <a href="products.html?brand=${encodeURIComponent(p.brand)}" class="brand" style="text-transform:uppercase;letter-spacing:.05em;color:var(--warm-caramel);font-size:.78rem;font-weight:600;">${p.brand}</a>
          <h1 style="font-size:2.2rem;margin:10px 0 6px;">${p.name}</h1>
          <div class="stars" style="margin-bottom:10px;">${stars(p.rating)} <span style="color:var(--taupe);font-size:.82rem;">(${p.reviews} reviews) · <a href="products.html?category=${encodeURIComponent(p.category)}" style="color:var(--taupe);text-decoration:underline;">${p.category}</a></span></div>
          <div class="price" style="font-size:1.6rem;font-family:'Fraunces',serif;color:var(--brown);margin-bottom:16px;">${fmt(p.price)}</div>

          <div class="pd-status ${availClass}">
            <span class="dot"></span>
            ${p.availability === 'Low Stock' ? 'Low stock — order soon' : 'In stock — ready to ship'}
          </div>

          <p class="lede">${p.description}</p>

          <div style="display:flex;gap:14px;align-items:center;margin:26px 0;">
            <div class="qty-control" id="pd-qty">
              <button type="button" data-action="dec">−</button><span>1</span><button type="button" data-action="inc">+</button>
            </div>
            <button type="button" class="btn btn-primary pd-handled" id="pd-add" data-add="${p.id}">Add to Bag</button>
          </div>
          <div class="pd-cta-row">
            <button type="button" class="btn btn-outline" id="pd-order">Order Now</button>
            <button type="button" class="btn btn-outline" data-inquire="${p.id}">Inquire Now</button>
            <button type="button" data-learn="${p.id}" aria-haspopup="dialog" class="btn-ghost" style="align-self:center;">Learn More</button>
          </div>

          <div class="key-benefits-card">
            <h4>Key Benefits</h4>
            <ul>
              ${keyBenefits.map(b => `<li><span class="check">✓</span>${b}</li>`).join('')}
            </ul>
          </div>

          <div class="benefit-strip">
            <span>✓ Cruelty-Free</span>
            <span>✓ Ships in 3–5 days</span>
            <span>✓ 60-day easy returns</span>
          </div>
        </div>
      </div>
    `;

    let qty = 1;
    const qtyControl = document.getElementById('pd-qty');

    qtyControl.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        qty = btn.dataset.action === 'inc' ? qty + 1 : Math.max(1, qty - 1);
        qtyControl.querySelector('span').textContent = qty;
      });
    });

    const pdAddBtn = document.getElementById('pd-add');

    pdAddBtn.addEventListener('click', () => {
      window.Cart?.addItem(p, qty);
      pdAddBtn.textContent = 'Added ✓';
      pdAddBtn.classList.add('added');

      setTimeout(() => {
        pdAddBtn.textContent = 'Add to Bag';
        pdAddBtn.classList.remove('added');
      }, 1500);
    });

    document.getElementById('pd-order')?.addEventListener('click', () => {
      window.Cart?.addItem(p, qty);
      window.location.href = 'checkout.html';
    });

    document.title = `${p.name} | Sephora`;

    // related products
    const relatedGrid = document.getElementById('related-grid');

    if (relatedGrid) {
      const related = PRODUCTS.filter(x => x.category === p.category && x.id !== p.id).slice(0, 4);
      const fallback = related.length ? related : PRODUCTS.filter(x => x.id !== p.id).slice(0, 4);
      relatedGrid.innerHTML = fallback.map(cardHTML).join('');
      wireAddButtons(relatedGrid);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderFeatured();
    renderProductGrid();
    renderProductDetail();
  });

  window.SephoraProducts = { loadProducts, cardHTML, fmt };
})();