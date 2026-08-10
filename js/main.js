// ---------- Load shared header/footer partials ----------
async function loadPartial(placeholderId, url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load ' + url);
    document.getElementById(placeholderId).outerHTML = await res.text();
  } catch (err) {
    console.error(err);
  }
}
loadPartial('header-placeholder', '/partials/header.html');
loadPartial('footer-placeholder', '/partials/footer.html');

// ---------- Fade in sections as they scroll into view ----------
(function () {
  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var sections = document.querySelectorAll('.fade-section');

  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    sections.forEach(function (el) { el.classList.add('is-visible'); });
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  sections.forEach(function (el) { observer.observe(el); });
})();

// ---------- Musician search filter (only runs if the search box exists) ----------
(function () {
  var input = document.getElementById('musician-search');
  var grid = document.getElementById('musician-grid');
  if (!input || !grid) return;

  var cards = grid.querySelectorAll('.channel');
  var emptyMsg = document.getElementById('musician-search-empty');

  input.addEventListener('input', function () {
    var term = input.value.trim().toLowerCase();
    var visibleCount = 0;

    cards.forEach(function (card) {
      var match = card.textContent.toLowerCase().indexOf(term) !== -1;
      card.style.display = match ? '' : 'none';
      if (match) visibleCount++;
    });

    if (emptyMsg) emptyMsg.style.display = visibleCount === 0 ? 'block' : 'none';
  });
})();
