# release-ci-safety Specification

## Purpose
Define release publishing and CI safety: protected-environment gates, validation-dependent Docker publishing and coverage of every first-wave repository before publish or deploy.
## Requirements
### Requirement: Release publishing is gated

Backend release publishing SHALL require repository validation and a GitHub
environment approval before creating a release or publishing Docker images.

#### Scenario: Release workflow starts

- **WHEN** the backend release workflow runs
- **THEN** the release job MUST depend on a validation job
- **AND** the release job MUST target the `production-release` environment

### Requirement: Docker publishing depends on validation

Docker image publishing SHALL run repository-local checks before image build and
push steps.

#### Scenario: Backend Docker workflow starts

- **WHEN** the backend Docker workflow runs
- **THEN** it MUST run lint, typecheck, tests, and CI contract checks before the
  image build job
- **AND** the image build job MUST depend on that validation job

#### Scenario: Frontend Docker workflow starts

- **WHEN** the frontend Docker workflow runs
- **THEN** it MUST run lint, typecheck, and tests before the image build job
- **AND** the image build job MUST depend on that validation job

### Requirement: CI covers every first-wave repository
The first-wave repositories SHALL have a minimal CI workflow matching their
toolchain.

#### Scenario: Python datasource CI starts
- **WHEN** datasource CI runs
- **THEN** it MUST run Ruff and non-live pytest checks

#### Scenario: Monitoring CI starts
- **WHEN** monitoring CI runs
- **THEN** it MUST run Go formatting, vet, lint, and tests
- **AND** it MUST install a pinned pytest dependency
- **AND** it MUST run the Python contract suite with
  `python -m pytest tests`

#### Scenario: Skills CI starts
- **WHEN** skills CI runs
- **THEN** it MUST install dev dependencies and run pytest

### Requirement: Local env files are not tracked

Backend local environment files SHALL NOT be tracked by git. Example env files
SHALL remain trackable.

#### Scenario: Env tracking is checked

- **WHEN** the CI contract test checks git tracking
- **THEN** `.env.development` and `.env.production` MUST be untracked
- **AND** `.env.example` MAY remain tracked

