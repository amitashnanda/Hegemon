# Branches and GitHub Publication

| Branch | Application | Runtime |
| --- | --- | --- |
| `main` | Structured copy of the deployed updated Hegemon, including its large-dataset optimizations | Native Apache/PHP 7.2, Java 8, Python 2.7, R and LaTeX |
| `modern-stack` | Structured copy of the separately maintained Hegemon_Updated application | PHP 8.4, Java 21, Python 3, R and LaTeX in Apptainer |

These are two maintained source variants, not just two ways to launch identical source. Do not assume changes or performance fixes are automatically shared. Keep local configuration and registries outside version control on both branches, and rebuild ignored Java classes after switching branches.

## Before Publishing

```bash
python3 tests/test_packaging.py
git status --short --ignored
git diff --cached --stat
git diff --cached --check
```

Review both staged and committed content, including binary/tutorial assets. Never use `git add -f` for a registry, dataset, image, generated report, or local configuration. `.gitignore` does not erase previously committed files. If private data has entered history, stop and resolve that history before pushing; deleting the working file is insufficient.

The repository excludes the source clones' Git histories, real registries, raw datasets, compiled classes, historical validation reports, personal environment files, and prebuilt SIF/OCI archives. The modern branch contains a clean container recipe; build its image locally rather than adding an old image to Git.

## Push When Ready

After reviewing the local branches and confirming that the origin is your repository:

```bash
git remote -v
git push -u origin main
git push -u origin modern-stack
```

These commands publish content to GitHub; run them yourself only after review. In the GitHub repository settings, select `main` as the default branch if needed. Nothing about the local branch preparation changes the running web server.

## Switch Variants

```bash
git switch main
```

or:

```bash
git switch modern-stack
```

Stop previews before switching. Ignored registries and runtime files remain on disk across a switch; verify that registry paths match the selected host/container layout, and use separate runtime directories for each variant.
