<?php

$root = dirname(__DIR__);
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/');
if ($path === '/' || $path === '/Hegemon') {
  header('Location: /Hegemon/index.html', true, 302); return true;
}
if (!str_starts_with($path, '/Hegemon/') || preg_match('/[\x00-\x20\x7f\\\\]/', $path) || preg_match('~(^|/)\.~', $path)) {
  http_response_code(403); echo 'Forbidden'; return true;
}
$relative = substr($path, strlen('/Hegemon/'));
if ($relative === '') { header('Location: /Hegemon/index.html', true, 302); return true; }
$redirect = null;
if (preg_match('~^([A-Za-z0-9-]+)\.(css|js)$~', $relative, $match)) {
  $redirect = 'assets/' . $match[2] . '/' . $relative;
} elseif (str_starts_with($relative, 'Images/')) {
  $redirect = 'assets/images/' . substr($relative, strlen('Images/'));
} elseif ($relative === 'gtag.html') {
  $redirect = 'assets/html/gtag.html';
}
if ($redirect !== null && is_file($root . '/' . $redirect)) {
  header('Location: /Hegemon/' . $redirect, true, 302); return true;
}
$allowed = in_array($relative, ['index.html', 'workspace.html', 'manual.html', 'api.php', 'explore.php', 'stats.php'], true) ||
  preg_match('~^assets/.+\.(?:css|js|html|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|csv|pdf)$~i', $relative) ||
  preg_match('~^tmpdir/[^/]+\.(?:png|jpg|jpeg|gif|pdf)$~i', $relative);
if (!$allowed) { http_response_code(403); echo 'Forbidden'; return true; }
$filename = realpath($root . '/' . $relative);
if ($filename === false || !is_file($filename) || !str_starts_with($filename, realpath($root) . '/')) {
  http_response_code(404); echo 'Not found'; return true;
}
return false;
