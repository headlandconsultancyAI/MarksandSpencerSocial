// Tab switching and printing.
(function () {
  const tabs = Array.from(document.querySelectorAll('.ms-tab'));
  const open = (id) => {
    const target = document.getElementById(id);
    if (!target) return;
    tabs.forEach((t) => {
      const on = t.getAttribute('data-tab') === id;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      const panel = document.getElementById(t.getAttribute('data-tab'));
      if (panel) panel.hidden = !on;
    });
    dash.setLink(id);
  };
  tabs.forEach((t) => t.addEventListener('click', () => { if (!t.disabled) open(t.getAttribute('data-tab')); }));
  const h = (location.hash || '').replace('#', '');
  const fromHash = tabs.find((t) => t.getAttribute('data-tab') === h && !t.disabled);
  if (fromHash) open(h);
  // Print every live tab, not just the open one.
  let printed = [];
  window.addEventListener('beforeprint', () => {
    printed = tabs.filter((t) => !t.disabled).map((t) => document.getElementById(t.getAttribute('data-tab'))).filter((p) => p && p.hidden);
    printed.forEach((p) => { p.hidden = false; });
  });
  window.addEventListener('afterprint', () => { printed.forEach((p) => { p.hidden = true; }); printed = []; });
})();
