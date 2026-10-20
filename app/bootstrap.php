<?php

foreach (require dirname(__DIR__) . '/config/runtime-config.php' as $name => $value) {
  if (getenv($name) === false || getenv($name) === '') { putenv($name . '=' . $value); }
}
