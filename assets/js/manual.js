(() => {
  'use strict';
  const search = document.getElementById('manual-search');
  const entries = [...document.querySelectorAll('.contents li')];
  const status = document.getElementById('manual-search-status');
  search.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase();
    for (const entry of entries) entry.hidden = Boolean(query) && !`${entry.textContent} ${entry.dataset.keywords || ''}`.toLowerCase().includes(query);
    const count = entries.filter(entry => !entry.hidden).length;
    status.textContent = query ? `${count} matching sections. Choose a link below.` : 'Search the section links, or use Ctrl / Cmd + F for all text.';
  });
  document.getElementById('print-manual').addEventListener('click', () => window.print());
  const dialog = document.getElementById('image-dialog');
  const enlarged = document.getElementById('enlarged-image');
  const caption = document.getElementById('enlarged-caption');
  for (const picture of document.querySelectorAll('figure img')) {
    picture.tabIndex = 0;
    picture.setAttribute('role', 'button');
    picture.setAttribute('aria-label', `Enlarge screenshot: ${picture.alt}`);
    const open = () => {
      enlarged.src = picture.src;
      enlarged.alt = picture.alt;
      caption.textContent = picture.closest('figure').querySelector('figcaption').textContent;
      dialog.showModal();
    };
    picture.addEventListener('click', open);
    picture.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    });
  }
  document.getElementById('close-image').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  if (location.protocol === 'file:') {
    document.querySelectorAll('[data-website-only]').forEach(link => { link.hidden = true; });
    document.getElementById('offline-note').hidden = false;
  }
})();
