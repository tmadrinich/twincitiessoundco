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
