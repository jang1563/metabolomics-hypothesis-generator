# Security policy

## Supported version

Security fixes target the latest release and the current `main` branch.

## Reporting

Use GitHub private vulnerability reporting for suspected vulnerabilities. Do not open a public issue for credential exposure, unsafe data transmission, dependency compromise, or a bypass of the local-only runtime boundary.

## Runtime boundary

The public application has no credential input, remote model integration, telemetry, or analysis-time outbound request. Uploaded CSV content is processed in browser memory and is not persisted by the application. The 2 MB input limit and strict schema validation reduce accidental misuse but do not replace local access controls.

## Dependency policy

The lockfile is committed. CI runs a moderate-severity dependency audit, Dependabot covers npm and GitHub Actions, and release checks require a clean production build.
