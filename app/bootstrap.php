<?php

foreach (require dirname(__DIR__) . '/config/localstack-config.php' as $name => $value) {
  if (getenv($name) === false || getenv($name) === '') { putenv($name . '=' . $value); }
}

if (!function_exists('str_contains')) {
  function str_contains($haystack, $needle) {
    return $needle === '' || strpos($haystack, $needle) !== false;
  }
}

if (!function_exists('str_starts_with')) {
  function str_starts_with($haystack, $needle) {
    return $needle === '' || strncmp($haystack, $needle, strlen($needle)) === 0;
  }
}

if (!function_exists('str_ends_with')) {
  function str_ends_with($haystack, $needle) {
    return $needle === '' || (strlen($haystack) >= strlen($needle) && substr($haystack, -strlen($needle)) === $needle);
  }
}

if (!function_exists('array_key_first')) {
  function array_key_first(array $values) {
    foreach ($values as $key => $value) { return $key; }
    return null;
  }
}

function localstackJsonEncode($value, $flags = 0) {
  $encoded = json_encode($value, $flags);
  if ($encoded === false) { throw new RuntimeException('JSON encoding failed: ' . json_last_error_msg()); }
  return $encoded;
}

function localstackIsNumeric($value) {
  return is_numeric(is_string($value) ? rtrim($value, " \t\n\r\v\f") : $value);
}

function localstackCsvRead($stream, $delimiter = ',') {
  return fgetcsv($stream, 0, $delimiter, '"', "\0");
}

function localstackCsvWrite($stream, array $fields) {
  $encoded = [];
  foreach ($fields as $field) {
    $field = is_float($field) ? localstackJsonEncode($field) : (string) $field;
    if (strpbrk($field, ",\"\r\n\t ") !== false) { $field = '"' . str_replace('"', '""', $field) . '"'; }
    $encoded[] = $field;
  }
  return fwrite($stream, implode(',', $encoded) . "\n");
}
