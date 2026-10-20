# Hegemon — Modern Stack

**Interactive gene-expression and Boolean implication analysis with an isolated modern scientific runtime.**

This branch packages the separately maintained **Hegemon_Updated** application in the same structured layout as the native variant, with an Apptainer dependency image and local launchers. Original software: Debashis Sahoo, Boolean Lab, UC San Diego; upstream [sahoo00/Hegemon](https://github.com/sahoo00/Hegemon).

![Hegemon workspace](assets/images/manual/04-workspace.png)

[Native-stack branch](https://github.com/amitashnanda/Hegemon/tree/main) · [User manual](manual.html) · [Security](SECURITY.md) · [Branches/publication](doc/PUBLISHING.md)

## Branch Differences

| Branch | Application source | Runtime |
| --- | --- | --- |
| `main` | Deployed updated native-stack variant, including its ARCHS4-specific loading/rendering optimizations | Existing Apache/PHP 7.2, Java 8, Python 2.7, R and LaTeX |
| **`modern-stack` — this branch** | Separately maintained Hegemon_Updated source, reorganized without replacing its scientific implementation | PHP 8.4, Java 21, Python 3, R and LaTeX in Apptainer |

This is not simply the native branch with newer interpreter names. Do **not** assume that its separately sourced frontend/backend includes every native-branch large-dataset optimization. Test an intended workload before deployment or merging fixes between variants.

## Features

- Study categories, dataset search/provenance links, gene/probe lookup, and expression exploration.
- Interactive scatterplots with hover, zoom/pan, threshold overlays, rectangular sample selection, and reset controls.
- Clinical highlighting, sample-group set operations, population summaries, and downloadable selections.
- MiDReG/Boolean relationships, correlation, differential analysis, box/violin plots, Kaplan–Meier survival, and scientific reports when the necessary processed data are available.
- PNG/JPEG/SVG/PDF figures, CSV, survival R scripts, and an illustrated **How to use** manual.

Gene A is plotted on x and Gene B on y. Dataset selection does not automatically plot; use **Find probes → Explore expressions**. Default blue/green points distinguish samples with/without eligible survival metadata, not biological classes.

## Requirements

- A **Linux** host with an administrator-approved Apptainer installation. No GPU is needed.
- Bash, Git, and `sha256sum` for the optional public Kim download; Python 3 on the host is optional for the validation tests.
- A readable registry and processed datasets. Private lab data are not included; the explicit example setup below downloads only upstream's public Kim files.
- A writable checkout/runtime directory and space for a substantial scientific dependency image and temporary extraction/build files.
- Building the dependency image requires internet access and an approved fakeroot/user-namespace setup or an administrator-operated build host. It does not install packages in the host environment.

### Modern reference stack

The existing reference image used PHP **8.4.26**, OpenJDK **21.0.12.1**, Python **3.13.5**, R **4.5.0** with `survival` **3.8.3**, and Debian's **TeX Live 2025/dev**. The supplied recipe uses **Debian trixie** packages plus the reference Python requirements. New builds can receive distribution/security updates; these observations are not a fully pinned reproducibility lock. Installed package manifests are written into the image under `/opt/hegemon/`.

The recipe includes PHP/GD, Java, scientific Python packages, R/survival/ggplot2, LaTeX, and optional browser/PDF test utilities. PHP orchestrates Java/Python/R/LaTeX; Java is not the web server. No npm build, SQL database, or application GPU is required.

## Local Setup with Apptainer

### 1. Obtain this branch

```bash
git clone --branch modern-stack https://github.com/amitashnanda/Hegemon.git
cd Hegemon
```

In an existing clone, stop previews and use `git checkout modern-stack` (compatible with Git 2.17 and newer).

### 2. Download the public Kim example and select its registry

```bash
bash scripts/fetch-kim-example.sh
mkdir -p runtime/kim-example/container
test -f runtime/kim-example/container/explore.conf || cp config/explore.conf.example runtime/kim-example/container/explore.conf
export HEGEMON_CONFIG="$PWD/runtime/kim-example/container/explore.conf"
```

The explicit download command retrieves only the five public Kim files from [upstream Hegemon](https://github.com/sahoo00/Hegemon/tree/2300b4964c1e79326031a4cef2cc7c192764374b), pinned to revision `2300b4964c1e79326031a4cef2cc7c192764374b` and verified against `config/kim-example.sha256`. Allow approximately **70 MB for the extracted data**, plus temporary Git download space and network access to GitHub. Re-running verifies existing files without overwriting them. Application startup never downloads data.

This example registers **only `B1`**, following upstream's name and four processed-file fields. It adds the category/provenance fields used by this interface. Container paths are intentional: step 4 binds the downloaded host directory at `/data`.

```ini
title=Hierarchical Exploration of Gene Expression Microarrays Online

[B1]
name= Kim 2010 bladder cancer Cancer Specific
expr= /data/kim-2010-bladder-expr.txt
index= /data/kim-2010-bladder-idx.txt
survival= /data/kim-2010-bladder-os.txt
indexHeader= /data/kim-2010-bladder-ih.txt
key= bladder:
source= GSE13507
```

Both the downloaded `data/` and selected registry under `runtime/` stay ignored by Git. Existing root `explore.conf` is not overwritten. For other datasets, select your own ignored registry using `HEGEMON_CONFIG`, and ensure its paths match the **container-side** read-only data locations passed with `--data`. Root `explore.conf` remains the default if `HEGEMON_CONFIG` is unset.

Required expression exploration files are the matrix (`expr`) and matching byte-offset probe index (`index`). Clinical/survival, header annotations, probe information, stored thresholds, and Boolean vectors enable additional features. Companion `*-thr.txt` and `*-bv.txt` may be found from a shared dataset prefix even when not explicit registry lines. Supply a consistent processed dataset, not only the registry.

The public upstream example contains `expr`, `idx`, `os`, `ih`, and `thr`. Its threshold file is inferred from the expression prefix, not a fifth registry field. Upstream does **not** provide `info` or `bv` for this minimal example; features requiring those companions need a separately prepared complete dataset. Existing tutorial screenshots use the lab registry ID `B2.1`; the reproducible upstream example here uses `B1`.

### 3. Build a dependency image

```bash
bash scripts/build-apptainer.sh
```

The default output is ignored `runtime/modern/hegemon-modern.sif`. Set `HEGEMON_APPTAINER_BIN` if Apptainer is not on PATH, and `HEGEMON_APPTAINER_IMAGE` for a different output path. The script refuses to overwrite an existing image. It defaults to `--fakeroot`; if that is unavailable, ask an administrator to build the image on an approved host. `HEGEMON_APPTAINER_FAKEROOT=0` disables that flag for a build environment that already supplies the required privilege; it does not grant privilege.

**The new image contains dependencies only.** It does not bake in application source, real registries, processed datasets, user IDs, or host paths. Do not commit SIF/OCI images, and do not upload a historical image merely because its filename looks correct: old images can retain private data in their layers.

### 4. Start the local application

Keep the `HEGEMON_CONFIG` export from step 2 in this terminal. For the downloaded public example:

```bash
HEGEMON_PORT=8084 bash scripts/run-apptainer.sh \
  --data "$PWD/data/kim-2010:/data"
```

Open **http://127.0.0.1:8084/Hegemon/index.html** on that Linux host. Keep the terminal open; **Ctrl-C stops the preview**.

The runner binds the checkout **read-only**, the private registry **read-only**, and each explicitly approved data directory **read-only**. Writable Java build output, plots, caches, and runtime state stay under ignored `runtime/modern/`. Source Java is compiled for Java 21 inside the image. The existing host environment, public Apache, and original applications are not modified.

For multiple processed-data directories, repeat the option:

```bash
HEGEMON_PORT=8084 bash scripts/run-apptainer.sh \
  --data /absolute/path/to/study-one:/data/study-one \
  --data /absolute/path/to/study-two:/data/study-two
```

Use those container paths in the registry. An existing absolute-path registry can instead retain its paths by explicitly binding each approved host data directory to the **same** absolute container path. The launcher rejects root/system/application destination mounts and does not automatically bind all directories from a registry or bypass filesystem permissions.

### 5. Optional Mac SSH tunnel

In a Mac terminal, replace the SSH destination:

```bash
ssh -N -o ExitOnForwardFailure=yes \
  -L 127.0.0.1:19094:127.0.0.1:8084 YOUR_USER@YOUR_SERVER
```

Then open **http://127.0.0.1:19094/Hegemon/index.html** on the Mac. Keep both terminals open. Change the Mac port independently if busy; the remote port must match `HEGEMON_PORT`. The application listens only on loopback, not a new public address.

## Runtime Settings

| Setting | Purpose |
| --- | --- |
| `HEGEMON_APPTAINER_BIN` | Apptainer executable; default `apptainer` |
| `HEGEMON_APPTAINER_IMAGE` | Dependency SIF; default `runtime/modern/hegemon-modern.sif` |
| `HEGEMON_CONFIG` | Private host registry; default root `explore.conf`, bound at `/registry/explore.conf` |
| `HEGEMON_PORT` | Loopback port; default `8084` |
| `HEGEMON_WORKERS` | PHP development-server workers; default `4`, allowed `1`–`16` |
| `HEGEMON_RUNTIME_DIR` | Local writable outputs/classes/cache; default `runtime/modern/` |

For an already approved native modern stack, `bash scripts/check-stack.sh` and `bash scripts/run-local.sh` provide an alternative PHP 8.4 CLI preview. Edit ignored `config/runtime.local.php`, based on `config/runtime.example.php`, or set the `HEGEMON_PYTHON`, `HEGEMON_JAVA`, `HEGEMON_R`, and `HEGEMON_PDFLATEX` environment values. Native compilation needs Java 21. This route is optional and is not a request to upgrade the legacy host's system packages.

The web server here is **PHP's development server inside Apptainer**, using a restrictive router. It is intended for local validation, not public production traffic. `.htaccess` alone is ineffective for this server. Administrator-reviewed production hosting is a separate deployment task.

Build/extraction temporary directories use `TMPDIR` (default `/tmp`). Prefer a writable local temporary disk with sufficient free space; extracting a scientific image onto a shared filesystem can be much slower. This is separate from the ignored application outputs under `HEGEMON_RUNTIME_DIR`.

## Example Analysis

1. Select **Bladder cancer → View** and **Kim 2010 bladder cancer Cancer Specific** (`B1`).
2. Inspect dataset information, keep **TYROBP / FCER1G**, and use **Find probes → Explore expressions**.
3. Hover/zoom or draw a rectangle with **Select samples** to create a population.
4. Highlight patient information, use group set operations, and run supported population analyses.
5. Export a figure, selected samples, survival script, or PDF report. Eligible outcomes and corresponding processed companions must exist; not all datasets have every capability.

Open **How to use** for the full illustrated guide. Tutorial illustrations/downloads refer to public GEO GSE13507, not bundled raw processed datasets.

## Project Structure

```text
Hegemon/
├── index.html, workspace.html, manual.html  Public pages
├── api.php, explore.php, stats.php         Stable entrypoints
├── app/                                   Modern PHP application/scientific implementation
├── config/                                Public examples and ignored local overrides
├── assets/                                CSS, JavaScript, images, vendor/tutorial assets
├── scripts/                               Launch/build/check/router/test helpers
│   └── python/                            Python 3 scientific helpers
├── containers/apptainer/                   Dependency-only recipe and Python requirements
├── tools/                                 Java source; runtime classes are ignored
├── tmpdir/                                Local outputs; container overlays its runtime plots
├── runtime/modern/                        Ignored image, compiled classes, caches and outputs
├── tests/                                 Packaging, API and browser checks
└── doc/                                   Architecture, preparation, publication and runtime notes
```

## Testing

In a second terminal at this checkout, with the Kim `B1` preview running:

```bash
python3 tests/test_packaging.py
python3 tests/test_kim_example.py
python3 tests/smoke.py --base-url http://127.0.0.1:8084/Hegemon/ --dataset B1 --render
```

The checks exercise page/asset routes, internal-file protection, probe lookup, full sample counts, independent group means, CSV, clinical alignment, error handling, and optional PNG/box/violin/PDF/survival generation. Dataset/probe arguments can select another registered cohort. Optional `scripts/test-browser.sh` needs a separate Playwright/Chromium test environment; see [runtime notes](doc/APPTAINER.md).

For an optional browser workflow check using your approved test environment:

```bash
HEGEMON_TEST_PYTHON=/path/to/test-environment/bin/python \
HEGEMON_TEST_BASE_URL=http://127.0.0.1:8084/Hegemon/ bash scripts/test-browser.sh --dataset B1 --key bladder
```

These are actual-data checks, not a promise that every registry entry or large population has been validated. See [preparation/verification notes](doc/REPOSITORY_PREPARATION.md) for what was actually run. A fresh internet-backed dependency-image build is distinct from testing application source inside an existing compatible dependency image.

## Troubleshooting and Security

- **Missing datasets:** check the actual container paths, explicit data binds, registry category keys, and the invoking user's read/traverse permissions.
- **Fakeroot/build unavailable:** use an administrator-approved build host; do not install/upgrade host runtimes or bypass permissions.
- **Figure/report errors:** check scientific packages, read-only data access, and writable runtime storage; not every cohort has survival data.
- **Busy port/tunnel:** choose another preview/Mac port and keep the remote tunnel destination consistent.
- **Stale image/code:** the dependency image intentionally contains no code; the runner mounts this branch's source and recompiles its Java. Changing branches still requires stopping the preview and checking registry paths.

Real registries, datasets, private config, credentials, output reports, logs, compiled artifacts, and container images are ignored. Analytics is disabled. Review staged content and history before pushing; ignore rules cannot erase committed secrets. Read [SECURITY.md](SECURITY.md), [architecture](doc/ARCHITECTURE.md), [Apptainer notes](doc/APPTAINER.md), and [publication guidance](doc/PUBLISHING.md).

## Acknowledgements

- **Original software and research framework:** Boolean Lab, led by **Debashis Sahoo**, University of California San Diego, for developing Hegemon and its scientific analysis framework.
- **Upstream source code:** [sahoo00/Hegemon](https://github.com/sahoo00/Hegemon), the original codebase on which this updated application is based.
- **Contributor:** [Amitash Nanda](https://github.com/amitashnanda), for contributions to the updated interface, backend integration, modern runtime packaging, and documentation.

### Computing Resources

This research used resources of the National Energy Research Scientific Computing Center (NERSC), a U.S. Department of Energy Office of Science User Facility located at Lawrence Berkeley National Laboratory, on the Perlmutter supercomputer using NERSC award [BER]-ERCAP[ERCAP0037181].

## License

See [LICENSE](LICENSE) for GNU GPL version 3 and bundled vendor notices for third-party terms. Data access, use, and attribution remain subject to each provider's terms.
