/* Static email-marketing preview. No email is sent, stored, or passed in the URL. */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.newsletter-form').forEach(form => {
    const msg = form.parentElement.querySelector('.form-msg') || form.nextElementSibling;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.querySelector('input[type="email"]');
      if (!input || !form.reportValidity()) return;
      const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim());
      if (!isValid) {
        if (msg) {
          msg.textContent = 'Please enter a valid email address.';
          msg.classList.remove('success');
          msg.classList.add('err-msg');
        }
        return;
      }
      input.value = '';
      window.location.assign('email-preview.html');
    });
  });
});
