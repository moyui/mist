# frontend-image-deployment Specification

## Purpose
Define the frontend production image and deployment contract: pnpm-lock reproducible builds, gateway-relative `/api/mist` and `/api/chan` paths, and deployment-owned nginx gateway configuration in the Windows Docker stack.
## Requirements
### Requirement: Frontend repository publishes production Docker images
The Mist frontend repository SHALL publish a production Docker image that can be
deployed in the Windows Docker stack.

#### Scenario: Frontend image builds from repository source
- **WHEN** the frontend image build runs from the `mist-fe` repository
- **THEN** the build SHALL install dependencies from the committed pnpm lockfile
- **AND** it SHALL run the production Next.js build
- **AND** it SHALL produce a container that starts the built frontend on port
  `3000`

#### Scenario: Frontend image is tagged for deployment
- **WHEN** the frontend image workflow publishes an image from a commit
- **THEN** it SHALL push `ghcr.io/mist-trade/mist-fe:<commit-sha>`
- **AND** it SHALL push `ghcr.io/mist-trade/mist-fe:latest` only for the
  `master` branch

#### Scenario: Operator builds frontend image with mirror inputs
- **WHEN** the operator manually runs the frontend image workflow with
  `node_image` and `npm_registry`
- **THEN** the workflow SHALL pass those values as Docker build args
- **AND** push-triggered builds SHALL default to `node:22.13-alpine` and
  `https://registry.npmjs.org`

### Requirement: Windows Docker compose runs the frontend
The deployment repository SHALL run `mist-fe` in the Windows Docker stack behind
the nginx gateway.

#### Scenario: Operator starts frontend on Windows
- **WHEN** the operator starts the production Docker Compose stack
- **THEN** the stack SHALL start the `mist-fe` service
- **AND** the service SHALL use the configured `MIST_FE_IMAGE_TAG`
- **AND** the service SHALL be reachable by nginx at `mist-fe:3000`

### Requirement: Frontend runtime uses gateway-relative API paths
The frontend container SHALL be configurable for same-origin production routing
through the Windows nginx gateway.

#### Scenario: Frontend container starts in production
- **WHEN** the frontend container starts in the Windows Docker stack
- **THEN** it SHALL use `/api/mist` as the default Mist backend browser path
- **AND** it SHALL use `/api/chan` as the default Chan analysis browser path
- **AND** it SHALL NOT require browser access to backend port `8001`, Chan port
  `8008`, or datasource port `9001`

### Requirement: Deployment owns nginx gateway configuration
The deployment repository SHALL be the source of truth for the production nginx
gateway configuration.

#### Scenario: Deployment installs nginx config
- **WHEN** the Windows Docker deployment prepares `E:\quant\MistDocker`
- **THEN** it SHALL copy the tracked nginx config from
  `mist-deploy/docker/nginx/nginx.conf` to
  `E:\quant\MistDocker\nginx\nginx.conf`
- **AND** the `web-gateway` container SHALL mount that file as its nginx server
  config

#### Scenario: Operator changes nginx routing
- **WHEN** an operator needs a persistent nginx routing change
- **THEN** the change SHALL be made in the tracked `mist-deploy` nginx config
- **AND** the next deployment SHALL reconcile the Windows copy from that tracked
  file
