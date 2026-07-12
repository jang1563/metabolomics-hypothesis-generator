# Contributing

Contributions that improve parser correctness, accessibility, scientific claim boundaries, reproducibility, or local-only behavior are welcome.

## Development workflow

1. Create a focused branch from `main`.
2. Keep runtime analysis deterministic and local-only.
3. Add a regression test for behavior changes.
4. Run `npm run check`, `npm run audit`, and `git diff --check`.
5. Explain scientific assumptions and user-visible impact in the pull request.

## Scientific changes

Do not introduce probability, confidence, calibration, biomarker, diagnostic, causal, or literature-support claims without an executable method and validation evidence that directly supports the wording. New example datasets must include explicit provenance, redistribution permission, schema semantics, and limitations.

## Public-surface changes

Add or remove paths through `release/public_release_manifest.json`. The public-surface gate intentionally fails on undeclared files, local paths, personal email addresses, credential-shaped values, runtime network clients, binary files, or files larger than 1 MB.
