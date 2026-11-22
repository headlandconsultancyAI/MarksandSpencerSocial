// Corporate social tab.
(function () {
const CH = ['LinkedIn', 'Instagram', 'X'];
const KEY = { LinkedIn: 'linkedin', Instagram: 'instagram', X: 'x' };
const LEFT_OUT = new Set(['Other', 'No caption']);
const FORMATS = ['Video', 'Carousel', 'Image', 'Text', 'Article'];
const round1 = (v) => Math.round(v * 10) / 10;
const eng = (p) => +p.engagements || 0;

// Channel colours come from the dashboard's series colours.
document.querySelectorAll('.cs').forEach((el) => {
  (dash.colors || []).slice(0, 3).forEach((c, i) => el.style.setProperty('--cs-col-' + i, c));
});

dash.calc('cs_posts', {
  inputs: ['linkedin', 'instagram', 'x'],
  title: 'Corporate channel posts',
  description: 'Posts by the M&S corporate accounts on LinkedIn, Instagram and X.',
  fn: (linkedin, instagram, x) => [...linkedin, ...instagram, ...x].filter((p) => p.account_type === 'Corporate'),
});

dash.calc('cs_channels', {
  inputs: ['cs_posts'],
  title: 'Corporate channels at a glance',
  description: 'Posts, engagements, engagements per post, posts a week, most posted theme and best format (most engagement per post, three posts or more) for each corporate channel.',
  fn: (posts) => CH.map((platform) => {
    const ps = posts.filter((p) => p.platform === platform);
    if (!ps.length) return null;
    const total = d3.sum(ps, eng);
    const days = (d3.max(ps, (p) => +new Date(p.date)) - d3.min(ps, (p) => +new Date(p.date))) / 864e5 + 1;
    const themes = d3.rollups(ps.filter((p) => !LEFT_OUT.has(p.theme)), (v) => v.length, (p) => p.theme).sort((a, b) => b[1] - a[1]);
    const formats = d3.rollups(ps, (v) => ({ n: v.length, per: d3.sum(v, eng) / v.length }), (p) => p.format)
      .filter((f) => f[1].n >= 3).sort((a, b) => b[1].per - a[1].per);
    return {
      platform, posts: ps.length, engagements: total, per_post: Math.round(total / ps.length),
      per_week: round1(ps.length / (days / 7)),
      top_theme: themes.length ? themes[0][0] : '', top_theme_share: themes.length ? Math.round(100 * themes[0][1] / ps.length) : 0,
      best_format: formats.length ? formats[0][0] : '',
    };
  }).filter(Boolean),
});

dash.calc('cs_theme_mix', {
  inputs: ['cs_posts'],
  title: 'Theme mix',
  description: `Each theme's share of all corporate posts, and of each channel's posts. Posts with no caption or no clear theme are left out of the list but kept in the totals.`,
  fn: (posts) => {
    const n = posts.length || 1;
    const byCh = d3.rollup(posts, (v) => v.length, (p) => p.platform);
    return d3.rollups(posts.filter((p) => !LEFT_OUT.has(p.theme)), (v) => v, (p) => p.theme).map(([theme, ps]) => {
      const r = { theme, posts: ps.length, share: Math.round(100 * ps.length / n) };
      CH.forEach((c) => { r[KEY[c] + '_share'] = byCh.get(c) ? Math.round(100 * ps.filter((p) => p.platform === c).length / byCh.get(c)) : 0; });
      return r;
    }).sort((a, b) => b.posts - a.posts);
  },
});

// Index: a theme's engagements against what the same number of average posts on the same channels would get.
dash.calc('cs_theme_index', {
  inputs: ['cs_posts'],
  title: 'Engagement by theme against channel average',
  description: `For each theme, on each channel and all together: posts, engagements, engagements per post, and engagements as a multiple of the same number of average posts on the same channels (1 means average).`,
  fn: (posts) => {
    const avg = d3.rollup(posts, (v) => d3.sum(v, eng) / v.length, (p) => p.platform);
    const out = [];
    d3.groups(posts.filter((p) => !LEFT_OUT.has(p.theme)), (p) => p.theme).forEach(([theme, ps]) => {
      const add = (platform, rows) => {
        const e = d3.sum(rows, eng);
        const expected = d3.sum(rows, (p) => avg.get(p.platform) || 0);
        out.push({ theme, platform, posts: rows.length, engagements: e, per_post: Math.round(e / rows.length), index: expected ? round1(e / expected) : 0 });
      };
      add('All channels', ps);
      CH.forEach((c) => { const rows = ps.filter((p) => p.platform === c); if (rows.length) add(c, rows); });
    });
    return out;
  },
});

dash.calc('cs_format_index', {
  inputs: ['cs_posts'],
  title: 'Engagement by format against channel average',
  description: `For each post format, and for reposts with commentary: how many posts there were on each channel, and their engagements per post as a multiple of that channel's average post. Reposts also count in their format row.`,
  fn: (posts) => {
    const avg = d3.rollup(posts, (v) => d3.sum(v, eng) / v.length, (p) => p.platform);
    const rows = FORMATS.map((format) => {
      const r = { format };
      let any = false;
      CH.forEach((c) => {
        const ps = posts.filter((p) => p.platform === c && p.format === format);
        r[KEY[c] + '_posts'] = ps.length;
        r[KEY[c] + '_index'] = ps.length && avg.get(c) ? round1(d3.sum(ps, eng) / ps.length / avg.get(c)) : null;
        if (ps.length) any = true;
      });
      return any ? r : null;
    }).filter(Boolean);
    const rep = { format: 'Repost' };
    CH.forEach((c) => {
      const ps = posts.filter((p) => p.platform === c && (p.repost === true || p.repost === 'true'));
      rep[KEY[c] + '_posts'] = ps.length;
      rep[KEY[c] + '_index'] = ps.length && avg.get(c) ? round1(d3.sum(ps, eng) / ps.length / avg.get(c)) : null;
    });
    return rep.linkedin_posts || rep.instagram_posts || rep.x_posts ? [...rows, rep] : rows;
  },
});

dash.calc('cs_top_posts', {
  inputs: ['cs_posts'],
  title: 'Most engaging corporate posts',
  description: 'The three posts with the most engagements on each corporate channel.',
  fn: (posts) => CH.flatMap((c) => posts.filter((p) => p.platform === c).sort((a, b) => eng(b) - eng(a)).slice(0, 3)
    .map((p, i) => ({ post_id: p.post_id, platform: c, rank: i + 1, engagements: eng(p), theme: p.theme, format: p.format, date: p.date, excerpt: p.excerpt, url: p.url }))),
});

dash.calc('cs_summary', {
  inputs: ['cs_posts', 'cs_theme_mix', 'cs_theme_index'],
  title: 'Corporate social summary',
  description: 'Posts covered, date range, most posted theme, and the themes (ten posts or more) that earn the most and least against the channel average.',
  fn: (posts, mix, index) => {
    const all = index.filter((r) => r.platform === 'All channels');
    const big = all.filter((r) => r.posts >= 10).sort((a, b) => b.index - a.index);
    const best = all.filter((r) => r.posts >= 5).sort((a, b) => b.index - a.index)[0];
    const low = big[big.length - 1];
    return [{
      posts: posts.length, first_date: d3.min(posts, (p) => p.date), last_date: d3.max(posts, (p) => p.date),
      top_mix: mix.length ? mix[0].theme : '', top_mix_share: mix.length ? mix[0].share : 0,
      top_idx: best ? best.theme : '', top_idx_value: best ? best.index : 0,
      low_idx: low ? low.theme : '', low_idx_value: low ? low.index : 0,
    }];
  },
});

// ---- drawing helpers ----
const fmt = d3.format(',');
const fmtX = (v) => (v == null ? '' : d3.format('.1f')(v) + '×');
const fmtDate = (s) => (s ? d3.utcFormat('%-d %b %Y')(new Date(s + 'T00:00:00Z')) : null);
const enc = (v) => String(v).replace(/%/g, '%25').replace(/&/g, '%26').replace(/=/g, '%3D');
const safeUrl = (u) => (/^https?:[/][/]/i.test(u || '') ? u : null);
const rowsOf = (id) => { const d = dash.data(id); return d.status === 'ok' && Array.isArray(d.data) ? d.data : null; };
const mk = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const mark = (n, s, f, w) => { n.setAttribute('data-source', s); n.setAttribute('data-field', f); if (w) n.setAttribute('data-where', w); return n; };
const colorOf = (c) => ({ LinkedIn: 'var(--cs-li)', Instagram: 'var(--cs-ig)', X: 'var(--cs-x)' })[c];

function text(name, source, pick) {
  dash.draw(name, (el) => {
    const st = dash.data(source).status;
    const rows = rowsOf(source);
    let v = null;
    if (rows) { try { v = pick(rows, el); } catch (e) { v = null; } }
    el.textContent = v == null || v === '' ? '—' : String(v);
    el.classList.toggle('dash-skeleton', st === 'loading');
  });
}
const chRow = (rows, el) => rows.find((r) => r.platform === el.getAttribute('data-platform'));
text('cs_top_mix', 'cs_summary', (r) => r[0].top_mix);
text('cs_top_mix_share', 'cs_summary', (r) => r[0].top_mix_share + '%');
text('cs_top_idx', 'cs_summary', (r) => r[0].top_idx);
text('cs_top_idx_value', 'cs_summary', (r) => fmtX(r[0].top_idx_value));
text('cs_low_idx', 'cs_summary', (r) => r[0].low_idx);
text('cs_low_idx_value', 'cs_summary', (r) => fmtX(r[0].low_idx_value));
text('cs_n', 'cs_summary', (r) => fmt(r[0].posts));
text('cs_first', 'cs_summary', (r) => fmtDate(r[0].first_date));
text('cs_last', 'cs_summary', (r) => fmtDate(r[0].last_date));
text('cs_ch_per_post', 'cs_channels', (r, el) => fmt(chRow(r, el).per_post));
text('cs_ch_posts', 'cs_channels', (r, el) => fmt(chRow(r, el).posts));
text('cs_ch_week', 'cs_channels', (r, el) => d3.format('.1f')(chRow(r, el).per_week));
text('cs_ch_eng', 'cs_channels', (r, el) => fmt(chRow(r, el).engagements));
text('cs_ch_theme', 'cs_channels', (r, el) => chRow(r, el).top_theme);
text('cs_ch_format', 'cs_channels', (r, el) => chRow(r, el).best_format);

dash.draw('cs_mix', (el) => {
  const st = dash.data('cs_theme_mix').status;
  const rows = rowsOf('cs_theme_mix');
  el.replaceChildren();
  el.classList.toggle('dash-skeleton', st === 'loading');
  if (st === 'error') { el.append(mk('p', 'cs-help', `The theme data didn't load.`)); return; }
  if (!rows) { el.textContent = '—'; return; }
  const max = d3.max(rows, (r) => r.share) || 1;
  rows.forEach((r) => {
    const w = 'theme=' + enc(r.theme);
    const row = mk('div', 'cs-mix-row');
    row.id = 'cs-mix-' + r.theme.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    row.append(mark(mk('span', 'cs-mix-name', r.theme), 'cs_theme_mix', 'theme', w));
    const track = mk('div', 'cs-mix-track');
    track.setAttribute('role', 'img');
    track.setAttribute('aria-label', r.theme + ': ' + r.share + '% of corporate posts');
    const pct = 100 * r.share / max * 0.82;
    const bar = mk('div', 'cs-mix-bar'); bar.style.width = pct + '%';
    const val = mark(mk('span', 'cs-mix-val', r.share + '%'), 'cs_theme_mix', 'share', w); val.style.left = pct + '%';
    track.append(bar, val);
    row.append(track);
    CH.forEach((c) => row.append(mark(mk('span', 'cs-mix-cell', r[KEY[c] + '_share'] + '%'), 'cs_theme_mix', KEY[c] + '_share', w)));
    el.append(row);
  });
});

dash.draw('cs_dots', (el) => {
  const st = dash.data('cs_theme_index').status;
  const rows = rowsOf('cs_theme_index');
  el.replaceChildren();
  el.classList.toggle('dash-skeleton', st === 'loading');
  if (st === 'error') { el.append(mk('p', 'cs-help', `The engagement data didn't load.`)); return; }
  if (!rows) { el.textContent = '—'; return; }
  const all = rows.filter((r) => r.platform === 'All channels').sort((a, b) => b.index - a.index);
  const dots = rows.filter((r) => r.platform !== 'All channels' && r.posts >= 3 && r.index > 0);
  const W = Math.max(el.clientWidth, 300), rowH = 34, top = 26, bottom = 8;
  const H = top + all.length * rowH + bottom;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
    .attr('role', 'img').attr('aria-label', 'Dot chart of engagement for each theme as a multiple of the channel average post, by channel');
  // measure label width
  const probe = svg.append('text').attr('font-size', 13);
  let lw = 0; all.forEach((r) => { probe.text(r.theme); lw = Math.max(lw, probe.node().getComputedTextLength()); });
  probe.remove();
  const left = Math.min(lw + 14, W * 0.42), right = 34;
  const vals = [...dots.map((d) => d.index), ...all.map((d) => d.index), 1].filter((v) => v > 0);
  const x = d3.scaleLog().domain([Math.min(0.1, d3.min(vals) * 0.9), Math.max(2, d3.max(vals) * 1.1)]).range([left, W - right]);
  const y = (i) => top + i * rowH + rowH / 2;
  const ticks = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50].filter((t) => t >= x.domain()[0] && t <= x.domain()[1]);
  const g = svg.append('g').attr('class', 'cs-axis');
  ticks.forEach((t) => {
    g.append('line').attr('x1', x(t)).attr('x2', x(t)).attr('y1', top - 4).attr('y2', H - bottom)
      .style('stroke', t === 1 ? 'var(--cds-chart-reference)' : 'var(--cds-chart-grid)').style('stroke-width', t === 1 ? 1.5 : 1);
    g.append('text').attr('x', x(t)).attr('y', top - 10).attr('text-anchor', 'middle').text(t + '×');
  });
  all.forEach((r, i) => {
    svg.append('line').attr('x1', left).attr('x2', W - right).attr('y1', y(i)).attr('y2', y(i)).style('stroke', 'var(--cds-chart-grid)');
    svg.append('text').attr('x', left - 10).attr('y', y(i)).attr('dy', '0.35em').attr('text-anchor', 'end').attr('font-size', 13)
      .style('fill', 'var(--color-fg)').text(r.theme);
  });
  const tip = mk('div', 'cs-tip'); tip.hidden = true; el.append(tip);
  const show = (ev, r) => {
    tip.replaceChildren(mk('b', null, r.theme + ' · ' + r.platform), mk('br'), mk('span', null, fmtX(r.index) + ' a typical post · ' + fmt(r.posts) + ' posts · ' + fmt(r.per_post) + ' per post'));
    tip.hidden = false;
    const b = el.getBoundingClientRect();
    const px = ev.clientX - b.left, py = ev.clientY - b.top;
    tip.style.left = Math.min(Math.max(px - tip.offsetWidth / 2, 0), b.width - tip.offsetWidth) + 'px';
    tip.style.top = Math.max(py - tip.offsetHeight - 12, 0) + 'px';
  };
  const hide = () => { tip.hidden = true; };
  const order = new Map(all.map((r, i) => [r.theme, i]));
  all.forEach((r, i) => {
    svg.append('rect').attr('x', x(r.index) - 2).attr('y', y(i) - 10).attr('width', 4).attr('height', 20).style('fill', 'var(--color-fg)')
      .on('mousemove', (ev) => show(ev, r)).on('mouseleave', hide);
  });
  dots.forEach((r) => {
    if (!order.has(r.theme)) return;
    const j = CH.indexOf(r.platform);
    svg.append('circle').attr('cx', x(r.index)).attr('cy', y(order.get(r.theme)) + (j - 1) * 5).attr('r', 6)
      .style('fill', colorOf(r.platform)).style('stroke', 'var(--color-bg)').style('stroke-width', 1.5).style('cursor', 'default')
      .on('mousemove', (ev) => show(ev, r)).on('mouseleave', hide);
  });
});

dash.draw('cs_format_rows', (tbody) => {
  const st = dash.data('cs_format_index').status;
  const rows = rowsOf('cs_format_index');
  tbody.replaceChildren();
  if (st === 'error') { const tr = mk('tr'); const td = mk('td', null, `Format data didn't load.`); td.colSpan = 4; tr.append(td); tbody.append(tr); return; }
  if (!rows) return;
  rows.forEach((r) => {
    const tr = mk('tr');
    if (r.format === 'Repost') tr.className = 'cs-fmt-repost';
    tr.append(mk('td', null, r.format === 'Repost' ? 'Reposts' : r.format));
    CH.forEach((c) => {
      const v = r[KEY[c] + '_index'], n = r[KEY[c] + '_posts'];
      const td = mk('td', 'cs-fc');
      if (v == null) { td.classList.add('cs-none'); td.textContent = 'Not used'; }
      else {
        const strength = Math.min(Math.abs(Math.log2(v)) / 1.6, 1) * 45;
        td.style.background = 'color-mix(in srgb, ' + (v >= 1 ? 'var(--color-ok)' : 'var(--color-bad)') + ' ' + Math.round(strength) + '%, transparent)';
        const w = 'format=' + enc(r.format);
        const sm = mk('small');
        sm.append(mark(mk('span', null, fmt(n)), 'cs_format_index', KEY[c] + '_posts', w), document.createTextNode(n === 1 ? ' post' : ' posts'));
        td.append(mark(mk('span', null, fmtX(v)), 'cs_format_index', KEY[c] + '_index', w), sm);
      }
      tr.append(td);
    });
    tbody.append(tr);
  });
});

dash.draw('cs_top', (el) => {
  const st = dash.data('cs_top_posts').status;
  const rows = rowsOf('cs_top_posts');
  const platform = el.getAttribute('data-platform');
  el.replaceChildren();
  el.classList.toggle('dash-skeleton', st === 'loading');
  if (st === 'error') { el.append(mk('li', 'cs-help', `The post data didn't load.`)); return; }
  if (!rows) return;
  rows.filter((r) => r.platform === platform).forEach((r) => {
    const w = 'post_id=' + enc(r.post_id);
    const li = mk('li', 'cs-top-item');
    const head = mk('span', 'cs-top-meta');
    head.append(mark(mk('span', 'cs-top-eng', fmt(r.engagements)), 'cs_top_posts', 'engagements', w), document.createTextNode(' engagements'));
    li.append(head);
    const meta = mk('span', 'cs-top-meta');
    meta.append(mark(mk('span', null, r.theme), 'cs_top_posts', 'theme', w), document.createTextNode(' · '),
      mark(mk('span', null, r.format), 'cs_top_posts', 'format', w), document.createTextNode(' · '),
      mark(mk('span', null, fmtDate(r.date)), 'cs_top_posts', 'date', w));
    li.append(meta);
    li.append(mark(mk('p', 'cs-top-text', r.excerpt || 'No caption'), 'cs_top_posts', 'excerpt', w));
    const u = safeUrl(r.url);
    if (u) { const a = mk('a', null, 'Open the post'); a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer'; li.append(a); }
    el.append(li);
  });
});
})();
