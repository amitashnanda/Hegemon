# Vendored classic explorer dependencies

These files are served from the same origin; the modern dashboard has no third-party JavaScript dependencies. Versions are pinned for compatibility with the classic Hegemon explorer. Do not replace them with a major-version upgrade without testing the classic plotting and selection workflows.

Retrieved 2026-10-08 from the upstream distribution URLs below. Upstream license texts are included alongside the assets. The D3 and Select2 JavaScript files have a final newline added by the source patch; their executable content is unchanged.

| File | Version | Source | SHA-256 of vendored file |
| --- | --- | --- | --- |
| `jquery-3.1.0.min.js` | 3.1.0 | https://code.jquery.com/jquery-3.1.0.min.js | `702b9e051e82b32038ffdb33a4f7eb5f7b38f4cf6f514e4182d8898f4eb0b7fb` |
| `d3.v4.min.js` | 4.13.0 | https://cdn.jsdelivr.net/npm/d3@4.13.0/build/d3.min.js | `bfa68d8f842329057e2bde503c270e174305f7e83db5ebdc3970e55abe78fa62` |
| `select2-4.1.0-rc.0.min.js` | 4.1.0-rc.0 | https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js | `9bd694a723405aeeb67696d5494d110c8de0f4029a40b7fb6bf47cb6235a0a6a` |
| `select2-4.1.0-rc.0.min.css` | 4.1.0-rc.0 | https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css | `cda4a81c187015d95ed2c71f1841540b08203cdec5fa2a7d5d1825a3c2166f8c` |

License sources: jQuery `LICENSE.txt` from https://raw.githubusercontent.com/jquery/jquery/3.1.0/LICENSE.txt (MIT); D3 `LICENSE` from https://cdn.jsdelivr.net/npm/d3@4.13.0/LICENSE (BSD-3-Clause); Select2 `LICENSE.md` from https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/LICENSE.md (MIT).

Historical versions are retained only for the isolated classic compatibility view. Review upstream security advisories before exposing that view publicly; do not inject untrusted HTML into jQuery operations. Dashboard display names are inserted as text, and classic group names are escaped before HTML insertion.
