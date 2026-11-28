# ShackPulse: DevOps Practice Project

ShackPulse is an internal project tracker: a React front end, a Node.js API and a PostgreSQL database. This repository is a DevOps practice project. The application code came from an existing project, and the containers, infrastructure, pipeline, deployment and monitoring are being built here from scratch.

## Credit

The application code comes from [jaiswaladi246/Azure-DevOps-Corporate-Project](https://github.com/jaiswaladi246/Azure-DevOps-Corporate-Project) by Aditya Jaiswal (DevOps Shack). The original repository has no licence, and the application code is not my work. The original DevOps files were removed so that the DevOps setup could be rebuilt independently. They remain in this repository's git history, in commit `4419c4b`.

## What the application does

- **Projects:** client, owner, health, priority, progress, budget, milestones, time entries and status updates, with CSV export.
- **Clients and people:** client companies with their contacts, and team members with their titles and departments.
- **Dashboard:** portfolio health with charts.
- **Roles:** Admin, Project Manager, Member and Viewer.
- **Access requests:** a new user signs up and stays pending until an admin approves them and picks a role.

## Components

| Path | Purpose | Stack |
|---|---|---|
| `frontend/` | Web interface | React 19, Vite. The build output in `dist/` is static files. |
| `frontend/nginx/default.conf.template` | Web server configuration for the front end | nginx |
| `backend/` | REST API | Node.js 22, Express 5, PostgreSQL |
| `backend/src/db/migrations/` | Database schema, applied by the API on start | SQL |

## Build and test commands

| | Backend (`backend/`) | Frontend (`frontend/`) |
|---|---|---|
| Install dependencies | `npm ci` (add `--omit=dev` for production) | `npm ci` |
| Lint | none | `npm run lint` |
| Test | `npm test`, or `npm run test:ci` for JUnit and Cobertura reports | `npm test`, or `npm run test:ci` for a JUnit report |
| Build | none | `npm run build` (output in `dist/`) |
| Start | `node src/server.js` | Serve `dist/` with nginx |

The backend tests need a running PostgreSQL. By default they connect to `localhost:5432`, database `shackpulse_test`, user and password `shackpulse`, and they can be changed with the `DB_*` variables below. The frontend tests need no database.

## Runtime behaviour

### Backend API

- Listens on port `8080` (`PORT`).
- On start it waits up to about 60 seconds for the database, applies migrations and inserts demo data if the database is empty.
- Stops gracefully on `SIGTERM`.
- Logs are JSON, written to standard output.

| Endpoint | Purpose |
|---|---|
| `/healthz` | Liveness. The process is running. It does not check the database. |
| `/readyz` | Readiness. Returns `503` if the database does not answer. |
| `/metrics` | Prometheus metrics |
| `/api/info` | Environment, version, build ID, commit and pod name |

### Backend environment variables

| Variable | Purpose | Default |
|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME` | Database location | `localhost`, `5432`, `shackpulse` |
| `DB_USER`, `DB_PASSWORD` | Database login. **The password is a secret.** | `shackpulse`, `shackpulse` |
| `DB_SSL` | Use TLS to the database (needed for Azure Database for PostgreSQL) | `false` |
| `JWT_SECRET` | Signs login tokens. **A secret.** Required when `NODE_ENV=production`. | development-only value |
| `SEED_ADMIN_PASSWORD` | Password of the seeded admin, `admin@devopsshack.com`. **A secret.** | `Admin@123` |
| `SEED_DEMO_PASSWORD` | Password of the seeded demo users. **A secret.** | `Demo@1234` |
| `NODE_ENV` | `production` in containers | `development` |
| `APP_ENV` | `local`, `dev` or `prod`. Shown in the UI. | `local` |
| `DEMO_LOGINS` | Allow demo users to sign in | `true`, except when `APP_ENV=prod` |
| `MIGRATE_ON_START`, `SEED_ON_START` | Apply the schema and demo data on start | `true`, `true` |
| `ALLOWED_EMAIL_DOMAINS` | Email domains allowed to sign up, comma-separated, or `*` | `devopsshack.com` |
| `APP_VERSION`, `BUILD_ID`, `COMMIT_SHA` | Shown by `/api/info`, for tracing a release | package version, `local`, `local` |
| `CORS_ORIGIN` | Allowed browser origins | `*` |
| `LOG_LEVEL`, `RATE_LIMIT_PER_MIN`, `JWT_EXPIRES_IN`, `DB_POOL_MAX` | Tuning | `info`, `300`, `12h`, `10` |
| `POD_NAMESPACE` | Shown by `/api/info` | none |

### Front end

- The browser app calls relative `/api` paths, so the web server must forward `/api`, `/healthz` and `/readyz` to the API.
- `frontend/nginx/default.conf.template` does this. It listens on port `8080`, forwards to the address in the `API_UPSTREAM` environment variable, answers `/nginx-health` itself and serves `index.html` for all other routes.
- The official nginx container images render files from `/etc/nginx/templates/*.template` into `/etc/nginx/conf.d/` at start, filling in environment variables.
- For local development, `npm run dev` serves on port `5173` and forwards `/api` to `http://localhost:8080`.

## Checkpoint (2026-11-28)

**Branch:** `main`. **Current work:** moving to k3s on one Azure VM, in place of AKS (lower cost, small vCPU quota). One VM is not highly available.

| Item | Status |
|---|---|
| Backend and frontend `Dockerfile` and `.dockerignore` | Done. Images build in CI. **Containers not run or tested yet.** |
| GitHub Actions (`.github/workflows/ci.yaml`) | Done: tests, lint, image builds, and on `main` an OIDC login and push to ACR tagged with the commit SHA. Verified working. |
| Terraform: resource group, registry, GitHub identity | Done and verified. |
| GitHub repository variables | Added: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `ACR_LOGIN_SERVER` |
| Terraform: `network.tf` (VNet, subnet) and `security.tf` (NSG: SSH from my IP only, 80 and 443 open, no 6443) | Written. Valid, planned, **never applied**. |
| Change region to `southindia` | **Not done.** The default `location` is still `centralindia`. |
| `vm.tf`, VM identity with registry access, cloud-init for k3s | Not started |
| PostgreSQL, Kubernetes files, deployment, remote state, Docker Compose | Not started |

### VM size findings (checked 2026-11-28)

- In `centralindia`, the search for unrestricted 2 vCPU, 4 to 8 GB x64 sizes found only confidential VM (DC-series) sizes.
- Chosen: `Standard_B2as_v2` (2 vCPU, 8 GB) in `southindia`. Retail Linux price seen: about USD 0.11 per hour, excluding disk, public IP, registry, data transfer and tax. Regional quota there: 4 vCPUs.

### Continue on another device

1. Install Git, the Azure CLI and Terraform 1.9 or newer.
2. Clone this repository and stay on `main`. If it is already cloned, run `git switch main` and `git pull`.
3. Run `az login` and check the selected subscription with `az account show`.
4. Create `terraform/terraform.tfvars` (ignored by Git) with:
   - `subscription_id`
   - `acr_name` (used so far: `shubhamacr01`; must be globally unique)
   - `my_ip_cidr`: your current public IPv4 address followed by `/32`, in quotes. It differs between networks.
5. Terraform state is local and is not in Git. Destroy resources on the device that created them. To check that nothing is left: `az group exists --name rg-shackpulse` should print `false`.

### Next steps

1. Confirm that all Azure resources are destroyed.
2. Change the default `location` in `terraform/variables.tf` to `southindia`. Run `terraform plan`; it should show 9 resources to add.
3. Write `vm.tf`: public IP, network interface and Linux VM (`Standard_B2as_v2`, SSH key login). Do not apply until it is reviewed. Stop (deallocate) or destroy the VM after each session.
4. Give the VM a managed identity with `AcrPull`, and set up k3s authentication to the registry (ACR tokens expire).
5. Install k3s with cloud-init. k3s includes Traefik. Reach the Kubernetes API through an SSH tunnel.
6. After each `terraform apply`, update the GitHub variable `AZURE_CLIENT_ID` (`terraform output -raw github_client_id`), then run the workflow on `main` to push the images again. While Azure resources are destroyed, the push job on `main` fails. Add `[skip ci]` to a commit message to skip the workflow.
7. PostgreSQL, Kubernetes files, manual deployment, then automated deployment (consider Azure VM Run Command with OIDC; avoid a self-hosted runner on a public repository).

Later improvements: security scanning, Key Vault, HTTPS, autoscaling, network policies, a separate PROD environment, monitoring, remote Terraform state and Docker Compose.

## DevOps work to build

| Stage | What |
|---|---|
| 1 | Dockerfiles and `.dockerignore` for both parts, and a Docker Compose file to run everything locally |
| 2 | Terraform: resource group, container registry, Key Vault, PostgreSQL, Kubernetes cluster, identities with least privilege |
| 3 | GitHub Actions pipeline: tests, lint, security scans, build and push images, deploy to DEV, approval, deploy to PROD |
| 4 | Kubernetes manifests or Helm charts: deployments, services, probes, autoscaling, ingress with HTTPS, network policies |
| 5 | Secrets from Key Vault |
| 6 | Monitoring with Prometheus and Grafana, and alerts |

## Working agreement

The project owner writes every Dockerfile, Terraform, pipeline and Kubernetes file. An assistant explains concepts, describes what each file must achieve, reviews the files, and runs read-only checks when asked. It does not paste file contents unless asked.
