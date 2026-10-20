import configparser
import csv
import hashlib
import itertools
import subprocess
from pathlib import Path


root = Path(__file__).resolve().parents[1]
registry = configparser.ConfigParser()
registry.read_string('[registry]\n' + (root / 'config/explore.conf.example').read_text())
assert registry.sections() == ['registry', 'B1']
dataset = registry['B1']
assert dataset['name'].strip() == 'Kim 2010 bladder cancer Cancer Specific'
assert dataset['key'].strip() == 'bladder:' and dataset['source'].strip() == 'GSE13507'
expected = {'expr': 'expr', 'index': 'idx', 'survival': 'os', 'indexheader': 'ih'}
for field, suffix in expected.items():
    value = dataset[field].strip()
    assert value in ['data/kim-2010/kim-2010-bladder-' + suffix + '.txt', '/data/kim-2010-bladder-' + suffix + '.txt']
assert 'info' not in dataset
manifest = {}
for line in (root / 'config/kim-example.sha256').read_text().splitlines():
    digest, filename = line.split()
    assert len(digest) == 64 and all(character in '0123456789abcdef' for character in digest)
    assert filename not in manifest
    manifest[filename] = digest
assert set(manifest) == {'kim-2010-bladder-' + suffix + '.txt' for suffix in ['expr', 'idx', 'ih', 'os', 'thr']}
subprocess.run(['bash', '-n', str(root / 'scripts/fetch-kim-example.sh')], check=True)
subprocess.run(['git', '-C', str(root), 'check-ignore', '-q', '--no-index', 'data/kim-2010/kim-2010-bladder-expr.txt'], check=True)
print('PASS Kim-only upstream B1 template, four registered files, five-file checksum manifest, and ignored data directory')
directory = root / 'data/kim-2010'
if directory.exists():
    for filename, digest in manifest.items():
        assert hashlib.sha256((directory / filename).read_bytes()).hexdigest() == digest, filename
    with (directory / 'kim-2010-bladder-expr.txt').open('rb') as expression:
        assert len(expression.readline().rstrip(b'\r\n').split(b'\t')) - 2 == 256
        with (directory / 'kim-2010-bladder-idx.txt').open(newline='') as index:
            rows = csv.reader(index, delimiter='\t')
            columns = [column.lower() for column in next(rows)]
            pointer_column = columns.index('ptr')
            for row in itertools.islice(rows, 20):
                expression.seek(int(row[pointer_column]))
                assert expression.readline().split(b'\t', 1)[0].decode() == row[0]
    print('PASS public data checksums, 256 expression samples, and direct index-pointer lookups')
else:
    print('Public files not downloaded; run bash scripts/fetch-kim-example.sh to validate data checksums and pointers')
