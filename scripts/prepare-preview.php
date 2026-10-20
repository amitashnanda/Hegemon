<?php

$root = dirname(__DIR__);
require $root . '/app/bootstrap.php';
$port = $argv[1] ?? '8092';
if (!ctype_digit($port) || (int) $port < 1024 || (int) $port > 65535) {
  fwrite(STDERR, "Choose a loopback port between 1024 and 65535.\n"); exit(1);
}
$settings = require $root . '/config/localstack-config.php';
$registry = getenv('HEGEMON_CONFIG') ?: $settings['HEGEMON_CONFIG'];
if (!is_readable($registry)) { fwrite(STDERR, "The selected registry is unreadable.\n"); exit(1); }
foreach ([$root, $registry] as $path) {
  if (strpbrk($path, "\r\n\"") !== false) { fwrite(STDERR, "Unsupported quote or newline in preview path.\n"); exit(1); }
}
$runtime = $root . '/runtime/main/port-' . $port;
if (!is_dir($runtime) && !mkdir($runtime, 0700, true)) { fwrite(STDERR, "Cannot create private preview state.\n"); exit(1); }
$uid = posix_geteuid(); $gid = posix_getegid();
$moduleDirectory = getenv('HEGEMON_APACHE_MODULE_DIR') ?: '/usr/lib/apache2/modules';
$phpModule = getenv('HEGEMON_APACHE_PHP_MODULE') ?: $moduleDirectory . '/libphp7.2.so';
$serverRoot = getenv('HEGEMON_APACHE_ROOT') ?: '/etc/apache2';
$mimeTypes = getenv('HEGEMON_MIME_TYPES') ?: '/etc/mime.types';
foreach ([$moduleDirectory, $phpModule, $serverRoot, $mimeTypes] as $path) {
  if (strpbrk($path, "\r\n\"") !== false) { fwrite(STDERR, "Unsupported server configuration path.\n"); exit(1); }
}
if (!is_readable($phpModule) || !is_readable($mimeTypes)) { fwrite(STDERR, "Configure the installed Apache PHP module and MIME types paths.\n"); exit(1); }
$configuration = <<<CONFIG
ServerRoot "$serverRoot"
ServerName 127.0.0.1
Listen 127.0.0.1:$port
PidFile "$runtime/httpd.pid"
DefaultRuntimeDir "$runtime"
ErrorLog "$runtime/apache-error.log"
LogLevel warn
KeepAlive Off
StartServers 2
MinSpareServers 2
MaxSpareServers 4
MaxRequestWorkers 4
MaxConnectionsPerChild 100
User #$uid
Group #$gid
LoadModule mpm_prefork_module "$moduleDirectory/mod_mpm_prefork.so"
LoadModule authz_core_module "$moduleDirectory/mod_authz_core.so"
LoadModule authz_host_module "$moduleDirectory/mod_authz_host.so"
LoadModule dir_module "$moduleDirectory/mod_dir.so"
LoadModule alias_module "$moduleDirectory/mod_alias.so"
LoadModule mime_module "$moduleDirectory/mod_mime.so"
LoadModule env_module "$moduleDirectory/mod_env.so"
LoadModule rewrite_module "$moduleDirectory/mod_rewrite.so"
LoadModule php7_module "$phpModule"
TypesConfig "$mimeTypes"
AddType application/x-httpd-php .php
DirectoryIndex index.html
DocumentRoot "$runtime"
<Directory />
AllowOverride None
Require all denied
</Directory>
Alias /Hegemon/ "$root/"
<Directory "$root">
AllowOverride FileInfo Indexes AuthConfig Limit
Require local
</Directory>
SetEnv HEGEMON_CONFIG "$registry"
php_admin_value memory_limit 128M
php_admin_value max_execution_time 300
php_admin_value error_log "$runtime/php-error.log"
php_admin_flag log_errors On
php_admin_flag display_errors Off
php_admin_value sys_temp_dir "$root/tmpdir"
CONFIG;
$file = $runtime . '/httpd.conf';
if (file_put_contents($file, $configuration . "\n", LOCK_EX) === false) { exit(1); }
chmod($file, 0600);
echo $file . "\n";
