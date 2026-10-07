/* ===================================================================
   CUSTOMERS.JS — customer dashboard (account.html).
   Everything comes from the database through window.Api:
     profile      GET /api/me            edit: PUT /api/me
     orders       GET /api/orders
     gift cards   GET /api/me/giftcards
     directory    GET /api/customers     (Dataset 2: customer information)
   Admins who open this page are sent to admin.html.
   On static hosting (no server) the same calls are answered from data/*.json plus a
   demo database kept in the browser (see js/api.js).
=================================================================== */
(function () {
  const { esc } = window.Api;
  const $ = id => document.getElementById(id);

  const fmtDate = iso => {
    try { return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }); }
    catch (e) { return iso; }
  };
  const peso = n => '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function toast(msg, isErr) {
    const t = $('toast'); if (!t) return;
    t.textContent = msg; t.classList.toggle('err', !!isErr); t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function orderCard(o) {
    return `
      <div class="order-row">
        <div class="order-head"><strong>${esc(o.ref)}</strong><span>${fmtDate(o.date)}</span><span class="order-status ${esc(o.status)}">${esc(o.status)}</span><span class="order-total">${peso(o.total)}</span></div>
        <ul>${o.items.map(i => `<li>${i.qty} × ${esc(i.name)} <em>${peso(i.price)}</em></li>`).join('')}</ul>
      </div>`;
  }

  function showProfile(c) {
    $('acc-name').textContent = c.name;
    $('acc-first').textContent = c.name.split(' ')[0];
    $('acc-email').textContent = c.email;
    $('acc-tier').textContent = c.membershipTier;
    $('acc-points').textContent = c.points.toLocaleString();
    $('acc-joined').textContent = fmtDate(c.joinDate);
    $('pf-name').value = c.name;
    $('pf-email').value = c.email;
  }

  function showOrders(list) {
    $('nav-orders').textContent = list.length;
    $('st-orders').textContent = list.length;
    const real = list.filter(o => o.status !== 'Cancelled');
    $('st-spent').textContent = peso(real.reduce((s, o) => s + o.total, 0));
    const none = '<p class="acc-empty">No orders yet. <a href="products.html" class="btn-ghost">Start shopping</a></p>';
    $('acc-latest').innerHTML = list.length ? orderCard(list[0]) : none;
    $('acc-orders').innerHTML = list.length ? list.map(orderCard).join('') : none;
  }

  function showGifts(list) {
    $('nav-gifts').textContent = list.length;
    $('acc-gifts').innerHTML = list.length
      ? list.map(g => `<tr><td><code>${esc(g.code)}</code></td><td>${esc(g.recipient_name)}</td><td>${esc(g.format === 'email' ? 'E-gift card' : 'Physical card')}</td><td class="num">${peso(g.amount)}</td><td>${fmtDate(g.created_at)}</td></tr>`).join('')
      : '<tr><td colspan="5" class="empty">No gift cards yet. <a href="gift-cards.html" class="btn-ghost">Send one</a></td></tr>';
  }

  function showDirectory(list, mode, myEmail) {
    $('nav-dir').textContent = list.length;
    $('dir-source').innerHTML = (mode === 'server'
      ? `Customer dataset retrieved with <code>GET /api/customers</code> from the SQLite database`
      : `Customer dataset retrieved with <code>GET data/customers.json</code>`) + ` &mdash; ${list.length} members. Other members' emails are masked.`;
    $('acc-dir').innerHTML = list.map(c => `<tr${c.email === myEmail ? ' class="me"' : ''}><td>${esc(c.customerId)}</td><td><b>${esc(c.name)}</b>${c.email === myEmail ? ' <span class="badge ok">you</span>' : ''}</td><td>${esc(c.email)}</td><td>${esc(c.membershipTier)}</td><td class="num">${c.points.toLocaleString()}</td><td>${fmtDate(c.joinDate)}</td></tr>`).join('')
      || '<tr><td colspan="6" class="empty">No members found.</td></tr>';
  }

  function initTabs() {
    $('acc-nav').addEventListener('click', e => {
      const b = e.target.closest('button[data-tab]'); if (!b) return;
      $('acc-nav').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + b.dataset.tab));
    });
  }

  function initProfileForm(mode) {
    $('profile-form').addEventListener('submit', async e => {
      e.preventDefault();
      const err = $('pf-err'); err.textContent = '';
      const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        const c = await window.Api.updateProfile({ name: $('pf-name').value, currentPassword: $('pf-cur').value, newPassword: $('pf-new').value });
        showProfile(c); $('pf-cur').value = ''; $('pf-new').value = '';
        toast('Profile saved');
      } catch (ex) { err.textContent = ex.message; }
      btn.disabled = false;
    });
  }

  async function render() {
    if (!$('account-wrap')) return;
    const mode = await window.Api.mode();

    let active = null;
    try { active = await window.Api.me(); } catch (e) { /* treated as logged out */ }
    if (!active) { $('acc-guest').style.display = 'block'; return; }
    if (active.role === 'admin') { window.location.replace('admin.html'); return; }

    $('acc-dash').style.display = 'grid';
    $('acc-source').innerHTML = mode === 'server'
      ? 'Your data is loaded live from the SQLite database (<code>GET /api/me</code>, <code>GET /api/orders</code>).'
      : 'Demo mode (static hosting): your data comes from <code>data/*.json</code> plus a demo database saved in this browser.';
    showProfile(active);
    initTabs();
    initProfileForm(mode);

    window.Api.myOrders().then(showOrders).catch(() => showOrders([]));
    window.Api.myGiftCards().then(showGifts).catch(() => showGifts([]));
    window.Api.customers().then(l => showDirectory(l, mode, active.email)).catch(() => { $('dir-source').textContent = 'Could not load the customer dataset.'; });

    $('acc-logout').addEventListener('click', async e => {
      e.preventDefault();
      await window.Api.logout();
      window.location.href = 'login.html';
    });
  }

  document.addEventListener('DOMContentLoaded', render);
  window.SephoraCustomers = { loadCustomers: () => window.Api.customers() };
})();
