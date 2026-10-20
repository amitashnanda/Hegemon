#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
php_binary="${HEGEMON_PHP:-php}"
"$php_binary" -r 'require "app/bootstrap.php"; if (PHP_VERSION_ID < 70200) { exit(1); } echo "PHP ", PHP_VERSION, "\n"; foreach (["gd", "json", "ctype", "posix"] as $extension) { if (!extension_loaded($extension)) { fwrite(STDERR, "Missing extension: $extension\n"); exit(1); } } if (!is_readable(getenv("HEGEMON_CONFIG")) || !is_writable("tmpdir")) { fwrite(STDERR, "Supply a readable private registry and writable tmpdir.\n"); exit(1); }'
java_binary="$("$php_binary" -r 'require "app/bootstrap.php"; echo getenv("HEGEMON_JAVA");')"
python_binary="$("$php_binary" -r 'require "app/bootstrap.php"; echo getenv("HEGEMON_PYTHON");')"
r_binary="$("$php_binary" -r 'require "app/bootstrap.php"; echo getenv("HEGEMON_R");')"
latex_binary="$("$php_binary" -r 'require "app/bootstrap.php"; echo getenv("HEGEMON_PDFLATEX");')"
export MPLCONFIGDIR="$("$php_binary" -r 'require "app/bootstrap.php"; echo getenv("MPLCONFIGDIR");')"
export PYTHONDONTWRITEBYTECODE=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1
"$java_binary" -version
"$python_binary" -B -c 'import sys, numpy, scipy, matplotlib, pandas, PIL, bitarray; print(sys.version); print("Scientific Python imports passed")'
"$r_binary" --slave -e 'stopifnot(requireNamespace("survival", quietly=TRUE)); cat(R.version.string,"\nsurvival ",as.character(packageVersion("survival")),"\n",sep="")'
"$latex_binary" --version | head -n 2
printf '%s\n' 'Native stack checks passed. No packages were installed.'
