<?php

function apiCachedValue($kind, $path, $compute) {
  static $values = [];
  clearstatcache(true, (string) $path);
  $status = $path ? @stat($path) : false;
  if (!$status) { return $compute(); }
  $key = hash('sha256', $kind . "\n" . $path);
  $stamp = [$status['dev'], $status['ino'], $status['size'], $status['mtime'], $status['ctime']];
  $memoryKey = $key . ':' . implode(':', $stamp);
  if (array_key_exists($memoryKey, $values)) { return $values[$memoryKey]; }
  $directory = dirname(__DIR__) . '/tmpdir/metadata-cache';
  $file = $directory . '/' . $key . '.json';
  if (is_readable($file)) {
    $cached = json_decode(file_get_contents($file), true);
    if (is_array($cached) && ($cached['stamp'] ?? null) === $stamp && array_key_exists('value', $cached)) {
      return $values[$memoryKey] = $cached['value'];
    }
  }
  $value = $compute();
  $values[$memoryKey] = $value;
  if (!is_dir($directory) && is_writable(dirname($directory))) { @mkdir($directory, 0700); }
  if (is_dir($directory) && is_writable($directory)) {
    $temporary = $directory . '/tmp' . bin2hex(random_bytes(12)) . '.json';
    $encoded = json_encode(['stamp' => $stamp, 'value' => $value]);
    if ($encoded !== false && @file_put_contents($temporary, $encoded, LOCK_EX) !== false) {
      @chmod($temporary, 0600);
      if (!@rename($temporary, $file)) { @unlink($temporary); }
    }
  }
  return $value;
}

function apiSampleCount($dataset) {
  static $counts = null;
  static $dirty = [];
  $directory = dirname(__DIR__) . '/tmpdir/metadata-cache';
  $file = $directory . '/sample-counts.json';
  if ($counts === null) {
    $counts = is_readable($file) ? json_decode(file_get_contents($file), true) : [];
    if (!is_array($counts)) { $counts = []; }
    register_shutdown_function(static function () use (&$dirty, $directory, $file) {
      if (!$dirty) { return; }
      if (!is_dir($directory) && is_writable(dirname($directory))) { @mkdir($directory, 0700); }
      if (!is_writable($directory)) { return; }
      $lock = @fopen($directory . '/sample-counts.lock', 'c');
      if (!$lock || !flock($lock, LOCK_EX)) { if ($lock) { fclose($lock); } return; }
      $latest = is_readable($file) ? json_decode(file_get_contents($file), true) : [];
      if (!is_array($latest)) { $latest = []; }
      foreach ($dirty as $key => $value) { $latest[$key] = $value; }
      $temporary = $directory . '/tmp' . bin2hex(random_bytes(12)) . '.json';
      if (@file_put_contents($temporary, json_encode($latest)) !== false) {
        @chmod($temporary, 0600);
        if (!@rename($temporary, $file)) { @unlink($temporary); }
      }
      flock($lock, LOCK_UN);
      fclose($lock);
    });
  }
  $path = $dataset->getExpr();
  clearstatcache(true, $path);
  $status = @stat($path);
  if (!$status) { return 0; }
  $key = hash('sha256', $path);
  $stamp = [$status['dev'], $status['ino'], $status['size'], $status['mtime'], $status['ctime']];
  if (isset($counts[$key]) && $counts[$key]['stamp'] === $stamp) { return $counts[$key]['value']; }
  $stream = @fopen($path, 'r');
  if (!$stream) { return 0; }
  $header = fgets($stream);
  fclose($stream);
  $value = max(0, substr_count(rtrim((string) $header, "\r\n"), "\t") - 1);
  $counts[$key] = ['stamp' => $stamp, 'value' => $value];
  $dirty[$key] = $counts[$key];
  return $value;
}

function apiReadClinicalPrefix($stream, $count) {
  $offset = ftell($stream);
  $line = fgets($stream);
  if ($line === false) { return false; }
  if (strpos($line, '"') !== false) {
    if (fseek($stream, $offset) !== 0) { throw new RuntimeException('Unable to read a quoted clinical record.'); }
    $row = localstackCsvRead($stream, "\t");
    return $row === false ? false : array_slice($row, 0, $count);
  }
  $record = rtrim($line, "\r\n");
  return $record === '' ? [null] : array_slice(explode("\t", $record, $count + 1), 0, $count);
}

function apiSurvivalSampleIDs($dataset) {
  $path = $dataset->getSurv();
  if (!$path || !is_readable($path)) { return []; }
  return apiCachedValue('survival-sample-ids-v1', $path, static function () use ($path) {
    $stream = fopen($path, 'r');
    fgets($stream);
    $identifiers = [];
    while (($line = fgets($stream)) !== false) {
      $row = explode("\t", rtrim($line, "\r\n"), 4);
      if (count($row) < 3) { continue; }
      $time = preg_replace('/\s/i', '', $row[1]);
      $status = preg_replace('/\s/i', '', $row[2]);
      if (localstackIsNumeric($time) && is_finite((float) $time) && (float) $time >= 0 && in_array($status, ['0', '1'], true)) {
        $identifiers[$row[0]] = true;
      }
    }
    fclose($stream);
    return array_keys($identifiers);
  });
}

function apiClinicalFields($hegem) {
  $path = $hegem->getSurv();
  if (!$path) { return []; }
  return apiCachedValue('clinical-fields-v1', $path, static function () use ($path) {
    $stream = @fopen($path, 'r');
    if (!$stream) { return []; }
    $header = localstackCsvRead($stream, "\t");
    fclose($stream);
    $fields = [];
    foreach (($header ?: []) as $index => $name) {
      if ($index > 0) { $fields[] = ['id' => (string) $index, 'name' => $name]; }
    }
    return $fields;
  });
}

function apiClinicalColumn($hegem, $column) {
  $path = $hegem->getSurv();
  if (!$path || !is_readable($path)) { return []; }
  $stream = fopen($path, 'r');
  localstackCsvRead($stream, "\t");
  $known = array_fill_keys(array_slice($hegem->headers, 2), true);
  $values = [];
  while (($row = apiReadClinicalPrefix($stream, $column + 1)) !== false) {
    if (isset($known[$row[0] ?? ''])) { $values[$row[0]] = $row[$column] ?? ''; }
  }
  fclose($stream);
  return $values;
}
