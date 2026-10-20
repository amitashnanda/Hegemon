# Modern Application Flow

```text
Host: approved checkout + ignored registry + approved processed data
     │ read-only binds
Apptainer dependency image
     │
PHP development server: 127.0.0.1:PORT, restrictive scripts/router.php
     │ /Hegemon/
Public pages/assets → thin PHP entrypoints → app/ implementation
     │
Registry/probe index → direct expression-row seeks + clinical sample joins
     │
Java 21 / Python 3 / R / LaTeX helpers
     │
JSON + interactive frontend + runtime-generated scientific exports
```

The source application is the separately maintained Hegemon_Updated variant. Its PHP implementations are grouped under `app/`; public wrappers retain `api.php`, `explore.php`, and `stats.php`. CSS/JavaScript/images live under `assets/`, and Python helpers under `scripts/python/`. Explicit relocated paths and the application-root working directory preserve includes, scientific helper execution, Java classpaths and generated-output URLs.

This variant does not inherit every performance change made later in the native branch. In particular, do not assume the native ARCHS4 compact-transport/canvas/clinical-reader optimizations exist here without comparing the implementations. Packaging does not replace scientific algorithms to force branch equivalence.

The new Apptainer recipe builds dependencies only. No registry, host user identity, application source or processed dataset is embedded. At launch, the checkout and registry are read-only; explicitly selected data directories are read-only; Java source is copied to a private runtime class directory and compiled in the container. Figure output and caches are writable overlays under `runtime/modern/`.

`scripts/router.php` is essential: PHP's development server ignores `.htaccess`. It allows only the intended public pages/endpoints, selected asset types and recognized generated figure downloads; hidden files, Git metadata, registries, internal PHP, helpers, tests and runtime state are rejected. Canonical old asset URLs redirect without changing scientific API routes. The supplied `.htaccess` is for an independently reviewed Apache deployment, not active inside this PHP preview.

The registry contains metadata and file paths, not expression values. Probe indices map identifiers to byte offsets into the exact corresponding expression file. Expression headers define sample order; clinical records are matched by sample ID. Prefix-matched threshold and Boolean-vector companions enable additional analyses. Updating the private registry is visible to subsequent requests after refreshing the page.
