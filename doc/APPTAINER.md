# Apptainer Runtime

## Image Contents

`containers/apptainer/Apptainer.def` is a dependency-only rebuild recipe based on Debian trixie. It installs modern PHP/GD, Java, Python scientific packages, R/survival/ggplot2, LaTeX, and browser/PDF test tools. Only the public Python requirements file is copied during construction. Application source and private registries/data are never image build inputs.

The existing reference stack was PHP 8.4.26, Java 21.0.12.1, Python 3.13.5, R 4.5.0, survival 3.8.3 and Debian TeX Live 2025/dev. Distribution packages are not locked to immutable hashes; a fresh build may receive newer patch releases. Record the generated `/opt/hegemon/debian-packages.txt` and `python-packages.txt` manifests when reporting reproducibility. Prebuilt SIF/OCI archives are intentionally absent from Git.

## Build and Launch

```bash
bash scripts/build-apptainer.sh
HEGEMON_PORT=8084 bash scripts/run-apptainer.sh \
  --data /absolute/path/to/approved-files:/data
```

Use registry paths under `/data` for this example. Repeat `--data HOST:TARGET` for multiple explicitly approved roots, including same-path mappings where an unchanged registry needs them. Root/system/application destination mappings are rejected. No permissions are granted by a bind, and the runner does not inspect a registry and automatically expose its parent filesystems.

`HEGEMON_APPTAINER_BIN` selects an existing executable. `HEGEMON_APPTAINER_IMAGE` selects the image. `HEGEMON_CONFIG` selects the private host registry. All these settings are per process; host system packages, global environments and original images are not modified.

The runner uses `--cleanenv --containall --no-home`; private Apptainer caches/config stay under the selected runtime directory. Temporary extraction/build work uses a private temporary directory that the launcher removes on exit. The source mount is read-only, generated Java classes use a writable overlay, and plot/cache writes use a separate writable overlay. The web process binds only to loopback and uses the restrictive router.

The checkout mount includes whatever local files are in that checkout, including ignored files; the HTTP router blocks private paths, but this is not a hostile-code security sandbox. Keep unrelated secrets outside the checkout, review scientific helper behavior, and bind only approved data. Containment flags do not replace an independent application/security review.

## Testing Without Installing Host Packages

Run the portable API smoke check from an approved Python 3 environment against the loopback URL. It does not need expression files directly or save response bodies by default:

```bash
python3 tests/smoke.py --base-url http://127.0.0.1:8084/Hegemon/ --render
```

For optional browser checks, use a separate Playwright/Chromium environment and set `HEGEMON_TEST_PYTHON`, `HEGEMON_TEST_BASE_URL`, and optionally `HEGEMON_CHROMIUM` before `bash scripts/test-browser.sh`. The dependency image contains Chromium/Playwright, but exposing a browser-driver command is separate from serving the application. Do not run arbitrary host-wide binds merely to access test fixtures.

The PHP worker count defaults to four and can be limited with `HEGEMON_WORKERS`. This is a local development/testing server, not a production web-service design. Stop it before switching branches; review runtime permissions and administrator routing separately for deployment.
