/* ===================================================================
   CART.JS — localStorage-backed shopping bag.
   Exposes window.Cart so other scripts (products.js, checkout, etc.)
   can add items, read the subtotal, and render the cart page.
=================================================================== */

(function () {
  const KEY = 'sephora_cart';

  // Keep photos in existing shopping bags working after image renaming.
  const renamedImages = {
    "p001": "cloud-cushion-foundation.png",
    "p002": "glow-drops-vitamin-c-serum.png",
    "p003": "rouge-velvet-matte-lipstick.png",
    "p004": "soft-focus-setting-powder.png",
    "p005": "vanille-noire-eau-de-parfum.png",
    "p006": "overnight-repair-cream.png",
    "p007": "amber-and-oud-rollerball-set.png",
    "p008": "pro-blend-brush-set.png",
    "p009": "hydra-repair-shampoo-and-conditioner-duo.png",
    "p010": "whipped-shea-body-butter.png",
    "p011": "charcoal-detox-face-wash.png",
    "p012": "cedar-and-sage-grooming-balm.png",
    "p013": "mini-glow-drops-vitamin-c-serum.png",
    "p014": "weekend-getaway-skincare-kit.png",
    "p015": "the-glow-getter-gift-set.png",
    "p016": "scent-layering-discovery-set.png",
    "p017": "barrier-repair-moisturizer.png",
    "p018": "silk-wave-curl-cream.png",
    "p019": "ceramic-skin-foundation.png",
    "p020": "supermud-clearing-treatment.png",
    "p021": "featherlight-blur-primer.png",
    "p022": "silk-lash-false-eyelashes.png",
    "p023": "vital-skin-foundation-stick.png",
    "p024": "soft-pinch-liquid-blush.png",
    "p025": "gloss-bomb-universal-lip-luminizer.png",
    "p026": "smoked-rose-eau-de-parfum.png",
    "p027": "tinted-skin-serum.png",
    "p028": "original-loose-mineral-foundation.png",
    "p029": "golden-hour-bronzing-drops.png",
    "p030": "volumizing-shampoo-bar.png",
    "p031": "eye-of-the-storm-eyeshadow-palette.png"
  };

  function readCart() {
    try {
      return (JSON.parse(localStorage.getItem(KEY)) || []).map(item => {
        const filename = renamedImages[item.id];

        return filename && item.image === `images/products/${item.id}.png`
          ? { ...item, image: `images/products/${filename}` }
          : item;
      });
    } catch (e) {
      return [];
    }
  }

  function saveCart(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
    updateBadge();
  }

  function addItem(product, qty = 1) {
    const items = readCart();
    const existing = items.find(i => i.id === product.id);

    if (existing) {
      existing.qty += qty;
    } else {
      items.push({
        id: product.id,
        name: product.name,
        brand: product.brand,
        price: product.price,
        image: product.image,
        qty: qty
      });
    }

    saveCart(items);
    showToast(`${product.name} added to your bag`);
  }

  function removeItem(id) {
    saveCart(readCart().filter(i => i.id !== id));
  }

  function setQty(id, qty) {
    const items = readCart();
    const item = items.find(i => i.id === id);

    if (item) {
      item.qty = Math.max(1, qty);
      saveCart(items);
    }
  }

  function clearCart() {
    saveCart([]);
  }

  function subtotal() {
    return readCart().reduce((sum, i) => sum + i.price * i.qty, 0);
  }

  function count() {
    return readCart().reduce((sum, i) => sum + i.qty, 0);
  }

  function fmt(n) {
    return '₱' + Number(n).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function updateBadge() {
    document.querySelectorAll('.cart-count').forEach(el => {
      el.textContent = count();
    });
  }

  /* ---------------- Toast ---------------- */

  function showToast(message) {
    let toast = document.querySelector('.toast');

    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      toast.innerHTML = `
        <svg viewBox="0 0 24 24">
          <path d="M4 12l5 5L20 6"/>
        </svg>
        <span></span>
      `;
      document.body.appendChild(toast);
    }

    toast.querySelector('span').textContent = message;
    toast.classList.add('show');

    clearTimeout(toast._t);

    toast._t = setTimeout(() => {
      toast.classList.remove('show');
    }, 2600);
  }

  /* ---------------- Render the cart.html page ---------------- */

  function renderCartPage() {
    const empty = document.getElementById('cart-empty');
    const wrap = document.getElementById('cart-table-wrap');
    const body = document.getElementById('cart-body');

    if (!body) return;

    const items = readCart();

    if (!items.length) {
      empty.style.display = 'block';
      wrap.style.display = 'none';
      return;
    }

    empty.style.display = 'none';
    wrap.style.display = 'block';

    body.innerHTML = items.map(item => `
      <tr data-id="${item.id}">
        <td>
          <div style="display:flex;gap:14px;align-items:center;">
            <img src="${item.image}" alt="${item.name}">
            <div>
              <div style="font-size:.72rem;color:var(--taupe);text-transform:uppercase;letter-spacing:.03em;">
                ${item.brand || ''}
              </div>
              <div style="font-family:'Fraunces',serif;">
                ${item.name}
              </div>
            </div>
          </div>
        </td>

        <td data-label="Price">${fmt(item.price)}</td>

        <td data-label="Quantity">
          <div class="qty-control">
            <button
              type="button"
              data-action="dec"
              aria-label="Decrease quantity"
            >−</button>

            <span>${item.qty}</span>

            <button
              type="button"
              data-action="inc"
              aria-label="Increase quantity"
            >+</button>
          </div>
        </td>

        <td data-label="Total">${fmt(item.price * item.qty)}</td>

        <td>
          <button
            type="button"
            class="remove-btn"
            data-action="remove"
          >Remove ×</button>
        </td>
      </tr>
    `).join('');

    body.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('tr');
        const id = row.dataset.id;
        const item = readCart().find(i => i.id === id);

        if (!item) return;

        if (btn.dataset.action === 'inc') {
          setQty(id, item.qty + 1);
        }

        if (btn.dataset.action === 'dec') {
          setQty(id, item.qty - 1);
        }

        if (btn.dataset.action === 'remove') {
          removeItem(id);
        }

        renderCartPage();
        renderSummary();
      });
    });
  }

  function renderSummary() {
    const sub = subtotal();
    const subEl = document.getElementById('sum-subtotal');
    const totalEl = document.getElementById('sum-total');
    const pointsEl = document.getElementById('sum-points');

    if (subEl) subEl.textContent = fmt(sub);
    if (totalEl) totalEl.textContent = fmt(sub);
    if (pointsEl) pointsEl.textContent = Math.floor(sub) + ' pts';
  }

  /* ---------------- Promo code (demo only) ---------------- */

  function initPromo() {
    const applyBtn = document.getElementById('promo-apply');
    const input = document.getElementById('promo-input');

    if (!applyBtn) return;

    applyBtn.addEventListener('click', () => {
      const code = (input.value || '').trim().toUpperCase();

      if (code === 'GLOW10') {
        showToast('Promo applied — 10% off will be reflected at checkout');
      } else if (code) {
        showToast('That promo code is not valid.');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateBadge();
    renderCartPage();
    renderSummary();
    initPromo();
  });

  window.Cart = {
    addItem,
    removeItem,
    setQty,
    clearCart,
    subtotal,
    count,
    readCart,
    fmt,
    showToast
  };
})();