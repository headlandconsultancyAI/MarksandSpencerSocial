/*
 * dash-lite: a small stand-in for the data layer the dashboard was first built on.
 * It loads the JSON files in data/, works out the derived tables ("calcs"),
 * and fills every element marked data-draw="name" using the function
 * registered with dash.draw(name, fn). Drawings inside a hidden tab wait
 * until the tab is opened.
 */
(function () {
  const DATASETS = ['linkedin', 'instagram', 'tiktok', 'x', 'accounts'];
  const store = {};      // id -> {status, data}
  const calcs = {};      // id -> {inputs, fn}
  const cache = {};      // id -> {status, data}
  const draws = {};      // name -> fn or {mount, update, unmount}
  const mounted = new WeakMap();
  let scheduled = false;

  DATASETS.forEach((id) => { store[id] = { status: 'loading', data: [] }; });

  function data(id) {
    if (store[id]) return store[id];
    if (cache[id]) return cache[id];
    const c = calcs[id];
    if (!c) return { status: 'missing', data: null };
    const ins = c.inputs.map(data);
    if (ins.some((d) => d.status === 'error')) return (cache[id] = { status: 'error', data: null });
    if (ins.some((d) => d.status !== 'ok')) return { status: 'loading', data: null };
    try {
      cache[id] = { status: 'ok', data: c.fn(...ins.map((d) => d.data)) };
    } catch (e) {
      console.error('calc ' + id + ' failed', e);
      cache[id] = { status: 'error', data: null, message: String(e) };
    }
    return cache[id];
  }

  function runDraws() {
    scheduled = false;
    Object.keys(draws).forEach((name) => {
      document.querySelectorAll('[data-draw="' + name + '"]').forEach((el) => {
        if (el.closest('[hidden]')) return;
        const d = draws[name];
        try {
          if (typeof d === 'function') d(el);
          else {
            if (!mounted.has(el)) mounted.set(el, d.mount ? d.mount(el) : undefined);
            if (d.update) d.update(el, mounted.get(el));
          }
        } catch (e) { console.error('drawing ' + name + ' failed', e); }
      });
    });
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(runDraws); } }

  window.dash = {
    colors: ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'],
    calc(id, opts) { calcs[id] = opts; },
    loader() {},
    draw(name, fn) { if (fn) draws[name] = fn; schedule(); },
    data,
    onData(fn) { try { fn(); } catch (e) { console.error(e); } },
    params() { return {}; },
    setParams() {}, resetParams() {}, refresh() {},
    setLink(name) { try { history.replaceState(null, '', '#' + name); } catch (e) { /* ignore */ } },
  };

  function load() {
    DATASETS.forEach((id) => {
      fetch('data/' + id + '.json', { cache: 'no-cache' })
        .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then((rows) => { store[id] = { status: 'ok', data: rows }; })
        .catch((e) => { console.error('could not load ' + id, e); store[id] = { status: 'error', data: [] }; })
        .finally(() => { Object.keys(cache).forEach((k) => delete cache[k]); schedule(); });
    });
  }

  // Redraw when a tab is shown (its hidden attribute comes off) and when the width changes.
  document.addEventListener('DOMContentLoaded', () => {
    // Only tab panels count: tooltips also toggle hidden and mustn't trigger a redraw.
    new MutationObserver((ms) => { if (ms.some((m) => m.target.matches && m.target.matches('[role="tabpanel"]'))) schedule(); })
      .observe(document.body, { attributes: true, attributeFilter: ['hidden'], subtree: true });
    let w = window.innerWidth;
    window.addEventListener('resize', () => { if (window.innerWidth !== w) { w = window.innerWidth; schedule(); } });
    load();
    schedule();
  });
})();
