/* ===================================================================
   GIFTCARD.JS — gift-cards.html purchase form logic:
   amount selection, format toggle (email/physical), char count,
   validation, and confirmation state.
=================================================================== */

(function () {
  const form = document.getElementById('giftcard-form');
  if (!form) return;

  document.addEventListener('DOMContentLoaded', () => {
    let selectedAmount = 500;

    /* ---- Amount buttons ---- */
    const amountBtns = document.querySelectorAll('.amount-btn');
    const preview = document.getElementById('gc-amount-preview');
    const customField = document.getElementById('gc-custom-amount-field');
    const customInput = document.getElementById('gc-custom');

    function fmt(n) { return '₱' + Number(n).toLocaleString('en-PH'); }

    amountBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        amountBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (btn.dataset.amount === 'custom') {
          customField.style.display = 'flex';
          selectedAmount = Number(customInput.value) || 0;
          preview.textContent = selectedAmount ? fmt(selectedAmount) : 'Custom';
          customInput.focus();
        } else {
          customField.style.display = 'none';
          selectedAmount = Number(btn.dataset.amount);
          preview.textContent = fmt(selectedAmount);
        }
      });
    });

    customInput?.addEventListener('input', () => {
      selectedAmount = Number(customInput.value) || 0;
      preview.textContent = selectedAmount ? fmt(selectedAmount) : 'Custom';
    });

    /* ---- Format radio toggles shipping/email fields ---- */
    const formatEmail = document.getElementById('gc-format-email');
    const formatPhysical = document.getElementById('gc-format-physical');
    const emailField = document.getElementById('gc-recipient-email-field');
    const shippingField = document.getElementById('gc-shipping-field');

    function toggleFormatFields() {
      const physical = formatPhysical.checked;
      shippingField.style.display = physical ? 'flex' : 'none';
      emailField.style.display = physical ? 'none' : 'flex';
    }
    formatEmail?.addEventListener('change', toggleFormatFields);
    formatPhysical?.addEventListener('change', toggleFormatFields);

    /* ---- Character count for personal message ---- */
    const message = document.getElementById('gc-message');
    const charCount = document.getElementById('gc-char-count');
    message?.addEventListener('input', () => {
      charCount.textContent = `${message.value.length}/200`;
    });

    /* ---- Submit ---- */
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      let valid = true;

      const recipientName = document.getElementById('gc-recipient-name');
      if (!recipientName.value.trim()) { recipientName.closest('.field').classList.add('invalid'); valid = false; }
      else recipientName.closest('.field').classList.remove('invalid');

      const yourName = document.getElementById('gc-your-name');
      if (!yourName.value.trim()) { yourName.closest('.field').classList.add('invalid'); valid = false; }
      else yourName.closest('.field').classList.remove('invalid');

      if (formatEmail.checked) {
        const recipEmail = document.getElementById('gc-recipient-email');
        const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipEmail.value);
        recipEmail.closest('.field').classList.toggle('invalid', !emailOk);
        if (!emailOk) valid = false;
      }

      const terms = document.getElementById('gc-terms');
      if (!terms.checked) { valid = false; terms.closest('.checkbox-row').style.outline = '1px solid var(--rose-blush)'; }
      else terms.closest('.checkbox-row').style.outline = 'none';

      if (!selectedAmount) valid = false;

      if (formatPhysical?.checked) {
        const addr = document.getElementById('gc-shipping-address');
        const addrOk = addr.value.trim().length >= 5;
        addr.closest('.field').classList.toggle('invalid', !addrOk);
        if (!addrOk) valid = false;
      }

      if (!valid) return;

      const recipient = recipientName.value.trim();
      const dateVal = document.getElementById('gc-delivery-date').value;
      const dateLabel = dateVal ? new Date(dateVal + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : 'today';

      const btn = form.querySelector('button[type=submit]');
      const oldLabel = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }
      let errBox = form.querySelector('.gc-error');
      if (!errBox) { errBox = document.createElement('div'); errBox.className = 'form-msg gc-error'; errBox.setAttribute('role', 'alert'); errBox.style.cssText = 'display:none;margin-top:14px;color:#a33;font-size:.88rem;'; form.appendChild(errBox); }
      errBox.style.display = 'none';

      let result;
      try {
        result = await window.Api.sendGiftCard({
          amount: selectedAmount,
          format: formatEmail.checked ? 'email' : 'physical',
          recipientName: recipient,
          recipientEmail: document.getElementById('gc-recipient-email').value.trim(),
          shippingAddress: document.getElementById('gc-shipping-address').value.trim(),
          senderName: document.getElementById('gc-your-name').value.trim(),
          message: document.getElementById('gc-message').value.trim(),
          deliveryDate: dateVal,
          promo: document.getElementById('gc-promo').value.trim()
        });
      } catch (err) {
        errBox.textContent = err.message; errBox.style.display = 'block';
        if (btn) { btn.disabled = false; btn.textContent = oldLabel; }
        return;
      }

      const confirmation = document.getElementById('gc-confirmation');
      confirmation.textContent = `Your gift is on its way! We'll notify ${recipient} on ${dateLabel} with a ${fmt(selectedAmount)} gift card they can spend on anything, anytime. Gift card code: ${result.code}`;
      confirmation.style.display = 'block';
      form.style.display = 'none';

      if (window.Cart) window.Cart.showToast('Gift card order confirmed');
    });
  });
})();
