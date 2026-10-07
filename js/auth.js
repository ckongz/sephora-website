/* ===================================================================
   AUTH.JS — Sign up / Login / Forgot Password form logic.
   Talks to window.Api: with the Express/SQLite server running, accounts
   are created and verified in the database (passwords hashed with scrypt).
   On plain static hosting it falls back to demo mode (email-only match,
   sign-ups kept in localStorage).
=================================================================== */

(function () {
  function isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  function markField(el, valid) {
    const field = el.closest('.field');
    if (!field) return;
    field.classList.toggle('invalid', !valid);
  }

  /* shows a server/validation error under the submit button */
  function showError(form, message) {
    let box = form.querySelector('.auth-error');
    if (!box) {
      box = document.createElement('div');
      box.className = 'form-msg auth-error';
      box.setAttribute('role', 'alert');
      box.style.cssText = 'display:none;margin-top:14px;color:#a33;font-size:.88rem;';
      form.appendChild(box);
    }
    box.textContent = message;
    box.style.display = message ? 'block' : 'none';
  }

  /* ---------------- SIGN UP ---------------- */
  function initSignup() {
    const form = document.getElementById('signup-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('su-name');
      const email = document.getElementById('su-email');
      const pass = document.getElementById('su-password');
      const confirm = document.getElementById('su-confirm');
      const terms = document.getElementById('su-terms');

      let valid = true;
      const nameOk = name.value.trim().length > 1;
      markField(name, nameOk); valid = valid && nameOk;

      const emailOk = isValidEmail(email.value);
      markField(email, emailOk); valid = valid && emailOk;

      const passOk = pass.value.length >= 6;
      markField(pass, passOk); valid = valid && passOk;

      const confirmOk = confirm.value === pass.value && passOk;
      markField(confirm, confirmOk); valid = valid && confirmOk;

      if (!terms.checked) {
        valid = false;
        terms.closest('.checkbox-row').style.outline = '1px solid var(--rose-blush)';
      } else {
        terms.closest('.checkbox-row').style.outline = 'none';
      }

      if (!valid) return;

      const btn = form.querySelector('button[type=submit]');
      const oldLabel = btn.textContent;
      btn.disabled = true; btn.textContent = 'Creating account…';
      showError(form, '');
      window.Api.signup({ name: name.value.trim(), email: email.value.trim(), password: pass.value })
        .then(() => {
          // marketing opt-in -> newsletter subscriber list
          if (document.getElementById('su-marketing')?.checked) window.Api.subscribe(email.value.trim()).catch(() => {});
          document.getElementById('signup-success').style.display = 'block';
          form.style.display = 'none';
          setTimeout(() => { window.location.href = 'account.html'; }, 1600);
        })
        .catch(err => { showError(form, err.message); btn.disabled = false; btn.textContent = oldLabel; });
    });
  }

  /* ---------------- LOGIN ---------------- */
  async function initLogin() {
    const form = document.getElementById('login-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('li-email');
      const pass = document.getElementById('li-password');

      const emailOk = isValidEmail(email.value);
      markField(email, emailOk);
      const passOk = pass.value.length > 0;
      markField(pass, passOk);
      if (!emailOk || !passOk) return;

      const btn = form.querySelector('button[type=submit]');
      const oldLabel = btn.textContent;
      btn.disabled = true; btn.textContent = 'Logging in…';
      showError(form, '');
      try {
        const who = await window.Api.login({ email: email.value.trim(), password: pass.value });
        window.location.href = window.Api.homeFor(who.role);   // admins -> admin.html, customers -> account.html
      } catch (err) {
        showError(form, err.message);
        btn.disabled = false; btn.textContent = oldLabel;
      }
    });
  }

  /* ---------------- DEMO ACCOUNTS (login page) ---------------- */
  function initDemo() {
    const box = document.getElementById('demo-box');
    const form = document.getElementById('login-form');
    if (!box || !form) return;
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-demo]');
      if (!b) return;
      const [email, password, action] = b.dataset.demo.split('|');
      document.getElementById('li-email').value = email;
      document.getElementById('li-password').value = password;
      form.querySelectorAll('.field').forEach(f => f.classList.remove('invalid'));
      if (action === 'go') form.requestSubmit(); else form.querySelector('button[type=submit]').focus();
    });
  }

  /* ---------------- FORGOT PASSWORD ---------------- */
  function initForgot() {
    const form = document.getElementById('forgot-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('fp-email');
      const emailOk = isValidEmail(email.value);
      markField(email, emailOk);
      if (!emailOk) return;

      const msg = document.getElementById('forgot-success');
      msg.textContent = `Check your inbox. If an account exists for ${email.value.trim()}, you'll receive a password reset link within a few minutes.`;
      msg.style.display = 'block';
      form.style.display = 'none';
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initSignup();
    initLogin();
    initDemo();
    initForgot();
  });
})();
