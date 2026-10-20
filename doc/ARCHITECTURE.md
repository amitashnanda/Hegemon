# Application and Data Flow

The native branch serves the modernized interface directly through Apache/PHP. It does not run a Java web server or application container.

```text
Browser: index.html / workspace.html / manual.html
   │       assets/css, assets/js, assets/images, assets/vendor
   ├── api.php ─────── app/api.php
   ├── explore.php ─── app/explore.php
   └── stats.php ───── app/stats.php
                          │
                   bootstrap + configuration
                          │
                   private explore.conf
                          │
             registered processed files only
                          │
             indexed expression / clinical joins
                          │
             PHP statistics and Java/Python/R/LaTeX helpers
                          │
             JSON / interactive plot / generated export
```

`app/hegemon.php` reads the registry, resolves probes and uses stored byte offsets to seek directly to expression rows. The index must match the exact expression file; offsets are positions in the file, not extra matrix columns. Sample IDs in the expression header determine expression order; clinical records are joined using sample identity. Supplementary header annotations are separate from that join.

`app/util.php` and `app/groups.php` retain the scientific calculations, group operations and report generation. `app/bootstrap.php` supplies compatibility/configuration defaults. Java sources stay in `tools/` so the `tools.Hegemon` classpath remains intact. Explicit relocated paths select Python/R helpers under `scripts/`; all public PHP entrypoints use the application root as their working directory.

The native variant retains its deployed large-population optimizations: iterative bounds, canvas points with SVG axes, lazy/paginated sample lists, compact expression transport, and selective clinical metadata readers. These preserve the full sample population rather than downsampling. The separately sourced modern branch should not be assumed to contain every native-branch optimization.

The registry is read per request. Dataset registration changes therefore need a page refresh rather than an application rebuild. Processed data are never embedded in the public source tree. Companion threshold/Boolean-vector files are located using registered fields or the dataset prefix.

Figures, generated scripts, reports and metadata caches are private local runtime artifacts. `.htaccess` permits the intended pages/assets and recognized figure downloads while rejecting internal code, configuration, Git metadata and tests. Do not change the served directory's layout without updating both paths and access restrictions.
