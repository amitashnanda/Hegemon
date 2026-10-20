<?php

$settings = [
  'HEGEMON_CONFIG' => dirname(__DIR__) . '/explore.conf',
  'HEGEMON_PYTHON' => 'python2.7',
  'HEGEMON_JAVA' => 'java',
  'HEGEMON_R' => 'R',
  'HEGEMON_PDFLATEX' => 'pdflatex',
  'MPLCONFIGDIR' => dirname(__DIR__) . '/tmpdir/matplotlib',
  'PYTHONDONTWRITEBYTECODE' => '1',
  'OPENBLAS_NUM_THREADS' => '1',
  'OMP_NUM_THREADS' => '1',
  'MKL_NUM_THREADS' => '1'
];

$local = __DIR__ . '/localstack.local.php';
if (is_file($local)) {
  $overrides = require $local;
  if (!is_array($overrides)) { throw new RuntimeException('Local configuration must return an array.'); }
  $settings = array_replace($settings, array_intersect_key($overrides, $settings));
}
return $settings;
