# M&S corporate social snapshot

A three-tab dashboard of M&S on social, refreshed every morning at 7.30 (London time).

- **Leadership:** senior leaders ranked by engagement across LinkedIn, Instagram and TikTok, with what works best for each.
- **Corporate social:** what M&S talks about on its corporate LinkedIn page, @marksandspencernews and @MandSnews, and what drives engagement.
- **Corporate and brand crossover:** which corporate stories make it onto @marksandspencer and @marksandspencerfood, and how they do there.

It's a static site on GitHub Pages. A GitHub Action pulls fresh posts from Apify each morning, rebuilds the data files and republishes the site.

## How it fits together

```
Apify tasks (LinkedIn, Instagram, X, TikTok)
      │  07:30 London, GitHub Actions
      ▼
scripts/refresh.py   starts each Apify task, waits, downloads the posts into raw/
scripts/build.py     filters to the tracked accounts, tags topics, themes and stories,
                     keeps a rolling 12 months, writes site/data/*.json
      ▼
site/                the dashboard, published to GitHub Pages
```

## Setting it up

You'll do this once. It takes about 20 minutes.

### 1. Create the repo

Create a new repository (for example `ms-social-snapshot` under headlandconsultancyAI) and upload everything in this folder, including the hidden `.github` folder.

Worth deciding before you start: on a free GitHub plan, Pages only works on public repos. That means anyone with the link can see the dashboard and its data. If that's a problem for pitch work, use a private repo on a paid GitHub plan, where Pages can be limited to your organisation.

### 2. Set up the four Apify tasks

Make one saved task per platform in Apify, each covering every account for that platform:

| Task | Actor | Accounts to include |
|---|---|---|
| LinkedIn | LinkedIn posts scraper | The 8 leader profiles in `config/accounts.json`, plus the company page `linkedin.com/company/marks-and-spencer/` |
| Instagram | Instagram post scraper | thestuartmachin, alex_mands_food, kathryn.lturner, maddyevansmands, marksandspencernews, marksandspencer, marksandspencerfood |
| X | X (Twitter) scraper | MandSnews |
| TikTok | TikTok scraper | kathrynlturner |

Set each task to return the last 12 months of posts. To save Apify credits, you can drop that to the last 30 or 60 days once the first full build is done. The build keeps older posts from previous days, so the dashboard still covers the full year. Their engagement numbers just stop updating once they fall out of the scrape.

**Run each task once in Apify after you create it, before the first GitHub build.** If a task has never run, the first build can't fall back on it.

### 3. Add your Apify details to GitHub

In the repo, go to **Settings → Secrets and variables → Actions**.

- Under **Secrets**, add `APIFY_TOKEN` (find it in Apify under **Settings → API & Integrations**).
- Under **Variables**, add one per task: `APIFY_TASK_LINKEDIN`, `APIFY_TASK_INSTAGRAM`, `APIFY_TASK_X`, `APIFY_TASK_TIKTOK`. Use the task ID from the task's **API** tab, or `your-username~task-name`.

There are two optional variables:

- `APIFY_MODE`: leave it unset to have GitHub start the tasks at 7.30 and wait for them. Set it to `latest` if you'd rather schedule the tasks in Apify yourself, say at 6.30, and have GitHub pick up their last runs at 7.30.
- `APIFY_WAIT_MINUTES`: how long to wait for the tasks to finish (default 60).

### 4. Turn on Pages

Go to **Settings → Pages** and set **Source** to **GitHub Actions**.

### 5. Run the first build

Go to **Actions → Daily data refresh → Run workflow**. When it finishes, the site's link appears on the run page and under **Settings → Pages**.

After that it runs every day at 7.30 London time, in both summer and winter. GitHub sometimes starts scheduled jobs a few minutes late. In the default mode the new data lands once the Apify tasks finish, usually 10 to 30 minutes after 7.30.

## Changing things

- **Add or remove people and accounts:** edit `config/accounts.json`. Add the new handle to the matching Apify task too.
- **Change how posts are tagged:** edit the keyword lists in `scripts/taxonomy.py`. New posts pick up the change at the next build. To re-tag everything, run `python scripts/build.py --no-merge` with a full year of exports in `raw/`.
- **Change the look:** colours and fonts live in `site/css/theme.css`.

Changes to anything in `site/` publish straight away through the **Deploy site** workflow. Data changes publish with the morning refresh.

## Running it on your own machine

```
# put Apify exports in raw/ as linkedin.json, instagram.json, x.json, tiktok.json
python scripts/build.py
cd site && python -m http.server 8000     # then open http://localhost:8000
```

Python 3.10 or later, no extra packages.

## What's counted

- **Engagements:** likes or reactions, plus comments and shares. TikTok saves count too. On X, shares are reposts plus quotes. Views aren't counted.
- **Window:** a rolling 12 months to the day of the build.
- **Leaders and corporate accounts:** only their own posts count. Posts by other accounts that show up on their feeds, such as collaborations, are left out.
- **Brand accounts:** posts made by any M&S account count, but creator-owned collaborations are left out.
- **Tagging:** topics, themes and stories all come from keyword matching, so treat them as a guide.

The footer of the dashboard shows when the data was last refreshed and the dates it covers.
