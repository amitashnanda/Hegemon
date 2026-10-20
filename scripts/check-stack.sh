#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
php_binary="${HEGEMON_PHP:-php}"
"$php_binary" -r 'require "app/bootstrap.php"; echo "PHP ",PHP_VERSION,"\n"; exit(PHP_VERSION_ID >= 80400 && extension_loaded("gd") ? 0 : 1);'
java_binary="$("$php_binary" -r 'require "app/bootstrap.php"; echo getenv("HEGEMON_JAVA");')"
python_binary="$("$php_binary" -r 'require "app/bootstrap.php"; echo getenv("HEGEMON_PYTHON");')"
r_binary="$("$php_binary" -r 'require "app/bootstrap.php"; echo getenv("HEGEMON_R");')"
latex_binary="$("$php_binary" -r 'require "app/bootstrap.php"; echo getenv("HEGEMON_PDFLATEX");')"
export MPLCONFIGDIR="$("$php_binary" -r 'require "app/bootstrap.php"; echo getenv("MPLCONFIGDIR");')"
export PYTHONDONTWRITEBYTECODE=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1
"$java_binary" -version
"$python_binary" -c 'import sys, numpy, scipy, matplotlib, pandas, PIL, bitarray; print(sys.version)'
"$r_binary" --slave -e 'library(survival); library(ggplot2); cat(R.version.string,"\n")'
"$latex_binary" --version | head -n 2
