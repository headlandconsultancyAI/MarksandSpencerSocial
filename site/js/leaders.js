// Leadership tab: calcs and drawings.
(function () {
dash.calc('leader_posts', {
  inputs: ['linkedin', 'instagram', 'tiktok'],
  title: 'Leader posts',
  description: 'x',
  fn: (linkedin, instagram, tiktok) => [...linkedin, ...instagram, ...tiktok]
    .filter((p) => p.account_type === 'Leader')
    .map((p) => ({ ...p, leader: p.account })),
});

dash.calc('leader_rank', {
  inputs: ['leader_posts', 'accounts'],
  title: 'Leaders ranked by engagement',
  description: "Each leader's total engagements, strongest platform, most engaging topic, platform crowns and best post.",
  fn: (posts, leaders) => {
    const eng = (p) => +p.engagements || 0;
    const roles = new Map(leaders.filter((l) => l.account_type === 'Leader').map((l) => [l.account, l.role]));
    const crowns = new Map();
    const crown = (leader, label) => { if (!crowns.has(leader)) crowns.set(leader, []); crowns.get(leader).push(label); };
    const platformTotals = d3.rollups(posts, (v) => d3.sum(v, eng), (p) => p.platform, (p) => p.leader);
    const platformPosts = d3.rollups(posts, (v) => v.length, (p) => p.platform, (p) => p.leader);
    platformTotals.forEach(([platform, ls]) => { const top = d3.greatest(ls, (d) => d[1]); crown(top[0], 'Rules ' + platform); });
    platformPosts.forEach(([platform, ls]) => {
      if (ls.length < 2) return;
      const top = d3.greatest(ls, (d) => d[1]);
      if (!(crowns.get(top[0]) || []).includes('Rules ' + platform)) crown(top[0], 'Most active on ' + platform);
    });
    const untagged = new Set(['No caption', 'No clear topic']);
    const rows = d3.groups(posts, (p) => p.leader).map(([leader, ps]) => {
      const total = d3.sum(ps, eng);
      const byPlatform = d3.rollups(ps, (v) => d3.sum(v, eng), (p) => p.platform).sort((a, b) => b[1] - a[1]);
      const byTopic = d3.rollups(ps.filter((p) => !untagged.has(p.topic)), (v) => d3.sum(v, eng), (p) => p.topic).sort((a, b) => b[1] - a[1]);
      const topicTotal = d3.sum(byTopic, (d) => d[1]);
      const best = d3.greatest(ps, eng);
      return {
        leader, role: roles.get(leader) || '', engagements: total, posts: ps.length, per_post: Math.round(total / ps.length),
        best_platform: byPlatform[0][0], best_platform_share: Math.round(100 * byPlatform[0][1] / total),
        top_topic: byTopic.length ? byTopic[0][0] : 'No clear topic',
        top_topic_share: byTopic.length ? Math.round(100 * byTopic[0][1] / topicTotal) : 0,
        badge: (crowns.get(leader) || []).sort().join(' · '),
        best_post_engagements: eng(best), best_post_platform: best.platform, best_post_date: best.date,
        best_post_text: best.excerpt, best_post_url: best.url,
      };
    }).sort((a, b) => b.engagements - a.engagements);
    rows.forEach((r, i) => { r.rank = i + 1; });
    return rows;
  },
});

dash.calc('leader_platform', {
  inputs: ['leader_posts'],
  title: 'Leader by platform',
  description: "Posts, engagements, engagements per post, comments per post and share of the leader's total, for each leader on each platform.",
  fn: (posts) => {
    const totals = d3.rollup(posts, (v) => d3.sum(v, (p) => +p.engagements || 0), (p) => p.leader);
    return d3.rollups(posts, (v) => v, (p) => p.leader, (p) => p.platform).flatMap(([leader, pls]) => pls.map(([platform, ps]) => {
      const e = d3.sum(ps, (p) => +p.engagements || 0);
      const c = d3.sum(ps, (p) => +p.comments || 0);
      return { leader, platform, posts: ps.length, engagements: e, per_post: Math.round(e / ps.length),
        comments_per_post: Math.round(10 * c / ps.length) / 10, share: Math.round(100 * e / (totals.get(leader) || 1)) };
    })).sort((a, b) => (totals.get(b.leader) - totals.get(a.leader)) || (b.engagements - a.engagements));
  },
});

dash.calc('topic_share', {
  inputs: ['leader_posts'],
  title: 'Engagement by topic',
  description: "Each leader's engagements by topic, as a share of their engagement on posts with a clear topic.",
  fn: (posts) => {
    const tagged = posts.filter((p) => p.topic !== 'No caption' && p.topic !== 'No clear topic');
    const totals = d3.rollup(tagged, (v) => d3.sum(v, (p) => +p.engagements || 0), (p) => p.leader);
    return d3.rollups(tagged, (v) => v, (p) => p.leader, (p) => p.topic).flatMap(([leader, ts]) => ts.map(([topic, ps]) => {
      const e = d3.sum(ps, (p) => +p.engagements || 0);
      return { leader, topic, posts: ps.length, engagements: e, share: Math.round(100 * e / (totals.get(leader) || 1)) };
    }));
  },
});
})();

(function () {
const fmt = d3.format(',');
const fmtDate = (s) => (s ? d3.utcFormat('%-d %B %Y')(new Date(s + 'T00:00:00Z')) : null);
const enc = (v) => String(v).replace(/%/g, '%25').replace(/&/g, '%26').replace(/=/g, '%3D');
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);
const rowsOf = (id) => { const d = dash.data(id); return d.status === 'ok' && Array.isArray(d.data) ? d.data : null; };
const mk = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const mark = (n, source, field, where) => { n.setAttribute('data-source', source); n.setAttribute('data-field', field); if (where) n.setAttribute('data-where', where); return n; };

function textDraw(name, source, pick) {
  dash.draw(name, (el) => {
    const st = dash.data(source).status;
    const rows = rowsOf(source);
    let v = null;
    if (rows) { try { v = pick(rows, el); } catch (e) { v = null; } }
    el.textContent = v == null || v === '' ? '—' : String(v);
    el.classList.toggle('dash-skeleton', st === 'loading');
  });
}
dash.draw('leader_cards', (el) => {
  const st = dash.data('leader_rank').status;
  const rows = rowsOf('leader_rank');
  const split = rowsOf('leader_platform') || [];
  el.replaceChildren();
  el.classList.toggle('dash-skeleton', st === 'loading');
  if (st === 'error') { el.append(mk('p', 'ms-note', "The leader data didn't load.")); return; }
  if (!rows) { el.textContent = '—'; return; }
  rows.forEach((r) => {
    const w = 'leader=' + enc(r.leader);
    const card = mk('article', 'ms-card ms-leader');
    card.id = 'leader-' + slug(r.leader);

    const top = mk('div', 'ms-ltop');
    top.append(mark(mk('span', 'ms-rank', r.rank), 'leader_rank', 'rank', w));
    const who = mk('div');
    who.append(mark(mk('h3', 'ms-name', r.leader), 'leader_rank', 'leader', w));
    who.append(mark(mk('p', 'ms-role', r.role), 'leader_rank', 'role', w));
    top.append(who);
    card.append(top);

    if (r.badge) {
      const badges = mark(mk('div', 'ms-badges'), 'leader_rank', 'badge', w);
      r.badge.split(' · ').forEach((b) => badges.append(mk('span', 'ms-badge', b)));
      card.append(badges);
    }

    const stats = mk('div', 'ms-stats');
    [['engagements', 'Engagements', true], ['posts', 'Posts', false], ['per_post', 'Per post', false]].forEach(([f, label, lg]) => {
      const s = mk('div');
      s.append(mark(mk('span', 'ms-stat-v' + (lg ? ' ms-lg' : ''), fmt(r[f])), 'leader_rank', f, w));
      s.append(mk('span', 'ms-stat-l', label));
      stats.append(s);
    });
    card.append(stats);

    const mine = split.filter((s) => s.leader === r.leader).sort((a, b) => b.engagements - a.engagements);
    if (mine.length) {
      const wrap = mk('div', 'ms-barwrap');
      wrap.setAttribute('data-source', 'leader_platform');
      const bar = mk('div', 'ms-bar');
      bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', 'Share of engagement by platform: ' + mine.map((m) => m.platform + ' ' + m.share + '%').join(', '));
      const tip = mk('div', 'ms-tip');
      tip.hidden = true;
      let x = 0;
      mine.forEach((m) => {
        const seg = mk('div', 'ms-seg ms-pl-' + m.platform);
        const pct = Math.max(m.engagements / (r.engagements || 1) * 100, 0);
        seg.style.width = pct + '%';
        const mid = x + pct / 2; x += pct;
        seg.addEventListener('mouseenter', () => { tip.textContent = m.platform + ': ' + fmt(m.engagements) + ' engagements (' + m.share + '%)'; tip.style.left = Math.min(Math.max(mid, 15), 85) + '%'; tip.hidden = false; });
        seg.addEventListener('mouseleave', () => { tip.hidden = true; });
        bar.append(seg);
      });
      const legend = mk('div', 'ms-legend');
      mine.forEach((m) => {
        const item = mk('span');
        item.append(mk('span', 'ms-key ms-pl-' + m.platform));
        item.append(document.createTextNode(m.platform + ' '));
        item.append(mark(mk('span', null, m.share + '%'), 'leader_platform', 'share', 'leader=' + enc(r.leader) + '&platform=' + enc(m.platform)));
        legend.append(item);
      });
      wrap.append(bar, tip, legend);
      card.append(wrap);
    }

    const aspect = mk('p', 'ms-aspect');
    aspect.append(document.createTextNode('Strongest on '));
    aspect.append(mark(mk('b', null, r.best_platform), 'leader_rank', 'best_platform', w));
    aspect.append(document.createTextNode(' ('));
    aspect.append(mark(mk('span', null, r.best_platform_share + '%'), 'leader_rank', 'best_platform_share', w));
    aspect.append(document.createTextNode(' of engagement). Most engaging topic: '));
    aspect.append(mark(mk('b', null, r.top_topic), 'leader_rank', 'top_topic', w));
    aspect.append(document.createTextNode(' ('));
    aspect.append(mark(mk('span', null, r.top_topic_share + '%'), 'leader_rank', 'top_topic_share', w));
    aspect.append(document.createTextNode(').'));
    card.append(aspect);

    const best = mk('div', 'ms-best');
    const meta = mk('span', 'ms-best-meta');
    meta.append(document.createTextNode('Best post: '));
    meta.append(mark(mk('span', null, r.best_post_platform), 'leader_rank', 'best_post_platform', w));
    meta.append(document.createTextNode(', '));
    meta.append(mark(mk('span', null, fmtDate(r.best_post_date)), 'leader_rank', 'best_post_date', w));
    meta.append(document.createTextNode(', '));
    meta.append(mark(mk('span', null, fmt(r.best_post_engagements)), 'leader_rank', 'best_post_engagements', w));
    meta.append(document.createTextNode(' engagements'));
    best.append(meta);
    best.append(mark(mk('p', 'ms-best-text', r.best_post_text || 'No caption'), 'leader_rank', 'best_post_text', w));
    const url = safeUrl(r.best_post_url);
    if (url) { const a = mk('a', null, 'Open the post'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; best.append(a); }
    card.append(best);

    el.append(card);
  });
});

dash.draw('quiet', (el) => {
  const st = dash.data('accounts').status;
  const rows = rowsOf('accounts');
  el.replaceChildren();
  if (st === 'error') { el.append(mk('p', 'ms-note', "The leader list didn't load.")); return; }
  if (!rows) { el.textContent = '—'; return; }
  const quiet = rows.filter((r) => r.account_type === 'Leader' && r.status !== 'Active');
  if (!quiet.length) { el.append(mk('p', 'ms-note', 'Every tracked leader posted in the period.')); return; }
  quiet.forEach((r) => {
    const w = 'account=' + enc(r.account);
    const item = mk('div', 'ms-quiet-item');
    item.id = 'quiet-' + slug(r.account);
    item.append(mark(mk('b', null, r.account), 'accounts', 'account', w));
    item.append(mark(mk('span', null, r.role), 'accounts', 'role', w));
    item.append(mk('br'));
    item.append(mark(mk('span', null, r.status), 'accounts', 'status', w));
    el.append(item);
  });
});

dash.draw('topic_rows', (tbody) => {
  const st = dash.data('topic_share').status;
  const rows = rowsOf('topic_share');
  const order = rowsOf('leader_rank');
  tbody.replaceChildren();
  const table = tbody.closest('table');
  const topics = table ? Array.from(table.querySelectorAll('thead th[data-topic]')).map((th) => th.getAttribute('data-topic')) : [];
  if (st === 'error') { const tr = mk('tr'); const td = mk('td', null, "Topic data didn't load."); td.colSpan = topics.length + 1; tr.append(td); tbody.append(tr); return; }
  if (!rows || !order) return;
  order.forEach((l) => {
    const tr = mk('tr');
    tr.append(mk('td', null, l.leader));
    topics.forEach((t) => {
      const cell = rows.find((x) => x.leader === l.leader && x.topic === t);
      const td = mk('td', 'ms-hc');
      if (cell && cell.share > 0) {
        td.style.background = 'color-mix(in srgb, var(--color-fg) ' + Math.min(cell.share, 100) + '%, transparent)';
        if (cell.share >= 50) td.classList.add('ms-hot');
        td.append(mark(mk('span', null, cell.share + '%'), 'topic_share', 'share', 'leader=' + enc(l.leader) + '&topic=' + enc(t)));
      } else {
        td.textContent = '';
      }
      tr.append(td);
    });
    tbody.append(tr);
  });
});

dash.draw('platform_rows', (tbody) => {
  const st = dash.data('leader_platform').status;
  const rows = rowsOf('leader_platform');
  tbody.replaceChildren();
  if (st === 'error') { const tr = mk('tr'); const td = mk('td', null, "Platform data didn't load."); td.colSpan = 7; tr.append(td); tbody.append(tr); return; }
  if (!rows) return;
  rows.forEach((r) => {
    const tr = mk('tr');
    tr.setAttribute('data-key', enc(r.leader) + ',' + enc(r.platform));
    tr.append(mk('td', null, r.leader), mk('td', null, r.platform));
    [fmt(r.posts), fmt(r.engagements), fmt(r.per_post), d3.format(',.1f')(r.comments_per_post), r.share + '%'].forEach((v) => tr.append(mk('td', 'ms-num', v)));
    tbody.append(tr);
  });
});
})();
