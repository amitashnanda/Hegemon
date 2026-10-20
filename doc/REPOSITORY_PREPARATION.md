# Repository Preparation

This repository was prepared from read-only copies of two existing applications. The running applications, old legacy application, processed data, original repositories, system packages, Apache routing and existing containers are not modified by this preparation.

## Native Variant (`main`)

The structured updated native-stack application is retained: public entrypoints, `app/`, bundled frontend assets, scientific helper source, Java source and illustrated manual. Scientific source and the deployed large-dataset behavior are preserved. Packaging changes remove hardcoded private runtime paths, add ignored local overrides, regenerate preview configuration relative to this checkout, rebuild ignored Java classes before launch, and block Git/runtime/data paths from HTTP.

## Modern Variant (`modern-stack`)

The separately maintained Hegemon_Updated source is reorganized into the same public-entrypoint/app/assets/scripts/tools layout. PHP includes, working directories, asset references and scientific-helper paths are adjusted accordingly. The Apptainer recipe installs the modern scientific stack in an isolated image. Existing private SIF/OCI archives are not copied, rebaked or uploaded; approved data and registries are read-only runtime binds.

## Deliberate Exclusions

- Original `.git` directories/history and personal Codex/editor/runtime settings.
- Real `explore.conf` files and host-specific configuration.
- Raw expression, index, annotation, survival, threshold and Boolean-vector dataset files.
- Generated plots, scripts, exports, logs, private reports, caches and historical validation archives.
- Compiled Java/Python artifacts and prebuilt container images/archives.
- Internal operational documentation containing personal hostnames, filesystem paths or deployment details.
- The original site's analytics identifier; the public analytics partial is empty.

The public registry/configuration templates contain placeholders only. The illustrated Kim manual and its three explicitly allowlisted tutorial downloads concern public GEO GSE13507 and are retained as documentation examples. Do not generalize that exception to other data or generated artifacts.

An ignored registry and ignored host overrides may be present in the local preparation checkout for verification. They must not appear in either branch's Git tree. Build output and validation evidence stay under ignored `runtime/`, `tmpdir/`, or the repository's private preparation metadata. Original source hashes are checked privately; private source locations are not copied into this publication note.

## Verification on 20 October 2026

Validation of the original source installation is not automatically validation of a newly packaged checkout. The new copies were checked separately using approved, read-only processed files:

- **Native:** 13 API/export smoke checks passed, including PNG, boxplot, violin, PDF and Kaplan–Meier rendering; the interactive Kim workflow passed explicit Explore and zoom/reset checks.
- **Native large cohorts:** the complete GL16 human response (133,776 samples) and GL17 mouse response (170,010 samples) exactly matched saved pre-change baselines. The GL17 interactive canvas workflow also passed browser checks without subsampling or JavaScript errors.
- **Modern:** the newly structured source passed the same 13 API/export checks and Kim browser Explore/zoom/reset checks inside the existing compatible dependency image. Compiled Java class versions were 52 (Java 8 native) and 65 (Java 21 modern).
- **Scientific scan parity:** Java-backed Kim MiDReG produced identical complete result HTML in both variants (193,186 bytes).
- **Publication:** private registries/overrides and generated classes/runtime files remain ignored; packaging checks, documentation links and shell syntax are checked before committing. The copied original source files were verified byte-for-byte unchanged.

A read-only comparison against the pre-existing deployment encountered HTTP 500 for GL16 during this run. That deployment was not modified or debugged as part of repository preparation. The new native checkout's GL16 response succeeded and matched the saved full baseline instead; no claim is made that the old deployment was healthy in every request.

The new dependency-only Apptainer recipe was **not rebuilt from the internet** during this preparation. Modern application behavior was tested with the existing compatible image strictly read-only, with new source/data binds and new private output directories. This is not a claim that a fresh image build or modern large-ARCHS4 performance was validated. A fresh build needs the documented approved fakeroot/build host and network access. Original containers, source applications, system packages and Apache configuration remain unchanged.

Temporary test listeners are stopped after validation. Private execution evidence is intentionally not part of the public Git tree. Reproduce checks with your own approved files and actual request-handling account before deployment.
