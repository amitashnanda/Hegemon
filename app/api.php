<?php

ini_set('display_errors', '0');
require_once __DIR__ . '/util.php';
require_once __DIR__ . '/hegemon.php';
require_once __DIR__ . '/groups.php';
require_once __DIR__ . '/metadata-cache.php';
chdir(dirname(__DIR__));

class HegemonApiError extends RuntimeException {
  public $status;
  public $errorCode;

  public function __construct($errorCode, $message, $status = 400) {
    parent::__construct($message);
    $this->status = $status;
    $this->errorCode = $errorCode;
  }
}

function apiFail($code, $message, $status = 400) {
  throw new HegemonApiError($code, $message, $status);
}

function apiString($request, $name, $default = '', $limit = 256) {
  $value = $request[$name] ?? $default;
  if (!is_string($value) || strlen($value) > $limit || preg_match('/[\x00-\x1f]/', $value)) {
    apiFail('invalid_parameter', 'Invalid ' . $name . '.');
  }
  return trim($value);
}

function apiKeys($request) {
  $keys = [];
  foreach (explode(':', apiString($request, 'key')) as $key) { $keys[$key] = 1; }
  return $keys;
}

function apiCompanion($dataset, $type) {
  if ($dataset->has($type)) { return $dataset->get($type); }
  return $dataset->getPre() . '-' . $type . '.txt';
}

function apiExecutable($name, $fallback) {
  static $available = [];
  if (!array_key_exists($name, $available)) {
    $binary = getenv($name) ?: $fallback;
    $available[$name] = str_contains($binary, '/') ? is_executable($binary) :
      (function_exists('shell_exec') && trim((string) shell_exec('command -v ' . escapeshellarg($binary) . ' 2>/dev/null')) !== '');
  }
  return $available[$name];
}

function apiSurvivalAvailable($dataset) {
  $path = $dataset->getSurv();
  if (!$path || !is_readable($path)) { return false; }
  return apiCachedValue('survival-available-v1', $path, static function () use ($path) {
    $available = false;
    $handle = fopen($path, 'r');
    $header = localstackCsvRead($handle, "\t");
    if (count($header ?: []) >= 3) {
      while (($row = apiReadClinicalPrefix($handle, 3)) !== false) {
        if (localstackIsNumeric($row[1] ?? '') && is_finite((float) $row[1]) && (float) $row[1] >= 0 && in_array(trim($row[2] ?? ''), ['0', '1'], true)) {
          $available = true;
          break;
        }
      }
    }
    fclose($handle);
    return $available;
  });
}

function apiCapabilities($dataset) {
  $clinical = is_readable($dataset->getSurv());
  $python = apiExecutable('HEGEMON_PYTHON', '/usr/bin/python');
  $hasR = apiExecutable('HEGEMON_R', 'R');
  return [
    'expression' => is_readable($dataset->getExpr()) && is_readable($dataset->getIdx()),
    'plot' => true,
    'clinical' => $clinical,
    'survival' => $clinical && $hasR && apiSurvivalAvailable($dataset),
    'thresholds' => is_readable(apiCompanion($dataset, 'thr')),
    'info' => is_readable(apiCompanion($dataset, 'info')),
    'boolean' => is_readable(apiCompanion($dataset, 'bv')),
    'indexHeader' => is_readable($dataset->getIH()),
    'png' => $python,
    'boxplot' => $hasR,
    'violin' => $hasR,
    'pdf' => $python && $hasR && apiExecutable('HEGEMON_PDFLATEX', 'pdflatex'),
    'genomeWide' => apiExecutable('HEGEMON_JAVA', 'java')
  ];
}

function apiDatasetInfo($dataset, $hegem = null, $capabilities = true) {
  $info = [
    'id' => $dataset->getID(), 'name' => $dataset->getName(),
    'source' => $dataset->getSource(), 'sampleCount' => $hegem ? $hegem->getNum() : apiSampleCount($dataset),
    'keys' => array_values(array_filter(explode(':', $dataset->get('key')))),
    'available' => true
  ];
  if ($capabilities) { $info['capabilities'] = apiCapabilities($dataset); }
  return $info;
}

function apiGetDataset($database, $request) {
  $id = apiString($request, 'id');
  foreach ($database->getListKey(apiKeys($request)) as $dataset) {
    if ($dataset->getID() !== $id) { continue; }
    if (!is_readable($dataset->getExpr()) || !is_readable($dataset->getIdx())) {
      apiFail('dataset_unavailable', 'The dataset files are unavailable on this server.', 503);
    }
    return $dataset;
  }
  apiFail('dataset_not_found', 'No visible registered dataset has this ID.', 404);
}

function apiHegemon($dataset, $loadIndex = true) {
  $hegem = new Hegemon($dataset);
  if ($loadIndex) {
    $hegem->init();
    if ($dataset->hasPlatform() && is_readable($dataset->getPlatform())) { $hegem->initPlatform(); }
  }
  if ($hegem->getNum() <= 0) { apiFail('invalid_dataset', 'The dataset has no sample columns.', 422); }
  return $hegem;
}

function apiClinical($hegem, $selectedIDs = null) {
  $path = $hegem->getSurv();
  if (!$path || !is_readable($path)) { return ['fields' => [], 'rows' => []]; }
  $handle = fopen($path, 'r');
  $header = localstackCsvRead($handle, "\t");
  $fields = [];
  foreach (($header ?: []) as $index => $name) {
    if ($index > 0) { $fields[] = ['id' => (string) $index, 'name' => $name]; }
  }
  $samples = array_fill_keys($selectedIDs === null ? array_slice($hegem->headers, 2) : $selectedIDs, true);
  $rows = [];
  while (($row = $selectedIDs === null ? localstackCsvRead($handle, "\t") : apiReadClinicalPrefix($handle, 3)) !== false) {
    if (isset($samples[$row[0] ?? ''])) { $rows[$row[0]] = $selectedIDs === null ? $row : array_slice($row, 0, 3); }
  }
  fclose($handle);
  return ['fields' => $fields, 'rows' => $rows];
}

function apiProbe($hegem, $query) {
  $ids = $hegem->getIDs($query);
  if (!$ids) { apiFail('gene_not_found', 'No matching probe was found for ' . $query . '.', 404); }
  $id = (string) array_key_first($ids);
  $row = $hegem->getExprData($id);
  if (!$row || $row[0] !== $id || count($row) !== count($hegem->headers)) {
    apiFail('invalid_index', 'The probe index does not match the expression file.', 422);
  }
  $threshold = null;
  $thresholdPath = apiCompanion($hegem->rdataset, 'thr');
  if (is_readable($thresholdPath)) {
    $handle = fopen($thresholdPath, 'r');
    while (($line = fgets($handle)) !== false) {
      $values = explode("\t", rtrim($line, "\r\n"));
      if ($values[0] !== $id || count($values) < 5) { continue; }
      $candidate = array_slice($values, 1, 4);
      if (count(array_filter($candidate, static function ($value) { return localstackIsNumeric($value) && is_finite((float) $value); })) === 4) { $threshold = array_map('floatval', $candidate); }
      break;
    }
    fclose($handle);
  }
  $source = $threshold === null ? 'computed' : 'file';
  if ($threshold === null) {
    $numeric = array_values(array_filter(array_slice($row, 2), static function ($value) { return localstackIsNumeric($value) && is_finite((float) $value); }));
    if (!$numeric) { apiFail('missing_expression', 'The selected probe has no numeric expression values.', 422); }
    $threshold = U::getThrData($numeric, 0, count($numeric));
  }
  for ($index = 2; $index < count($row); $index++) {
    if (localstackIsNumeric($row[$index]) && is_finite((float) $row[$index])) { $row[$index] = (float) $row[$index]; }
  }
  return ['metadata' => [
    'id' => $id, 'name' => $hegem->getName($id), 'description' => $hegem->getDesc($id),
    'threshold' => (float) $threshold[0], 'statistic' => (float) $threshold[1],
    'low' => (float) $threshold[2], 'high' => (float) $threshold[3], 'thresholdSource' => $source
  ], 'row' => $row, 'pointer' => $hegem->getPtr($id)];
}

function apiPair($hegem, $request, $sampleIDs = null, $compact = false) {
  $geneA = apiString($request, 'geneA');
  $geneB = apiString($request, 'geneB');
  if ($geneA === '' || $geneB === '') { apiFail('missing_genes', 'Choose both genes.'); }
  $probeA = apiProbe($hegem, $geneA);
  $probeB = apiProbe($hegem, $geneB);
  if ($sampleIDs === []) { return ['x' => $probeA, 'y' => $probeB, 'samples' => []]; }
  $selected = $sampleIDs === null ? null : array_fill_keys($sampleIDs, true);
  $survivalSamples = array_fill_keys(apiSurvivalSampleIDs($hegem->rdataset), true);
  $samples = [];
  $columns = ['id' => [], 'x' => [], 'y' => [], 'hasSurvival' => []];
  for ($index = 2; $index < count($hegem->headers); $index++) {
    if ($selected !== null && !isset($selected[$hegem->headers[$index]])) { continue; }
    $valueA = $probeA['row'][$index];
    $valueB = $probeB['row'][$index];
    $hasSurvival = isset($survivalSamples[$hegem->headers[$index]]);
    if ($compact) {
      $columns['id'][] = $hegem->headers[$index];
      $columns['x'][] = localstackIsNumeric($valueA) && is_finite((float) $valueA) ? (float) $valueA : null;
      $columns['y'][] = localstackIsNumeric($valueB) && is_finite((float) $valueB) ? (float) $valueB : null;
      $columns['hasSurvival'][] = $hasSurvival;
      continue;
    }
    $samples[] = [
      'id' => $hegem->headers[$index],
      'x' => localstackIsNumeric($valueA) && is_finite((float) $valueA) ? (float) $valueA : null,
      'y' => localstackIsNumeric($valueB) && is_finite((float) $valueB) ? (float) $valueB : null,
      'color' => U::getColor($hasSurvival ? 0 : 1),
      'hasSurvival' => $hasSurvival
    ];
  }
  return ['x' => $probeA, 'y' => $probeB, 'samples' => $samples, 'sampleColumns' => $compact ? $columns : null];
}

function apiStreamSamples($metadata, $columns) {
  ob_clean();
  header('Content-Type: application/json; charset=utf-8');
  echo substr(localstackJsonEncode(['ok' => true] + $metadata, JSON_INVALID_UTF8_SUBSTITUTE), 0, -1) . ',"samples":[';
  for ($index = 0; $index < count($columns['id']); $index++) {
    if ($index > 0) { echo ','; }
    echo localstackJsonEncode(['id' => $columns['id'][$index], 'x' => $columns['x'][$index], 'y' => $columns['y'][$index],
      'color' => $metadata['defaultColors'][$columns['hasSurvival'][$index] ? 0 : 1]['color'],
      'hasSurvival' => $columns['hasSurvival'][$index]], JSON_INVALID_UTF8_SUBSTITUTE);
  }
  echo ']}';
}

function apiSampleIDs($request, $hegem, $name = 'samples') {
  $selected = $request[$name] ?? [];
  if (!is_array($selected) || count($selected) > $hegem->getNum()) { apiFail('invalid_samples', 'Supply an array of sample IDs.'); }
  $known = array_fill_keys(array_slice($hegem->headers, 2), true);
  $result = [];
  foreach ($selected as $sample) {
    if (!is_string($sample) || !isset($known[$sample])) { apiFail('invalid_samples', 'A sample is not part of this dataset.'); }
    $result[$sample] = true;
  }
  return array_keys($result);
}

function apiGroups($request, $hegem) {
  $groups = $request['groups'] ?? [];
  if (!is_array($groups) || count($groups) > 50) { apiFail('invalid_groups', 'Supply at most 50 groups.'); }
  $validated = [];
  foreach ($groups as $index => $group) {
    if (!is_array($group)) { apiFail('invalid_groups', 'Invalid group.'); }
    $name = apiString($group, 'name', 'Group ' . ($index + 1), 120);
    if ($name === '') { apiFail('invalid_groups', 'Group names must not be empty.'); }
    $color = apiString($group, 'color', '#2563eb', 7);
    if (!preg_match('/^#[0-9a-fA-F]{6}$/', $color)) { apiFail('invalid_groups', 'Use a six-digit hexadecimal group color.'); }
    $validated[] = ['name' => $name, 'color' => $color, 'samples' => apiSampleIDs($group, $hegem)];
  }
  return $validated;
}

function apiGroupString($groups) {
  $result = [];
  foreach ($groups as $index => $group) {
    $label = preg_replace('/[^\pL\pN _.+\-]/u', ' ', $group['name']);
    $label = 'Group ' . ($index + 1) . ' ' . trim(preg_replace('/\s+/', ' ', $label));
    $result[] = $index . '=' . $label . ',' . $group['color'] . '=' . implode(':', $group['samples']);
  }
  return implode(';', $result);
}

function getHegemon($config, $id) {
  global $apiActiveHegemon;
  if ($apiActiveHegemon && $apiActiveHegemon->rdataset->getID() === $id) { return $apiActiveHegemon; }
  apiFail('dataset_not_found', 'Unknown dataset.', 404);
}

function apiFigure($hegem, $pair, $request) {
  $format = apiString($request, 'format', 'png');
  $formats = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'svg' => 'image/svg+xml', 'pdf' => 'application/pdf'];
  if (!isset($formats[$format])) { apiFail('invalid_format', 'Choose png, jpg, svg, or pdf.'); }
  if (apiGroups($request, $hegem)) { apiFail('invalid_parameter', 'Scientific figures use all samples. Use population analysis for grouped exports.'); }
  foreach (['statistics', 'thresholds'] as $name) {
    if (isset($request[$name]) && !is_bool($request[$name])) { apiFail('invalid_parameter', 'Invalid ' . $name . '.'); }
  }
  $bounds = $request['bounds'] ?? null;
  if ($bounds !== null) {
    if (!is_array($bounds) || count($bounds) !== 4 || array_keys($bounds) !== [0, 1, 2, 3]) { apiFail('invalid_bounds', 'Supply four numeric axis bounds.'); }
    foreach ($bounds as $value) {
      if ((!is_int($value) && !is_float($value)) || !is_finite((float) $value) || abs($value) > 1000000000000) { apiFail('invalid_bounds', 'Supply finite numeric axis bounds.'); }
    }
    if ($bounds[0] >= $bounds[1] || $bounds[2] >= $bounds[3]) { apiFail('invalid_bounds', 'Axis bounds must be increasing.'); }
  }
  $genes = ['x' => $pair['x']['metadata'], 'y' => $pair['y']['metadata']];
  $caption = '';
  if ($request['statistics'] ?? false) {
    $sthr = apiString($request, 'sthr', '3', 40);
    $pthr = apiString($request, 'pthr', '0.1', 40);
    if (!localstackIsNumeric($sthr) || !localstackIsNumeric($pthr) || !is_finite((float) $sthr) || !is_finite((float) $pthr) || $sthr < 0 || $pthr < 0 || $pthr > 1) { apiFail('invalid_threshold', 'Use nonnegative SThr and PThr between zero and one.'); }
    $rowA = $pair['x']['row'];
    $rowB = $pair['y']['row'];
    $thresholdA = U::getThreshold($rowA, 2, count($rowA) - 2)[1];
    $thresholdB = U::getThreshold($rowB, 2, count($rowB) - 2)[1];
    $genes['x']['threshold'] = $thresholdA;
    $genes['y']['threshold'] = $thresholdB;
    $statistics = U::getBooleanStats($rowA, $rowB, $thresholdA - 0.5, $thresholdA + 0.5, $thresholdB - 0.5, $thresholdB + 0.5);
    $relation = U::getBooleanRelations($statistics, $sthr, $pthr);
    $formula = html_entity_decode(U::getFormula($genes['x']['name'], $genes['y']['name'], $relation), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $correlation = U::getXYStats($rowA, $rowB)['r '];
    $caption = $formula . ' | Correlation = ' . $correlation . ' | SThr = ' . $sthr . ' | PThr = ' . $pthr;
  }
  $payload = ['dataset' => ['id' => $hegem->rdataset->getID(), 'name' => $hegem->rdataset->getName()],
    'genes' => $genes, 'samples' => $pair['samples'], 'bounds' => $bounds,
    'sampleColumns' => $pair['sampleColumns'] ?? null,
    'thresholds' => $request['thresholds'] ?? true, 'caption' => $caption];
  $prefix = 'tmpdir/tmp' . bin2hex(random_bytes(16));
  $input = $prefix . '.json';
  $artifact = $prefix . '.' . $format;
  try {
    if (file_put_contents($input, localstackJsonEncode($payload)) === false) { apiFail('render_failed', 'Unable to prepare the scientific figure.', 503); }
    $command = implode(' ', array_map('escapeshellarg', [getenv('HEGEMON_PYTHON'), dirname(__DIR__) . '/scripts/python/scatter_export.py', $input, $artifact]));
    $process = proc_open($command,
      [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    if ($process === false) { apiFail('render_failed', 'Unable to start the scientific plotting runtime.', 503); }
    fclose($pipes[0]);
    stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    $error = stream_get_contents($pipes[2]);
    fclose($pipes[2]);
    $status = proc_close($process);
    if ($status !== 0 || !is_readable($artifact) || filesize($artifact) === 0) {
      error_log('Scientific figure export failed: ' . substr($error, 0, 4096));
      apiFail('render_failed', 'The scientific figure could not be generated. Check the server logs.', 503);
    }
    ob_clean();
    header('Content-Type: ' . $formats[$format]);
    header('Content-Disposition: attachment; filename="Hegemon-figure.' . $format . '"');
    readfile($artifact);
  } finally {
    U::cleanupfile($input);
    U::cleanupfile($artifact);
  }
}

function apiRender($hegem, $pair, $request, $config) {
  $type = apiString($request, 'type', 'png');
  if ($type === 'figure') {
    if (!is_dir('tmpdir') || !is_writable('tmpdir')) { apiFail('temporary_storage_unavailable', 'The plotting temporary directory is not writable.', 503); }
    apiFigure($hegem, $pair, $request);
    return;
  }
  $required = ['png' => 'png', 'boxplot' => 'boxplot', 'violin' => 'violin', 'survival' => 'survival', 'pdf' => 'pdf'];
  if (!is_dir('tmpdir') || !is_writable('tmpdir')) { apiFail('temporary_storage_unavailable', 'The plotting temporary directory is not writable.', 503); }
  if (!isset($required[$type])) { apiFail('invalid_type', 'Choose png, boxplot, violin, survival, or pdf.'); }
  if (!apiCapabilities($hegem->rdataset)[$required[$type]]) { apiFail('runtime_unavailable', 'The requested plotting runtime or data is unavailable.', 503); }
  $groups = apiGroups($request, $hegem);
  if ($type !== 'png' && $type !== 'pdf' && !$groups) { apiFail('missing_groups', 'Select sample groups first.'); }
  if ($type === 'survival') {
    $selected = [];
    foreach ($groups as $group) { foreach ($group['samples'] as $sample) { $selected[$sample] = true; } }
    $clinical = apiClinical($hegem, array_keys($selected));
    foreach ($groups as $group) {
      $eligible = 0;
      foreach ($group['samples'] as $sample) {
        $row = $clinical['rows'][$sample] ?? [];
        if (localstackIsNumeric($row[1] ?? '') && is_finite((float) $row[1]) && (float) $row[1] >= 0 && in_array(trim($row[2] ?? ''), ['0', '1'], true)) { $eligible++; }
      }
      if ($eligible === 0) { apiFail('missing_survival', 'A selected group has no valid survival measurements. Choose groups with numeric time and binary status.', 422); }
    }
  }
  if ($type === 'boxplot' || $type === 'violin') {
    $positions = array_flip($hegem->headers);
    foreach ($groups as $group) {
      $eligible = 0;
      foreach ($group['samples'] as $sample) {
        $value = $pair['y']['row'][$positions[$sample]];
        if (localstackIsNumeric($value) && is_finite((float) $value)) { $eligible++; }
      }
      if ($eligible === 0) { apiFail('missing_expression', 'A selected group has no numeric Gene B expression values.', 422); }
    }
  }
  $ct = apiString($request, 'ct', '', 40);
  if ($ct !== '' && !preg_match('/^\d+(?:\.\d+)?(?:,\d+(?:\.\d+)?)?$/', $ct)) { apiFail('invalid_ct', 'Censor time must be nonnegative.'); }
  $groupString = apiGroupString($groups);
  $prefix = 'tmpdir/tmp' . bin2hex(random_bytes(16));
  $expr = $hegem->getExprFile();
  $id = $hegem->rdataset->getID();
  $pointerA = $pair['x']['pointer'];
  $pointerB = $pair['y']['pointer'];
  $nameA = preg_replace('/[^\pL\pN _.:+-]/u', '', $pair['x']['metadata']['name']);
  $nameB = preg_replace('/[^\pL\pN _.:+-]/u', '', $pair['y']['metadata']['name']);
  try {
    if ($type === 'png') {
      U::generateMatPlot($expr, $hegem->getSurv(), $pointerA, $pointerB, $nameA, $nameB, $groupString, 0, $prefix, []);
    } elseif ($type === 'pdf') {
      U::generateTikzPlot($expr, $hegem->getSurv(), $pointerA, $pointerB, $nameA, $nameB, $ct, $groupString, 0, $prefix, ['source' => $hegem->getSource()]);
    } elseif ($type === 'survival') {
      $prefix = survivalImage($config, $expr, $id, $pointerA, $pointerB, $nameA, $nameB, $ct, $groupString);
    } elseif ($type === 'boxplot') {
      $prefix = boxplotImage($config, $expr, $id, $pointerA, $pointerB, $nameA, $nameB, $groupString);
    } else {
      $prefix = violinplotImage($config, $expr, $id, $pointerA, $pointerB, $nameA, $nameB, $groupString);
    }
    $artifact = $prefix . ($type === 'pdf' ? '.pdf' : '.png');
    if (!$prefix || !is_readable($artifact) || filesize($artifact) === 0) { apiFail('render_failed', 'The plot could not be generated. Check server runtime packages.', 503); }
    ob_clean();
    header('Content-Type: ' . ($type === 'pdf' ? 'application/pdf' : 'image/png'));
    header('Content-Disposition: attachment; filename="Hegemon-' . $type . ($type === 'pdf' ? '.pdf' : '.png') . '"');
    readfile($artifact);
  } finally {
    if ($prefix) {
      U::cleanup($prefix);
      foreach (['.pdf', '.tex', '.aux', '.log', '-1.pdf', '-2.pdf'] as $suffix) { U::cleanupfile($prefix . $suffix); }
    }
  }
}

function apiDispatch($request) {
  global $apiActiveHegemon, $colors;
  $colors = array_fill(0, 52, '#2563eb');
  $colors[0] = '#0000FF'; $colors[1] = '#558866';
  $config = getenv('HEGEMON_CONFIG') ?: dirname(__DIR__) . '/explore.conf';
  if (!is_readable($config)) { apiFail('configuration_unavailable', 'The dataset registry is unavailable.', 503); }
  $database = new Database($config);
  $action = apiString($request, 'action', 'datasets');
  if ($action === 'studies') {
    $studies = [];
    foreach ($database->getListKey(apiKeys($request)) as $dataset) {
      $local = $database->getDataset($dataset->getID());
      $studies[] = ['id' => $dataset->getID(), 'name' => $dataset->getName(),
        'source' => $dataset->getSource(),
        'keys' => array_values(array_filter(explode(':', $dataset->get('key')))),
        'available' => $local && is_readable($local->getExpr()) && is_readable($local->getIdx())];
    }
    return ['studies' => $studies];
  }
  if (in_array($action, ['export', 'analysis', 'render'], true) && ($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') { apiFail('method_not_allowed', 'Use POST for this action.', 405); }
  if ($action === 'datasets' || $action === 'catalogue') {
    $summary = apiString($request, 'summary', '0', 1);
    if (!in_array($summary, ['0', '1'], true)) { apiFail('invalid_parameter', 'Invalid summary mode.'); }
    $datasets = [];
    $unavailable = 0;
    foreach ($database->getListKey(apiKeys($request)) as $dataset) {
      if (!is_readable($dataset->getExpr()) || !is_readable($dataset->getIdx())) { $unavailable++; continue; }
      $info = apiDatasetInfo($dataset, null, $summary !== '1');
      if ($info['sampleCount'] > 0) { $datasets[] = $info; } else { $unavailable++; }
    }
    return ['datasets' => $datasets, 'meta' => ['unavailableCount' => $unavailable]];
  }
  $dataset = apiGetDataset($database, $request);
  if ($action === 'dataset') {
    return ['dataset' => apiDatasetInfo($dataset), 'clinicalFields' => apiClinicalFields($dataset)];
  }
  $hegem = apiHegemon($dataset, !in_array($action, ['dataset', 'clinical'], true));
  $apiActiveHegemon = $hegem;
  if ($action === 'genes') {
    $query = apiString($request, 'q');
    $genes = [];
    $exact = $query === '' ? [] : $hegem->getIDs($query);
    foreach ($hegem->idhash as $id => $values) {
      if ((string) $id === '' || (int) $values[0] <= 0) { continue; }
      if ($query !== '' && !isset($exact[$id]) && stripos($id, $query) === false && stripos($values[1], $query) === false) { continue; }
      $genes[] = ['id' => (string) $id, 'name' => $values[1], 'description' => $values[2]];
      if (count($genes) >= 100) { break; }
    }
    return ['genes' => $genes];
  }
  if ($action === 'clinical') {
    $field = apiString($request, 'field');
    $known = array_column(apiClinicalFields($hegem), 'id');
    if (!in_array($field, $known, true)) { apiFail('invalid_field', 'Choose an available clinical field.'); }
    $clinical = apiClinicalColumn($hegem, (int) $field);
    $values = [];
    foreach (array_slice($hegem->headers, 2) as $id) { $values[] = ['id' => $id, 'value' => $clinical[$id] ?? '']; }
    return ['values' => $values];
  }
  if (!in_array($action, ['plot', 'scatter', 'export', 'analysis', 'render'], true)) { apiFail('unknown_action', 'Unknown API action.', 404); }
  $sampleIDs = null;
  $validatedGroups = null;
  if ($action === 'export') { $exportedSamples = apiSampleIDs($request, $hegem); $sampleIDs = []; }
  if ($action === 'analysis') { $validatedGroups = apiGroups($request, $hegem); $sampleIDs = []; }
  if ($action === 'render' && ($request['type'] ?? 'png') !== 'figure') {
    $sampleIDs = [];
  }
  $compact = apiString($request, 'compact', '0', 1);
  if (!in_array($compact, ['0', '1'], true)) { apiFail('invalid_parameter', 'Invalid compact mode.'); }
  $columnar = (($compact === '1' || $hegem->getNum() > 5000) && in_array($action, ['plot', 'scatter'], true)) ||
    ($action === 'render' && ($request['type'] ?? 'png') === 'figure');
  $pair = apiPair($hegem, $request, $sampleIDs, $columnar);
  if ($action === 'export') {
    $selected = array_fill_keys($exportedSamples, true);
    ob_clean();
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="Hegemon-selected-samples.csv"');
    $output = fopen('php://output', 'w');
    localstackCsvWrite($output, ['ArrayID', $pair['x']['metadata']['id'], $pair['y']['metadata']['id']]);
    for ($sampleIndex = 2; $sampleIndex < count($hegem->headers); $sampleIndex++) {
      $identifier = $hegem->headers[$sampleIndex];
      if (!isset($selected[$identifier])) { continue; }
      $valueA = $pair['x']['row'][$sampleIndex];
      $valueB = $pair['y']['row'][$sampleIndex];
      localstackCsvWrite($output, [$identifier,
        localstackIsNumeric($valueA) && is_finite((float) $valueA) ? (float) $valueA : null,
        localstackIsNumeric($valueB) && is_finite((float) $valueB) ? (float) $valueB : null]);
    }
    fclose($output);
    return null;
  }
  if ($action === 'render') { apiRender($hegem, $pair, $request, $config); return null; }
  if ($action === 'analysis') {
    $summaries = [];
    $positions = array_flip($hegem->headers);
    foreach ($validatedGroups as $group) {
      $valuesX = []; $valuesY = [];
      foreach ($group['samples'] as $id) {
        $valueA = $pair['x']['row'][$positions[$id]];
        $valueB = $pair['y']['row'][$positions[$id]];
        if (localstackIsNumeric($valueA) && is_finite((float) $valueA)) { $valuesX[] = (float) $valueA; }
        if (localstackIsNumeric($valueB) && is_finite((float) $valueB)) { $valuesY[] = (float) $valueB; }
      }
      $summary = ['name' => $group['name'], 'sampleCount' => count($group['samples'])];
      foreach (['x' => $valuesX, 'y' => $valuesY] as $axis => $values) {
        sort($values, SORT_NUMERIC);
        $valueCount = count($values);
        $middle = intdiv($valueCount, 2);
        $summary[$axis] = ['n' => $valueCount, 'mean' => $values ? array_sum($values) / $valueCount : null,
          'median' => $values ? ($valueCount % 2 ? $values[$middle] : ($values[$middle - 1] + $values[$middle]) / 2) : null,
          'min' => $values ? $values[0] : null, 'max' => $values ? $values[$valueCount - 1] : null];
      }
      $summaries[] = $summary;
    }
    return ['groups' => $summaries];
  }
  $parameters = ['id' => $dataset->getID(), 'A' => $pair['x']['metadata']['id'], 'B' => $pair['y']['metadata']['id'], 'cmd' => 'explore', 'key' => apiString($request, 'key')];
  $plot = ['go' => 'plot', 'key' => apiString($request, 'key'), 'id' => $dataset->getID(), 'x' => $pair['x']['pointer'], 'y' => $pair['y']['pointer'], 'xn' => $pair['x']['metadata']['name'], 'yn' => $pair['y']['metadata']['name']];
  $metadata = ['dataset' => apiDatasetInfo($dataset, $hegem), 'genes' => ['x' => $pair['x']['metadata'], 'y' => $pair['y']['metadata']],
    'defaultColors' => [['color' => U::getColor(0), 'label' => 'With survival time and status'],
      ['color' => U::getColor(1), 'label' => 'Without survival time and status']],
    'plotUrl' => 'explore.php?' . http_build_query($plot), 'classicUrl' => 'explore.php?' . http_build_query($parameters)];
  if ($compact === '1') { return $metadata + ['sampleColumns' => $pair['sampleColumns']]; }
  if ($pair['sampleColumns'] !== null) { apiStreamSamples($metadata, $pair['sampleColumns']); return null; }
  return $metadata + ['samples' => $pair['samples']];
}

ob_start();
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
try {
  $request = array_merge($_GET, $_POST);
  if (str_contains($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) {
    $body = file_get_contents('php://input', false, null, 0, 2097153);
    if (strlen($body) > 2097152) { apiFail('request_too_large', 'Request exceeds two megabytes.', 413); }
    $decoded = json_decode($body, true);
    if (!is_array($decoded)) { apiFail('invalid_json', 'Supply a JSON object.'); }
    $request = array_merge($request, $decoded);
  }
  foreach (['file', 'path', 'config', 'x', 'y'] as $forbidden) {
    if (array_key_exists($forbidden, $request)) { apiFail('invalid_parameter', 'Use registered dataset and probe IDs.'); }
  }
  $response = apiDispatch($request);
  if ($response !== null) {
    ob_clean();
    header('Content-Type: application/json; charset=utf-8');
    echo localstackJsonEncode(['ok' => true] + $response, JSON_INVALID_UTF8_SUBSTITUTE);
  }
} catch (Throwable $error) {
  ob_clean();
  $expected = $error instanceof HegemonApiError;
  http_response_code($expected ? $error->status : 500);
  header('Content-Type: application/json; charset=utf-8');
  if (!$expected) { error_log((string) $error); }
  echo json_encode(['ok' => false, 'error' => ['code' => $expected ? $error->errorCode : 'internal_error',
    'message' => $expected ? $error->getMessage() : 'The server could not complete this analysis.']], JSON_INVALID_UTF8_SUBSTITUTE);
}
if (function_exists('gzencode') && !ini_get('zlib.output_compression') && !headers_sent()) {
  $acceptsGzip = preg_match('/(?:^|,)\s*gzip\s*(?:;\s*q=(0(?:\.\d+)?|1(?:\.0+)?))?\s*(?=,|$)/i', $_SERVER['HTTP_ACCEPT_ENCODING'] ?? '', $encoding);
  $json = false;
  foreach (headers_list() as $header) {
    if (stripos($header, 'Content-Type: application/json') === 0) { $json = true; }
  }
  if ($json && $acceptsGzip && (!isset($encoding[1]) || (float) $encoding[1] > 0)) {
    $compressed = gzencode(ob_get_contents(), 6);
    if ($compressed !== false) {
      ob_clean();
      header('Content-Encoding: gzip');
      header('Vary: Accept-Encoding', false);
      header('Content-Length: ' . strlen($compressed));
      echo $compressed;
    }
  }
}
ob_end_flush();
