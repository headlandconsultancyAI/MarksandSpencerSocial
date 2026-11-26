"""Pull fresh data from Apify, then rebuild the dashboard's data files.

Environment:
  APIFY_TOKEN              your Apify API token (GitHub secret)
  APIFY_TASK_LINKEDIN      Apify task ID or "username~task-name" for each platform (GitHub variables).
  APIFY_TASK_INSTAGRAM     Leave one blank to skip that platform: its last data is kept.
  APIFY_TASK_X
  APIFY_TASK_TIKTOK
  APIFY_MODE               "run" (default): start every task now and wait for it to finish.
                           "latest": don't start anything, take each task's last successful run.
  APIFY_WAIT_MINUTES       how long to wait for runs in "run" mode (default 60)

If a run fails or times out, the script falls back to that task's last successful run.
If a task has never run successfully, that platform keeps its last data and the job warns you.
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'raw')
API = os.environ.get('APIFY_API', 'https://api.apify.com/v2')
TOKEN = os.environ.get('APIFY_TOKEN', '').strip()
MODE = os.environ.get('APIFY_MODE', 'run').strip().lower() or 'run'
WAIT = int(os.environ.get('APIFY_WAIT_MINUTES', '60') or 60)
TASKS = {p: os.environ.get('APIFY_TASK_' + p.upper(), '').strip() for p in ['linkedin', 'instagram', 'x', 'tiktok']}
TERMINAL = {'SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'}


def call(method, path, **params):
    params['token'] = TOKEN
    url = f'{API}{path}?{urllib.parse.urlencode(params)}'
    # POST with no body starts a task with its saved input, unchanged.
    req = urllib.request.Request(url, method=method)
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read().decode('utf-8'))


def task_path(task):
    return '/actor-tasks/' + urllib.parse.quote(task, safe='~')


def items(dataset_id):
    out, offset = [], 0
    while True:
        page = call('GET', f'/datasets/{dataset_id}/items', clean='true', format='json', offset=offset, limit=1000)
        out += page
        if len(page) < 1000:
            return out
        offset += 1000


def last_success(task):
    try:
        return call('GET', task_path(task) + '/runs/last', status='SUCCEEDED')['data']
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def warn(msg):
    print('::warning::' + msg)


def main():
    if not TOKEN:
        sys.exit('APIFY_TOKEN is missing. Add it as a repository secret.')
    os.makedirs(RAW, exist_ok=True)
    for p in TASKS:  # clear old exports so only today's fetches feed the build
        try:
            os.remove(os.path.join(RAW, p + '.json'))
        except FileNotFoundError:
            pass
    active = {p: t for p, t in TASKS.items() if t}
    print('Apify task variables this job received:')
    for p in TASKS:
        print(f'  APIFY_TASK_{p.upper()}: {"set" if p in active else "NOT SET"}')
    if not active:
        sys.exit('None of the APIFY_TASK_ variables reached this job, so nothing can be fetched '
                 'and the data has not changed. Add them as repository variables under '
                 'Settings > Secrets and variables > Actions > Variables.')
    for p in TASKS:
        if p not in active:
            warn(f'No Apify task set for {p}. Keeping its last data.')
    runs = {}
    if MODE == 'run':
        for p, t in active.items():
            try:
                runs[p] = call('POST', task_path(t) + '/runs')['data']['id']
                print(f'{p}: started run {runs[p]}')
            except urllib.error.HTTPError as e:
                warn(f'{p}: could not start task {t} ({e.code}). Falling back to its last successful run.')
        deadline = time.time() + WAIT * 60
        pending = dict(runs)
        while pending and time.time() < deadline:
            time.sleep(int(os.environ.get('APIFY_POLL_SECONDS', '30')))
            for p, rid in list(pending.items()):
                status = call('GET', f'/actor-runs/{rid}')['data']['status']
                if status in TERMINAL:
                    print(f'{p}: run {rid} {status}')
                    pending.pop(p)
                    if status != 'SUCCEEDED':
                        runs.pop(p)
        for p in pending:
            warn(f'{p}: run still going after {WAIT} minutes. Using its last successful run instead.')
            runs.pop(p, None)
    failed = []
    for p, t in active.items():
        try:
            if p in runs:
                dataset = call('GET', f'/actor-runs/{runs[p]}')['data']['defaultDatasetId']
            else:
                run = last_success(t)
                if not run:
                    warn(f'{p}: task {t} has never run successfully. Run it once in Apify. Keeping its last data.')
                    failed.append(p)
                    continue
                dataset = run['defaultDatasetId']
                print(f'{p}: using last successful run from {run.get("finishedAt")}')
            data = items(dataset)
        except Exception as e:  # one platform failing shouldn't stop the others
            warn(f'{p}: could not fetch its data ({e}). Keeping its last data.')
            failed.append(p)
            continue
        if not data:
            warn(f'{p}: the run returned no posts. Keeping its last data.')
            failed.append(p)
            continue
        with open(os.path.join(RAW, p + '.json'), 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
        print(f'{p}: {len(data)} items')
    if failed and len(failed) == len(active):
        sys.exit('Nothing could be fetched from Apify, so the data has not changed. See the warnings above.')
    subprocess.run([sys.executable, os.path.join(ROOT, 'scripts', 'build.py')], check=True)


if __name__ == '__main__':
    main()
