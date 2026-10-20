import argparse
import csv
import io
import json
import math
import statistics
import urllib.error
import urllib.parse
import urllib.request


parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:8092/Hegemon/')
parser.add_argument('--dataset', default='B2.1')
parser.add_argument('--gene-a', default='TYROBP')
parser.add_argument('--gene-b', default='FCER1G')
parser.add_argument('--render', action='store_true')
arguments = parser.parse_args()
base = arguments.base_url.rstrip('/') + '/'
checks = []


def request(route, parameters=None, payload=None):
    url = base + route
    if parameters:
        url += '?' + urllib.parse.urlencode(parameters)
    body = None if payload is None else json.dumps(payload).encode()
    headers = {} if body is None else {'Content-Type': 'application/json'}
    try:
        response = urllib.request.urlopen(urllib.request.Request(url, data=body, headers=headers), timeout=180)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, response.headers, response.read()


def api(action, payload=None, **parameters):
    if payload is None:
        status, headers, body = request('api.php', dict(action=action, **parameters))
    else:
        status, headers, body = request('api.php', payload=dict(action=action, **payload))
    value = json.loads(body)
    assert status == 200 and value.get('ok') is True, (status, value)
    return value


def passed(name):
    checks.append(name)
    print('PASS ' + name, flush=True)


for route in ['index.html', 'workspace.html', 'manual.html', 'explore.php', 'stats.php', 'assets/js/app.js', 'assets/css/styles.css']:
    assert request(route)[0] == 200, route
passed('Public pages and canonical assets')
for route in ['explore.conf', 'app/api.php', 'config/localstack.local.php', 'tools/Hegemon.java',
              'tests/smoke.py', '.git/config', 'runtime/private.html']:
    assert request(route)[0] == 403, route
passed('Registry, internal code, Git metadata, tests and runtime are not publicly readable')
details = api('dataset', id=arguments.dataset)
assert details['dataset']['sampleCount'] > 0
genes = [api('genes', id=arguments.dataset, q=query)['genes'] for query in [arguments.gene_a, arguments.gene_b]]
assert all(genes)
parameters = dict(id=arguments.dataset, geneA=genes[0][0]['id'], geneB=genes[1][0]['id'])
passed('Dataset registry and both gene/probe lookups')
scatter = api('plot', **parameters)
assert len(scatter['samples']) == details['dataset']['sampleCount']
assert len({sample['id'] for sample in scatter['samples']}) == len(scatter['samples'])
assert all(sample['color'] in ['#0000FF', '#558866'] for sample in scatter['samples'])
passed('Complete scatter sample population and default colors')
eligible = [sample for sample in scatter['samples'] if isinstance(sample['x'], (int, float)) and isinstance(sample['y'], (int, float))]
assert len(eligible) >= 2
selected = eligible[:min(12, len(eligible))]
groups = [{'name': 'Example selection', 'color': '#d55e00', 'samples': [sample['id'] for sample in selected]}]
summary = api('analysis', payload=dict(parameters, groups=groups))['groups'][0]
assert summary['sampleCount'] == len(selected)
for axis in ['x', 'y']:
    assert math.isclose(summary[axis]['mean'], statistics.mean(sample[axis] for sample in selected), rel_tol=1e-12, abs_tol=1e-12)
passed('Group membership and independently calculated expression means')
status, headers, body = request('api.php', payload=dict(parameters, action='export', samples=groups[0]['samples']))
rows = list(csv.reader(io.StringIO(body.decode())))
assert status == 200 and [row[0] for row in rows[1:]] == groups[0]['samples']
passed('Exact selected-sample CSV export')
if details['clinicalFields']:
    clinical = api('clinical', id=arguments.dataset, field=details['clinicalFields'][0]['id'])
    assert [row['id'] for row in clinical['values']] == [row['id'] for row in scatter['samples']]
    passed('Clinical values aligned to expression sample order')
status, headers, body = request('api.php', {'action': 'dataset', 'id': 'MISSING_DATASET_FOR_TEST'})
assert status >= 400 and json.loads(body)['ok'] is False
passed('Invalid dataset produces a structured error')
if arguments.render:
    kinds = ['png', 'boxplot', 'violin', 'pdf']
    survival_samples = [sample['id'] for sample in eligible if sample['hasSurvival']]
    render_groups = groups
    if len(survival_samples) >= 4:
        render_groups = [
            {'name': 'Example A', 'color': '#d55e00', 'samples': survival_samples[:2]},
            {'name': 'Example B', 'color': '#2358cc', 'samples': survival_samples[2:4]}
        ]
    if details['dataset']['capabilities']['survival'] and survival_samples:
        kinds.append('survival')
    for kind in kinds:
        status, headers, body = request('api.php', payload=dict(parameters, action='render', type=kind, groups=render_groups))
        assert status == 200 and body.startswith(b'%PDF-' if kind == 'pdf' else b'\x89PNG'), (kind, status, body[:200])
        passed('Scientific rendering: ' + kind)
print('{} smoke checks passed'.format(len(checks)))
