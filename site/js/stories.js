// Corporate and brand crossover tab.
(function () {
// Shared stories tab: corporate channels against the M&S brand Instagram accounts.
const SIDES = { Corporate: 'Corporate channels', Brand: 'Brand channels' };
const ssEng = (p) => +p.engagements || 0;
const ssRound1 = (v) => Math.round(v * 10) / 10;
const storyList = (p) => String(p.stories || '').split('|').filter(Boolean);

dash.calc('ss_posts', {
  inputs: ['linkedin', 'instagram', 'x'],
  title: 'Corporate and brand channel posts',
  description: `Posts from the corporate channels and the M&S brand Instagram accounts, each with its account's average engagements per post and its engagements as a multiple of that average.`,
  fn: (linkedin, instagram, x) => {
    const rows = [...linkedin, ...instagram, ...x].filter((p) => p.account_type === 'Corporate' || p.account_type === 'Brand');
    const base = d3.rollup(rows, (v) => d3.sum(v, ssEng) / v.length, (p) => p.account_type + '|' + p.platform + '|' + p.account);
    return rows.map((p) => {
      const b = base.get(p.account_type + '|' + p.platform + '|' + p.account) || 0;
      return { post_id: p.post_id, side: SIDES[p.account_type], account: p.account, platform: p.platform, date: p.date, format: p.format,
        stories: p.stories || '', engagements: ssEng(p), account_average: Math.round(b), index: b ? ssRound1(ssEng(p) / b) : 0, excerpt: p.excerpt, url: p.url };
    });
  },
});

dash.calc('ss_stories', {
  inputs: ['ss_posts', 'linkedin', 'instagram', 'x'],
  title: 'Stories on each side',
  description: `For each tracked story: how many corporate and brand posts carry it, and their engagements as a multiple of what the same number of average posts on the same accounts would get (1 means average).`,
  fn: (posts, linkedin, instagram, x) => {
    const base = d3.rollup([...linkedin, ...instagram, ...x].filter((p) => p.account_type === 'Corporate' || p.account_type === 'Brand'),
      (v) => d3.sum(v, ssEng) / v.length, (p) => p.platform + '|' + p.account);
    const m = new Map();
    posts.forEach((p) => storyList(p).forEach((s) => {
      if (!m.has(s)) m.set(s, { story: s, c: [0, 0, 0], b: [0, 0, 0] });
      const a = m.get(s)[p.side === SIDES.Corporate ? 'c' : 'b'];
      a[0] += 1; a[1] += p.engagements; a[2] += base.get(p.platform + '|' + p.account) || 0;
    }));
    return Array.from(m.values()).map((r) => ({
      story: r.story,
      corporate_posts: r.c[0], brand_posts: r.b[0],
      corporate_index: r.c[2] ? ssRound1(r.c[1] / r.c[2]) : null,
      brand_index: r.b[2] ? ssRound1(r.b[1] / r.b[2]) : null,
    })).sort((a, b) => (b.corporate_posts - a.corporate_posts) || (b.brand_posts - a.brand_posts));
  },
});

dash.calc('ss_sides', {
  inputs: ['ss_posts'],
  title: 'Each side at a glance',
  description: 'Posts, engagements per post and the share of posts carrying a tracked story, for the corporate channels together and for each brand account.',
  fn: (posts) => [['Corporate channels', (p) => p.side === SIDES.Corporate], ['M&S', (p) => p.account === 'M&S'], ['M&S Food', (p) => p.account === 'M&S Food']]
    .map(([group, test]) => {
      const ps = posts.filter(test);
      if (!ps.length) return null;
      return { group, posts: ps.length, per_post: Math.round(d3.sum(ps, (p) => p.engagements) / ps.length),
        story_share: Math.round(100 * ps.filter((p) => p.stories).length / ps.length), first_date: d3.min(ps, (p) => p.date) };
    }).filter(Boolean),
});

dash.calc('ss_top_brand', {
  inputs: ['ss_posts'],
  title: 'Brand posts that carried a corporate story best',
  description: 'The six brand posts carrying a tracked story with the most engagements against their own account average.',
  fn: (posts) => posts.filter((p) => p.side === SIDES.Brand && p.stories).sort((a, b) => b.index - a.index).slice(0, 6)
    .map((p, i) => ({ rank: i + 1, post_id: p.post_id, account: p.account, stories: p.stories.split('|').join(', '), engagements: p.engagements, index: p.index, date: p.date, format: p.format, excerpt: p.excerpt, url: p.url })),
});

dash.calc('ss_summary', {
  inputs: ['ss_stories', 'ss_sides'],
  title: 'Shared stories summary',
  description: 'How many tracked stories appear on both sides, and which story (five brand posts or more) does best and worst on the brand channels against a typical post there.',
  fn: (stories, sides) => {
    const both = stories.filter((s) => s.corporate_posts > 0 && s.brand_posts > 0);
    const ranked = stories.filter((s) => s.brand_posts >= 5 && s.brand_index != null).sort((a, b) => b.brand_index - a.brand_index);
    const brand = sides.filter((s) => s.group !== 'Corporate channels');
    const corp = sides.find((s) => s.group === 'Corporate channels');
    return [{
      stories: stories.length, both: both.length,
      best: ranked.length ? ranked[0].story : '', best_index: ranked.length ? ranked[0].brand_index : 0,
      worst: ranked.length ? ranked[ranked.length - 1].story : '', worst_index: ranked.length ? ranked[ranked.length - 1].brand_index : 0,
      brand_posts: d3.sum(brand, (s) => s.posts), corporate_posts: corp ? corp.posts : 0,
    }];
  },
});

// ---- drawing ----
const ssFmt = d3.format(',');
const ssX = (v) => (v == null ? '' : d3.format('.1f')(v) + '×');
const ssDate = (s) => (s ? d3.utcFormat('%-d %b %Y')(new Date(s + 'T00:00:00Z')) : null);
const ssEnc = (v) => String(v).replace(/%/g, '%25').replace(/&/g, '%26').replace(/=/g, '%3D');
const ssRows = (id) => { const d = dash.data(id); return d.status === 'ok' && Array.isArray(d.data) ? d.data : null; };
const ssMk = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const ssMark = (n, s, f, w) => { n.setAttribute('data-source', s); n.setAttribute('data-field', f); if (w) n.setAttribute('data-where', w); return n; };
const ssSafe = (u) => (/^https?:[/][/]/i.test(u || '') ? u : null);

function ssText(name, source, pick) {
  dash.draw(name, (el) => {
    const st = dash.data(source).status;
    const rows = ssRows(source);
    let v = null;
    if (rows) { try { v = pick(rows, el); } catch (e) { v = null; } }
    el.textContent = v == null || v === '' ? '—' : String(v);
    el.classList.toggle('dash-skeleton', st === 'loading');
  });
}
const sideRow = (rows, el) => rows.find((r) => r.group === el.getAttribute('data-group'));
ssText('ss_both', 'ss_summary', (r) => r[0].both);
ssText('ss_total', 'ss_summary', (r) => r[0].stories);
ssText('ss_best', 'ss_summary', (r) => r[0].best);
ssText('ss_best_index', 'ss_summary', (r) => ssX(r[0].best_index));
ssText('ss_worst', 'ss_summary', (r) => r[0].worst);
ssText('ss_worst_index', 'ss_summary', (r) => ssX(r[0].worst_index));
ssText('ss_brand_n', 'ss_summary', (r) => ssFmt(r[0].brand_posts));
ssText('ss_corp_n', 'ss_summary', (r) => ssFmt(r[0].corporate_posts));

dash.draw('ss_butterfly', (el) => {
  const st = dash.data('ss_stories').status;
  const rows = ssRows('ss_stories');
  el.replaceChildren();
  el.classList.toggle('dash-skeleton', st === 'loading');
  if (st === 'error') { el.append(ssMk('p', 'cs-help', `The story data didn't load.`)); return; }
  if (!rows) { el.textContent = '—'; return; }
  const max = d3.max(rows, (r) => Math.max(r.corporate_posts, r.brand_posts)) || 1;
  rows.forEach((r) => {
    const w = 'story=' + ssEnc(r.story);
    const row = ssMk('div', 'ss-fly-row');
    row.id = 'ss-story-' + r.story.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    row.setAttribute('role', 'img');
    row.setAttribute('aria-label', r.story + ': ' + r.corporate_posts + ' corporate posts, ' + r.brand_posts + ' brand posts');
    const left = ssMk('div', 'ss-fly-side ss-fly-left');
    const lb = ssMk('span', 'ss-fly-bar ss-corp'); lb.style.width = (85 * r.corporate_posts / max) + '%';
    left.append(ssMark(ssMk('span', 'ss-fly-val', ssFmt(r.corporate_posts)), 'ss_stories', 'corporate_posts', w), lb);
    const name = ssMark(ssMk('span', 'ss-fly-name', r.story), 'ss_stories', 'story', w);
    const right = ssMk('div', 'ss-fly-side ss-fly-right');
    const rb = ssMk('span', 'ss-fly-bar ss-brand'); rb.style.width = (85 * r.brand_posts / max) + '%';
    right.append(rb, ssMark(ssMk('span', 'ss-fly-val', ssFmt(r.brand_posts)), 'ss_stories', 'brand_posts', w));
    if (!r.brand_posts || !r.corporate_posts) row.classList.add('ss-one-side');
    row.append(left, name, right);
    el.append(row);
  });
});

dash.draw('ss_dots', (el) => {
  const st = dash.data('ss_stories').status;
  const rows = ssRows('ss_stories');
  el.replaceChildren();
  el.classList.toggle('dash-skeleton', st === 'loading');
  if (st === 'error') { el.append(ssMk('p', 'cs-help', `The story data didn't load.`)); return; }
  if (!rows) { el.textContent = '—'; return; }
  const pts = [];
  rows.forEach((r) => {
    if (r.corporate_posts >= 3 && r.corporate_index > 0) pts.push({ story: r.story, side: 'Corporate channels', index: r.corporate_index, posts: r.corporate_posts });
    if (r.brand_posts >= 3 && r.brand_index > 0) pts.push({ story: r.story, side: 'Brand channels', index: r.brand_index, posts: r.brand_posts });
  });
  const order = rows.filter((r) => pts.some((p) => p.story === r.story))
    .sort((a, b) => ((b.brand_posts >= 3 ? b.brand_index : -1) - (a.brand_posts >= 3 ? a.brand_index : -1)) || (b.corporate_index - a.corporate_index));
  const W = Math.max(el.clientWidth, 300), rowH = 30, top = 26, bottom = 8;
  const H = top + order.length * rowH + bottom;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
    .attr('role', 'img').attr('aria-label', 'Dot chart of how each story performs on the corporate and brand channels, as a multiple of a typical post');
  const probe = svg.append('text').attr('font-size', 13);
  let lw = 0; order.forEach((r) => { probe.text(r.story); lw = Math.max(lw, probe.node().getComputedTextLength()); });
  probe.remove();
  const left = Math.min(lw + 14, W * 0.45), right = 30;
  const vals = [...pts.map((p) => p.index), 1];
  const x = d3.scaleLog().domain([Math.min(0.1, d3.min(vals) * 0.9), Math.max(2, d3.max(vals) * 1.1)]).range([left, W - right]);
  const y = (i) => top + i * rowH + rowH / 2;
  const g = svg.append('g').attr('class', 'cs-axis');
  [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50].filter((t) => t >= x.domain()[0] && t <= x.domain()[1]).forEach((t) => {
    g.append('line').attr('x1', x(t)).attr('x2', x(t)).attr('y1', top - 4).attr('y2', H - bottom)
      .style('stroke', t === 1 ? 'var(--cds-chart-reference)' : 'var(--cds-chart-grid)').style('stroke-width', t === 1 ? 1.5 : 1);
    g.append('text').attr('x', x(t)).attr('y', top - 10).attr('text-anchor', 'middle').text(t + '×');
  });
  const pos = new Map(order.map((r, i) => [r.story, i]));
  order.forEach((r, i) => {
    svg.append('line').attr('x1', left).attr('x2', W - right).attr('y1', y(i)).attr('y2', y(i)).style('stroke', 'var(--cds-chart-grid)');
    svg.append('text').attr('x', left - 10).attr('y', y(i)).attr('dy', '0.35em').attr('text-anchor', 'end').attr('font-size', 13).style('fill', 'var(--color-fg)').text(r.story);
    const c = pts.find((p) => p.story === r.story && p.side === 'Corporate channels');
    const b = pts.find((p) => p.story === r.story && p.side === 'Brand channels');
    if (c && b) svg.append('line').attr('x1', x(c.index)).attr('x2', x(b.index)).attr('y1', y(i)).attr('y2', y(i)).style('stroke', 'var(--cds-chart-axis)').style('stroke-width', 2);
  });
  const tip = ssMk('div', 'cs-tip'); tip.hidden = true; el.append(tip);
  const show = (ev, p) => {
    tip.replaceChildren(ssMk('b', null, p.story + ' · ' + p.side), ssMk('br'), ssMk('span', null, ssX(p.index) + ' a typical post · ' + ssFmt(p.posts) + ' posts'));
    tip.hidden = false;
    const bb = el.getBoundingClientRect();
    tip.style.left = Math.min(Math.max(ev.clientX - bb.left - tip.offsetWidth / 2, 0), bb.width - tip.offsetWidth) + 'px';
    tip.style.top = Math.max(ev.clientY - bb.top - tip.offsetHeight - 12, 0) + 'px';
  };
  pts.forEach((p) => {
    svg.append('circle').attr('cx', x(p.index)).attr('cy', y(pos.get(p.story))).attr('r', 6)
      .style('fill', p.side === 'Corporate channels' ? 'var(--color-fg)' : 'var(--cs-li)').style('stroke', 'var(--color-bg)').style('stroke-width', 1.5)
      .on('mousemove', (ev) => show(ev, p)).on('mouseleave', () => { tip.hidden = true; });
  });
});

dash.draw('ss_top', (el) => {
  const st = dash.data('ss_top_brand').status;
  const rows = ssRows('ss_top_brand');
  el.replaceChildren();
  el.classList.toggle('dash-skeleton', st === 'loading');
  if (st === 'error') { el.append(ssMk('li', 'cs-help', `The post data didn't load.`)); return; }
  if (!rows) return;
  rows.forEach((r) => {
    const w = 'post_id=' + ssEnc(r.post_id);
    const li = ssMk('li', 'cs-top-item');
    const head = ssMk('span', 'cs-top-meta');
    head.append(ssMark(ssMk('span', 'cs-top-eng', ssX(r.index)), 'ss_top_brand', 'index', w), document.createTextNode(' its account average · '),
      ssMark(ssMk('span', null, ssFmt(r.engagements)), 'ss_top_brand', 'engagements', w), document.createTextNode(' engagements'));
    li.append(head);
    const meta = ssMk('span', 'cs-top-meta');
    meta.append(ssMark(ssMk('span', null, r.account), 'ss_top_brand', 'account', w), document.createTextNode(' · '),
      ssMark(ssMk('b', null, r.stories), 'ss_top_brand', 'stories', w), document.createTextNode(' · '),
      ssMark(ssMk('span', null, ssDate(r.date)), 'ss_top_brand', 'date', w));
    li.append(meta);
    li.append(ssMark(ssMk('p', 'cs-top-text', r.excerpt || 'No caption'), 'ss_top_brand', 'excerpt', w));
    const u = ssSafe(r.url);
    if (u) { const a = ssMk('a', null, 'Open the post'); a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer'; li.append(a); }
    el.append(li);
  });
});
})();
