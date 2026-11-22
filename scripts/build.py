"""Turn the raw Apify exports into the dashboard's data files.

Reads   raw/linkedin.json, raw/instagram.json, raw/x.json, raw/tiktok.json (any that exist)
        config/accounts.json
        site/data/*.json (the last build, so posts a shorter scrape no longer returns are kept)
Writes  site/data/linkedin.json, instagram.json, x.json, tiktok.json, accounts.json, meta.json

Usage:  python scripts/build.py                 rolling 12 months to today
        python scripts/build.py --end 2026-11-20
        python scripts/build.py --no-merge      rebuild only from what's in raw/
"""
import argparse
import datetime as dt
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from taxonomy import tag_topic, tag_theme, tag_stories  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'raw')
OUT = os.path.join(ROOT, 'site', 'data')
PLATFORMS = ['linkedin', 'instagram', 'x', 'tiktok']
HASH = re.compile(r'#(\w+)')


def load(path, default=None):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def excerpt(text):
    t = re.sub(r'\s+', ' ', text or '').strip()
    return t if len(t) <= 160 else t[:159].rstrip() + '…'


def row(pid, account, atype, platform, date, text, fmt, likes, comments, shares, saves, views, url, repost=False):
    text = (text or '').replace('&amp;', '&')
    return dict(
        post_id=pid, account=account, account_type=atype, platform=platform, date=date,
        topic=tag_topic(text) if atype == 'Leader' else '',
        theme=tag_theme(text) if atype == 'Corporate' else '',
        stories=tag_stories(text), format=fmt,
        likes=likes, comments=comments, shares=shares, saves=saves, views=views or 0,
        engagements=likes + comments + shares + saves, url=url, excerpt=excerpt(text),
        hashtags=' '.join(sorted({h.lower() for h in HASH.findall(text)})), repost=bool(repost))


def build_linkedin(raw, cfg, skipped):
    leaders = {l['linkedin']: l['name'] for l in cfg['leaders'] if l.get('linkedin')}
    corp = cfg['corporate']['linkedin']
    rows = []
    for p in raw:
        src = (p.get('_metadata') or {}).get('source_url', '')
        author = p.get('author') or {}
        e = p.get('engagement') or {}
        if '/company/' in src:
            if corp['company'] not in src or p.get('author_name') != corp['author_name']:
                skipped['LinkedIn: post by another account on the company page'] += 1
                continue
            acct, atype = corp['name'], 'Corporate'
        elif '/in/' in src:
            slug = src.split('/in/')[1].strip('/')
            acct = leaders.get(slug)
            if acct is None or author.get('username') != slug:
                skipped['LinkedIn: post by another account on a leader profile'] += 1
                continue
            atype = 'Leader'
        else:
            skipped['LinkedIn: unknown source'] += 1
            continue
        imgs = p.get('images') or []
        fmt = ('Video' if p.get('video_url') else 'Carousel' if p.get('doc') or len(imgs) > 1
               else 'Article' if p.get('article') else 'Image' if imgs else 'Text')
        rows.append(row('LI' + str(p['_metadata']['post_id']), acct, atype, 'LinkedIn', (p.get('posted_at') or '')[:10],
                        p.get('content'), fmt, e.get('total_reactions') or 0, e.get('comments') or 0, e.get('shares') or 0,
                        0, 0, p.get('post_url'), repost=p.get('is_repost')))
    return rows


def build_instagram(raw, cfg, skipped):
    leaders = {l['instagram']: l['name'] for l in cfg['leaders'] if l.get('instagram')}
    corp = cfg['corporate']['instagram']
    brand = {b['instagram']: b['name'] for b in cfg['brand']}
    rows = []
    for p in raw:
        feed = (p.get('inputUrl') or '').rstrip('/').split('/')[-1]
        owner = p.get('ownerUsername') or ''
        if feed in brand:
            # Brand feeds: keep posts made by any M&S account, drop creator-owned collaborations.
            if not owner.startswith('marksandspencer'):
                skipped['Instagram: creator-owned post on a brand feed'] += 1
                continue
            acct, atype = brand[feed], 'Brand'
        elif owner != feed:
            skipped['Instagram: post by another account'] += 1
            continue
        elif feed == corp['handle']:
            acct, atype = corp['name'], 'Corporate'
        elif feed in leaders:
            acct, atype = leaders[feed], 'Leader'
        else:
            skipped['Instagram: account not in config (' + feed + ')'] += 1
            continue
        fmt = {'Sidecar': 'Carousel', 'Video': 'Video', 'Image': 'Image'}.get(p.get('type'), p.get('type') or 'Image')
        rows.append(row('IG' + str(p['id']), acct, atype, 'Instagram', (p.get('timestamp') or '')[:10], p.get('caption'), fmt,
                        max(p.get('likesCount') or 0, 0), p.get('commentsCount') or 0, 0, 0, 0, p.get('url')))
    return rows


def build_x(raw, cfg, skipped):
    corp = cfg['corporate']['x']
    rows = []
    for p in raw:
        author = (p.get('author') or {}).get('screenName', '')
        text = p.get('postText') or ''
        if author.lower() != corp['handle'].lower() or text.startswith('RT @'):
            skipped['X: not an original post by ' + corp['handle']] += 1
            continue
        media = p.get('media') or []
        fmt = ('Video' if any(m.get('type') in ('video', 'animated_gif') for m in media)
               else 'Carousel' if len(media) > 1 else 'Image' if media else 'Text')
        date = dt.datetime.fromtimestamp(p['timestamp'] / 1000, dt.timezone.utc).strftime('%Y-%m-%d')
        rows.append(row('X' + str(p['postId']), corp['name'], 'Corporate', 'X', date, text, fmt,
                        p.get('favouriteCount') or 0, p.get('replyCount') or 0,
                        (p.get('repostCount') or 0) + (p.get('quoteCount') or 0), 0, p.get('viewCount'), p.get('postUrl')))
    return rows


def build_tiktok(raw, cfg, skipped):
    leaders = {l['tiktok']: l['name'] for l in cfg['leaders'] if l.get('tiktok')}
    rows = []
    for p in raw:
        handle = (p.get('authorMeta') or {}).get('name') or p.get('input') or ''
        acct = leaders.get(handle)
        if acct is None:
            skipped['TikTok: account not in config (' + handle + ')'] += 1
            continue
        rows.append(row('TT' + str(p['id']), acct, 'Leader', 'TikTok', (p.get('createTimeISO') or '')[:10], p.get('text'), 'Video',
                        p.get('diggCount') or 0, p.get('commentCount') or 0, p.get('shareCount') or 0,
                        p.get('collectCount') or 0, p.get('playCount'), p.get('webVideoUrl')))
    return rows


BUILDERS = {'linkedin': build_linkedin, 'instagram': build_instagram, 'x': build_x, 'tiktok': build_tiktok}


def accounts_file(cfg, all_rows):
    posted = {(r['account'], r['account_type']) for r in all_rows}
    out = []
    for l in cfg['leaders']:
        active = (l['name'], 'Leader') in posted
        status = 'Active' if active else (l.get('note') or 'No posts in the last 12 months')
        out.append(dict(account=l['name'], account_type='Leader', role=l['role'], platform='',
                        linkedin=l.get('linkedin', ''), instagram=l.get('instagram', ''), tiktok=l.get('tiktok', ''), x='',
                        status=status))
    c = cfg['corporate']
    out.append(dict(account=c['linkedin']['name'], account_type='Corporate', role=c['linkedin']['role'], platform='LinkedIn',
                    linkedin=c['linkedin']['company'], instagram='', tiktok='', x='', status='Active'))
    out.append(dict(account=c['instagram']['name'], account_type='Corporate', role=c['instagram']['role'], platform='Instagram',
                    linkedin='', instagram=c['instagram']['handle'], tiktok='', x='', status='Active'))
    out.append(dict(account=c['x']['name'], account_type='Corporate', role=c['x']['role'], platform='X',
                    linkedin='', instagram='', tiktok='', x=c['x']['handle'], status='Active'))
    for b in cfg['brand']:
        out.append(dict(account=b['name'], account_type='Brand', role=b['role'], platform='Instagram',
                        linkedin='', instagram=b['instagram'], tiktok='', x='', status='Active'))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--end', help='last day of the window, YYYY-MM-DD (default: today, UTC)')
    ap.add_argument('--no-merge', action='store_true', help="don't keep posts from the last build")
    args = ap.parse_args()
    cfg = load(os.path.join(ROOT, 'config', 'accounts.json'))
    end = dt.date.fromisoformat(args.end) if args.end else dt.datetime.now(dt.timezone.utc).date()
    start = end - dt.timedelta(days=cfg.get('window_days', 365))
    S, E = start.isoformat(), end.isoformat()
    os.makedirs(OUT, exist_ok=True)
    known = {(l['name'], 'Leader') for l in cfg['leaders']} | {(b['name'], 'Brand') for b in cfg['brand']} | \
            {(v['name'], 'Corporate') for v in cfg['corporate'].values()}
    from collections import Counter
    skipped = Counter()
    meta_sources = {}
    all_rows = []
    for plat in PLATFORMS:
        raw = load(os.path.join(RAW, plat + '.json'))
        old = [] if args.no_merge else (load(os.path.join(OUT, plat + '.json'), []) or [])
        fresh = BUILDERS[plat](raw, cfg, skipped) if isinstance(raw, list) else []
        key = lambda r: r['post_id'] + '|' + r['account']  # the same post can sit on two brand feeds
        merged = {key(r): r for r in old if (r.get('account'), r.get('account_type')) in known}
        for r in fresh:
            merged[key(r)] = r  # a fresh scrape wins, so engagement counts update
        rows = sorted((r for r in merged.values() if S <= r['date'] <= E), key=lambda r: (r['date'], r['post_id']), reverse=True)
        with open(os.path.join(OUT, plat + '.json'), 'w', encoding='utf-8') as f:
            json.dump(rows, f, ensure_ascii=False)
        meta_sources[plat] = {'fetched': isinstance(raw, list), 'scraped_posts': len(fresh), 'posts_in_window': len(rows)}
        all_rows += rows
    with open(os.path.join(OUT, 'accounts.json'), 'w', encoding='utf-8') as f:
        json.dump(accounts_file(cfg, all_rows), f, ensure_ascii=False)
    meta = {'built_at': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'window_start': S, 'window_end': E,
            'sources': meta_sources}
    with open(os.path.join(OUT, 'meta.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=1)
    print(json.dumps(meta, indent=1))
    for k, v in sorted(skipped.items()):
        print(f'  skipped {v:5}  {k}')


if __name__ == '__main__':
    main()
