import re
import subprocess
from pathlib import Path


root = Path(__file__).resolve().parents[1]
process = subprocess.run(['git', '-C', str(root), 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
files = sorted(set(name.decode() for name in process.stdout.split(b'\0') if name))
assert files, 'No publishable files found'
private_path_parts = [('booleanfs',), ('pscratch',), ('global', 'homes'), ('global', 'cfs'), ('mnt', 'booleanfs')]
private_prefixes = [('/' + '/'.join(parts)).encode() for parts in private_path_parts]
secret_patterns = [re.compile(pattern) for pattern in [
    rb'gh[pousr]_[A-Za-z0-9]{30,}', rb'github_pat_[A-Za-z0-9_]{30,}', rb'AKIA[A-Z0-9]{16}',
    b'-----BEGIN ' + rb'(?:RSA |EC |OPENSSH )?PRIVATE KEY-----'
]]
failures = []
for name in files:
    filename = root / name
    if filename.is_symlink():
        failures.append(name + ': review symlink before publishing')
        continue
    if filename.stat().st_size > 20 * 1024 * 1024:
        failures.append(name + ': unexpectedly large artifact')
    if filename.suffix in ['.sif', '.class', '.sqlite', '.pem', '.key'] or filename.name == 'explore.conf':
        failures.append(name + ': private/generated file is publishable')
    if filename.suffix.lower() not in ['.php', '.py', '.sh', '.md', '.html', '.js', '.css', '.java', '.ini', '.example', '.def'] and filename.name not in ['.gitignore', '.htaccess', 'Containerfile']:
        continue
    content = filename.read_bytes()
    if any(prefix in content for prefix in private_prefixes):
        failures.append(name + ': internal filesystem path')
    if any(pattern.search(content) for pattern in secret_patterns):
        failures.append(name + ': possible credential/private key')
ignored = ['explore.conf', 'nested/explore.conf', 'nested/private-explore.conf', 'config/localstack.local.php',
    'config/runtime.local.php', '.env', '.env.production', 'data/private.csv', 'kim-expr.txt',
    'tools/Hegemon.class', 'runtime/server.log', 'tmpdir/export.png', 'runtime/hegemon.sif', 'private.oci.tar']
for name in ignored:
    result = subprocess.run(['git', '-C', str(root), 'check-ignore', '-q', '--no-index', name])
    if result.returncode != 0:
        failures.append(name + ': missing ignore rule')
assert not failures, '\n'.join(failures)
print('PASS publication checks: {} candidate files; {} private/generated path rules'.format(len(files), len(ignored)))
