# Security and Private Data

Never commit real dataset registries, processed expression/clinical files, credentials, private configuration, user exports, logs, or prebuilt container images. Ignoring a file does not remove it from an existing commit or from an image layer.

- Copy `config/explore.conf.example` to root `explore.conf`, then edit the ignored copy locally.
- Put host-specific executable paths in ignored `config/*.local.php` files or process environment variables.
- Generated outputs belong in ignored `tmpdir/` and `runtime/` directories. Do not make source code world-writable.
- Only the explicitly identified GSE13507 tutorial downloads under `assets/manual/` are allowlisted research examples. They are not a license to publish other sample data.
- Run `python3 tests/test_packaging.py` and review `git status --short --ignored` before committing. The automated checks supplement, rather than replace, human review.
- A container built from this repository must not include real registries or processed data. Bind approved data and registries read-only at run time. Do not upload an old image without inspecting all its layers and metadata.
- Local launchers bind only to loopback. They are development/testing tools, not production deployment instructions.
- Public Apache must enforce `.htaccess` or equivalent restrictions. PHP's built-in server does not read `.htaccess`; the modern branch supplies a restrictive router instead.
- The `main` branch deliberately targets obsolete runtimes for compatibility. It requires independent administrator security review before public use; choose `modern-stack` when an isolated updated runtime is appropriate.

Report potential vulnerabilities through a private channel to the repository maintainer. Do not post patient data, secrets, real registry contents, or internal server paths in public issues or screenshots.
