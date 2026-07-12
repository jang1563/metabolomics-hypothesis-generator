# Release trust surface

## What v0.1.0 proves

- The published repository starts from one parentless, research-only root.
- Every current path is declared in `release/public_release_manifest.json`.
- Current files and every reachable blob are scanned for legacy browser-credential flow, career framing, personal email, credential-shaped strings, and local path breadcrumbs.
- Every public commit uses the GitHub noreply identity.
- The analysis source contains no browser network-call primitive.
- The synthetic fixture checksum, row count, schema, version, and deterministic three-candidate report validate together.
- Native Node tests, production build, dependency audit, CI, and CodeQL form the executable release boundary.

## What v0.1.0 does not prove

- biological validity or causal interpretation;
- calibration of evidence scores;
- diagnostic or biomarker performance;
- external cohort replication;
- literature accuracy or pathway ontology quality; or
- privacy of files outside the active browser tab and host environment.

## Machine anchors

- Release identity: annotated Git tag `v0.1.0`
- Package version: `package.json`
- Public boundary: `release/public_release_manifest.json`
- Synthetic provenance: `src/data/synthetic_demo_metadata.json`
- Synthetic integrity: SHA-256 in the release manifest
- Software checks: `npm run check` and `npm run audit`
- Live checks: GitHub Actions CI, Pages build, CodeQL, Dependabot, and repository security settings

## Read order

1. `README.md` for use and claim boundaries.
2. `docs/METHODS.md` for calculations and limitations.
3. `release/public_release_manifest.json` for the exact public contract.
4. `scripts/check_public_surface.mjs` and `scripts/validate_release.mjs` for enforcement.
5. `tests/` for executable examples and edge cases.
