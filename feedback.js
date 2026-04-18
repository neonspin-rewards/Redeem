/* ================================================================
   js/features/feedback.js — Feedback form wiring.
================================================================ */
'use strict';

export function initFeedback() {
  // Image preview
  document.getElementById('feedback-image')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    const preview = document.getElementById('feedback-preview');
    const nameEl  = document.getElementById('file-name-display');

    if (file) {
      const url = URL.createObjectURL(file);
      if (preview) { preview.src = url; preview.classList.remove('hidden'); }
      if (nameEl)  nameEl.textContent = file.name.slice(0, 24);
    } else {
      if (preview) preview.classList.add('hidden');
      if (nameEl)  nameEl.textContent = '(optional)';
    }
  });

  // Submit
  document.getElementById('btn-submit-feedback')?.addEventListener('click', () => {
    import('./auth.js').then(({ submitFeedback }) => submitFeedback());
  });
}
