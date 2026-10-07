/* ===================================================================
   ADMIN.JS — admin dashboard (admin.html).
   Talks to /api/admin/* through Api.admin(). The SERVER checks the admin
   role on every call, so hiding this page is only a convenience.
=================================================================== */
(function () {
  const { esc } = window.Api;
  const $ = id => document.getElementById(id);
  const A = (path, opts) => window.Api.admin(path, opts);
  const json = (method, body) => ({ method, body });

  const fmtDate = iso => { try { return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return iso; } };
  const peso = n => '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const STATUSES = ['Placed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
  const TIERS = ['Insider', 'VIB', 'Rouge', 'Staff'];

  const state = { me: null, customers: [], orders: [], products: [], inbox: null, loaded: {} };

  function toast(msg, isErr) {
    const t = $('toast');
    t.textContent = msg; t.classList.toggle('err', !!isErr); t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2800);
  }
  const fail = e => toast(e.message || 'Something went wrong', true);
  const empty = (msg) => `<div class="empty">${msg}</div>`;

  /* ---------------- modal ---------------- */
  function openModal({ title, fields, saveLabel = 'Save', onSave }) {
    $('m-title').textContent = title;
    $('m-fields').innerHTML = fields;
    $('m-err').textContent = '';
    $('m-save').textContent = saveLabel;
    $('modal').classList.add('open');
    const first = $('m-fields').querySelector('input,select,textarea'); if (first) first.focus();
    $('m-form').onsubmit = async e => {
      e.preventDefault();
      $('m-err').textContent = '';
      $('m-save').disabled = true;
      try { await onSave(Object.fromEntries(new FormData($('m-form')).entries())); closeModal(); }
      catch (ex) { $('m-err').textContent = ex.message; }
      $('m-save').disabled = false;
    };
  }
  const closeModal = () => $('modal').classList.remove('open');

  const input = (name, label, val = '', extra = '') => `<div class="fld"><label>${label}</label><input name="${name}" value="${esc(val)}" ${extra}></div>`;
  const select = (name, label, opts, val) => `<div class="fld"><label>${label}</label><select name="${name}">${opts.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}"${v === val ? ' selected' : ''}>${esc(t)}</option>`; }).join('')}</select></div>`;

  /* ---------------- OVERVIEW ---------------- */
  async function loadOverview() {
    const s = await A('stats');
    $('ad-stats').innerHTML = [
      ['Customers', s.customers, `${s.admins} admin account${s.admins === 1 ? '' : 's'}`],
      ['Orders', s.orders, ''], ['Revenue', peso(s.revenue), 'excl. cancelled'],
      ['Products', s.products, ''], ['Subscribers', s.subscribers, ''], ['Messages & inquiries', s.messages, '']
    ].map(([l, v, h]) => `<div class="stat"><div class="lbl">${l}</div><div class="val">${v}</div>${h ? `<div class="hint">${h}</div>` : ''}</div>`).join('');

    const max = Math.max(1, ...s.byStatus.map(b => b.n));
    $('ad-bars').innerHTML = s.byStatus.length ? s.byStatus.map(b => `<div class="bar"><span>${esc(b.status)}</span><div class="track-b"><div class="fill" style="width:${b.n / max * 100}%"></div></div><b>${b.n}</b></div>`).join('') : empty('No orders yet.');
    $('ad-top').innerHTML = s.top.length ? `<table class="dtable"><tbody>${s.top.map(t => `<tr><td>${esc(t.name)}</td><td class="num">${t.qty} sold</td></tr>`).join('')}</tbody></table>` : empty('No sales yet.');
    $('ad-recent').innerHTML = s.recent.length ? `<table class="dtable"><tbody>${s.recent.map(o => `<tr><td><b>${esc(o.ref)}</b><span class="sub">${esc(o.name)} · ${fmtDate(o.created_at)}</span></td><td class="num">${peso(o.total)}</td><td><span class="badge ${esc(o.status)}">${esc(o.status)}</span></td></tr>`).join('')}</tbody></table>` : empty('No orders yet.');
    $('ad-low').innerHTML = s.lowStock.length ? `<table class="dtable"><tbody>${s.lowStock.map(p => `<tr><td>${esc(p.name)}</td><td class="num"><span class="badge ${p.stock ? 'low' : 'Cancelled'}">${p.stock ? p.stock + ' left' : 'Out'}</span></td></tr>`).join('')}</tbody></table>` : empty('Everything is well stocked.');
  }

  /* ---------------- ACCOUNTS ---------------- */
  async function loadCustomers() {
    state.customers = await A('customers');
    $('n-customers').textContent = state.customers.length;
    renderCustomers();
  }
  function renderCustomers() {
    const q = $('c-search').value.trim().toLowerCase(), role = $('c-role').value;
    const rows = state.customers.filter(c => (!role || c.role === role) && (!q || (c.name + ' ' + c.email).toLowerCase().includes(q)));
    $('c-body').innerHTML = rows.length ? rows.map(c => `
      <tr${c.customerId === state.me.customerId ? ' class="me"' : ''}>
        <td><b>${esc(c.name)}</b>${c.customerId === state.me.customerId ? ' <span class="badge ok">you</span>' : ''}<span class="sub">${esc(c.email)}</span></td>
        <td><span class="badge ${c.role === 'admin' ? 'admin' : ''}">${esc(c.role)}</span></td>
        <td>${esc(c.membershipTier)}</td><td class="num">${c.points.toLocaleString()}</td><td class="num">${c.orders}</td><td class="num">${peso(c.spent)}</td>
        <td><span class="badge ${esc(c.status)}">${esc(c.status)}</span></td>
        <td class="actions">
          <button class="mini" data-act="edit" data-id="${esc(c.customerId)}">Edit</button>
          <button class="mini" data-act="toggle" data-id="${esc(c.customerId)}">${c.status === 'active' ? 'Suspend' : 'Activate'}</button>
          <button class="mini danger" data-act="del" data-id="${esc(c.customerId)}">Delete</button>
        </td></tr>`).join('') : `<tr><td colspan="8">${empty('No accounts match.')}</td></tr>`;
  }
  function accountForm(c) {
    const isNew = !c;
    return input('name', 'Full name', c?.name, 'required maxlength="80"') +
      input('email', 'Email', c?.email, 'type="email" required') +
      `<div class="row">${select('role', 'Role', ['customer', 'admin'], c?.role || 'customer')}${select('membershipTier', 'Tier', TIERS, c?.membershipTier || 'Insider')}</div>` +
      `<div class="row">${input('points', 'Points', c?.points ?? 0, 'type="number" min="0"')}${isNew ? '' : select('status', 'Status', ['active', 'suspended'], c.status)}</div>` +
      `<div class="fld"><label>${isNew ? 'Password' : 'New password'}</label><input name="password" type="password" ${isNew ? 'required' : ''} minlength="6" autocomplete="new-password" placeholder="${isNew ? 'At least 6 characters' : 'Leave blank to keep the current one'}"></div>`;
  }
  function addAccount() {
    openModal({ title: 'Add account', fields: accountForm(), saveLabel: 'Create account', onSave: async d => {
      await A('customers', json('POST', { ...d, points: Number(d.points) || 0 }));
      toast('Account created'); await loadCustomers();
    } });
  }
  function editAccount(id) {
    const c = state.customers.find(x => x.customerId === id);
    openModal({ title: 'Edit account', fields: accountForm(c), onSave: async d => {
      const body = { ...d, points: Number(d.points) }; if (!body.password) delete body.password;
      await A('customers/' + encodeURIComponent(id), json('PUT', body));
      toast('Account updated'); await loadCustomers();
    } });
  }
  async function customerAction(act, id) {
    const c = state.customers.find(x => x.customerId === id); if (!c) return;
    try {
      if (act === 'edit') return editAccount(id);
      if (act === 'toggle') {
        await A('customers/' + encodeURIComponent(id), json('PUT', { status: c.status === 'active' ? 'suspended' : 'active' }));
        toast(c.status === 'active' ? 'Account suspended' : 'Account activated');
      }
      if (act === 'del') {
        if (!confirm(`Delete the account for ${c.name}? Their past orders are kept.`)) return;
        await A('customers/' + encodeURIComponent(id), { method: 'DELETE' });
        toast('Account deleted');
      }
      await loadCustomers();
    } catch (e) { fail(e); }
  }

  /* ---------------- ORDERS ---------------- */
  async function loadOrders() {
    state.orders = await A('orders');
    $('n-orders').textContent = state.orders.length;
    renderOrders();
  }
  function renderOrders() {
    const st = $('o-status').value, q = $('o-search').value.trim().toLowerCase();
    const rows = state.orders.filter(o => (!st || o.status === st) && (!q || (o.ref + ' ' + o.name + ' ' + o.email).toLowerCase().includes(q)));
    $('o-body').innerHTML = rows.length ? rows.map(o => `
      <tr>
        <td><b>${esc(o.ref)}</b></td>
        <td>${esc(o.name)}<span class="sub">${esc(o.email)}${o.address ? ' · ' + esc(o.address) : ''}</span></td>
        <td>${o.items.map(i => `${i.qty} × ${esc(i.name)}`).join('<br>')}</td>
        <td class="num">${peso(o.total)}</td><td>${fmtDate(o.date)}</td>
        <td>${o.status === 'Cancelled' ? '<span class="badge Cancelled">Cancelled</span>'
          : `<select class="status-select" data-order="${o.id}">${STATUSES.map(s => `<option${s === o.status ? ' selected' : ''}>${s}</option>`).join('')}</select>`}</td>
      </tr>`).join('') : `<tr><td colspan="6">${empty('No orders match.')}</td></tr>`;
  }

  /* ---------------- PRODUCTS ---------------- */
  async function loadProducts() {
    state.products = await A('products');
    $('n-products').textContent = state.products.length;
    renderProducts();
  }
  function renderProducts() {
    const q = $('p-search').value.trim().toLowerCase();
    const rows = state.products.filter(p => !q || (p.name + ' ' + p.brand + ' ' + p.category).toLowerCase().includes(q));
    $('p-body').innerHTML = rows.length ? rows.map(p => `
      <tr>
        <td>${esc(p.id)}</td><td><b>${esc(p.name)}</b><span class="sub">${esc(p.brand)}</span></td><td>${esc(p.category)}</td>
        <td class="num">${peso(p.price)}</td>
        <td class="num"><span class="badge ${p.stock === 0 ? 'Cancelled' : p.stock <= 5 ? 'low' : 'ok'}">${p.stock}</span></td>
        <td class="actions"><button class="mini" data-pact="edit" data-id="${esc(p.id)}">Edit</button> <button class="mini danger" data-pact="del" data-id="${esc(p.id)}">Delete</button></td>
      </tr>`).join('') : `<tr><td colspan="6">${empty('No products match.')}</td></tr>`;
  }
  function productForm(p) {
    return input('name', 'Product name', p?.name, 'required maxlength="120"') +
      `<div class="row">${input('brand', 'Brand', p?.brand, 'required')}${input('category', 'Category', p?.category || 'Makeup', 'required')}</div>` +
      `<div class="row">${input('price', 'Price (₱)', p?.price ?? '', 'type="number" min="0" step="0.01" required')}${input('stock', 'Stock', p?.stock ?? 20, 'type="number" min="0" step="1" required')}</div>` +
      `<div class="fld"><label>Description</label><textarea name="description" rows="3" maxlength="600">${esc(p?.description || '')}</textarea></div>` +
      input('image', 'Image URL (optional)', p?.image || '');
  }
  function addProduct() {
    openModal({ title: 'Add product', fields: productForm(), saveLabel: 'Add product', onSave: async d => {
      await A('products', json('POST', d)); toast('Product added'); await loadProducts();
    } });
  }
  function editProduct(id) {
    const p = state.products.find(x => x.id === id);
    openModal({ title: 'Edit product', fields: productForm(p), onSave: async d => {
      await A('products/' + encodeURIComponent(id), json('PUT', d)); toast('Product updated'); await loadProducts();
    } });
  }
  async function deleteProduct(id) {
    const p = state.products.find(x => x.id === id);
    if (!confirm(`Delete "${p.name}"?`)) return;
    try { await A('products/' + encodeURIComponent(id), { method: 'DELETE' }); toast('Product deleted'); await loadProducts(); } catch (e) { fail(e); }
  }

  /* ---------------- INBOX ---------------- */
  const simple = (rows, cols) => rows.length
    ? `<div class="table-wrap" style="border:0;"><table class="dtable"><tbody>${rows.map(r => `<tr>${cols(r)}</tr>`).join('')}</tbody></table></div>`
    : empty('Nothing here yet.');
  async function loadInbox() {
    const d = await A('inbox');
    $('i-msgs').innerHTML = simple(d.messages, m => `<td><b>${esc(m.subject)}</b><span class="sub">${esc(m.name)} · ${esc(m.email)} · ${fmtDate(m.created_at)}</span>${esc(m.message)}</td>`);
    $('i-inq').innerHTML = simple(d.inquiries, q => `<td><b>${esc(q.product || 'General')}</b><span class="sub">${esc(q.name)} · ${esc(q.email)} · ${fmtDate(q.created_at)}</span>${esc(q.message)}</td>`);
    $('i-subs').innerHTML = simple(d.subscribers, s => `<td>${esc(s.email)}</td><td class="num">${fmtDate(s.created_at)}</td>`);
    $('i-gifts').innerHTML = simple(d.giftcards, g => `<td><code>${esc(g.code)}</code><span class="sub">${esc(g.sender_name)} → ${esc(g.recipient_name)}</span></td><td class="num">${peso(g.amount)}</td>`);
  }

  /* ---------------- tabs + wiring ---------------- */
  const loaders = { overview: loadOverview, customers: loadCustomers, orders: loadOrders, products: loadProducts, inbox: loadInbox };
  async function showTab(name) {
    $('ad-nav').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
    try { await loaders[name](); } catch (e) { fail(e); }
  }

  function guard(title, msg, btn, href) {
    $('ad-guard').style.display = 'block';
    $('ad-guard-title').textContent = title; $('ad-guard-msg').textContent = msg;
    const b = $('ad-guard-btn'); b.textContent = btn; b.href = href;
  }

  async function init() {
    if (!$('admin-wrap')) return;
    const mode = await window.Api.mode();
    let me = null;
    try { me = await window.Api.me(); } catch (e) { /* logged out */ }
    if (!me) return guard('Admin login required', 'Please log in with an admin account (sample admin accounts are listed on the login page).', 'Go to Login', 'login.html');
    if (me.role !== 'admin') return guard('Admin access only', 'Your account is a customer account, so it cannot open the admin dashboard.', 'Go to My Account', 'account.html');

    state.me = me;
    $('ad-name').textContent = me.name; $('ad-email').textContent = me.email;
    $('ad-source').innerHTML = mode === 'server'
      ? 'Live numbers from the SQLite database (<code>/api/admin/*</code>, admin role checked on the server).'
      : 'Demo mode (static hosting): this demo database is stored in <strong>this browser</strong>. Changes are saved here and can be reset.';
    if (mode !== 'server') {
      $('ad-reset').style.display = 'block';
      $('ad-reset').onclick = async () => {
        if (!confirm('Reset the demo database to the original sample data? Your changes in this browser will be lost.')) return;
        await window.Api.resetDemo(); window.location.href = 'login.html';
      };
    }
    $('ad-dash').style.display = 'grid';

    $('ad-nav').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) showTab(b.dataset.tab); });
    $('ad-logout').addEventListener('click', async e => { e.preventDefault(); await window.Api.logout(); window.location.href = 'login.html'; });

    $('c-add').onclick = addAccount; $('p-add').onclick = addProduct;
    $('c-search').oninput = renderCustomers; $('c-role').onchange = renderCustomers;
    $('o-search').oninput = renderOrders; $('o-status').onchange = renderOrders;
    $('p-search').oninput = renderProducts;
    $('c-body').addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) customerAction(b.dataset.act, b.dataset.id); });
    $('p-body').addEventListener('click', e => { const b = e.target.closest('button[data-pact]'); if (!b) return; b.dataset.pact === 'edit' ? editProduct(b.dataset.id) : deleteProduct(b.dataset.id); });
    $('o-body').addEventListener('change', async e => {
      const sel = e.target.closest('select[data-order]'); if (!sel) return;
      if (sel.value === 'Cancelled' && !confirm('Cancel this order? Stock will be returned and the points taken back.')) { renderOrders(); return; }
      try { await A('orders/' + sel.dataset.order, json('PUT', { status: sel.value })); toast('Order updated'); await loadOrders(); } catch (ex) { fail(ex); renderOrders(); }
    });
    $('m-cancel').onclick = closeModal;
    $('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

    // counts for the side menu + the overview
    Promise.all([loadCustomers(), loadOrders(), loadProducts()]).catch(fail);
    showTab('overview');
  }
  document.addEventListener('DOMContentLoaded', init);
})();
