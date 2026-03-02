/* ===== Admin Hash Router ===== */

const routes = new Map();

export function registerRoute(hash, renderFn) {
  routes.set(hash, renderFn);
}

export function navigate(hash) {
  window.location.hash = hash;
}

export function initRouter(container, navContainer) {
  function onHashChange() {
    const hash = window.location.hash || '#/dashboard';
    const renderFn = routes.get(hash) || routes.get('#/dashboard');
    navContainer.querySelectorAll('.adm-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.route === hash);
    });
    container.innerHTML = '';
    if (renderFn) renderFn(container);
  }
  window.addEventListener('hashchange', onHashChange);
  onHashChange();
}
