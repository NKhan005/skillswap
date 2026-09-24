# SkillSwap — DevOps runbook

Bringing up the rest of the stack from Gowthami's notes: **Docker, Jenkins,
SonarQube, GitHub and Docker Hub**.

Steps are ordered by dependency. Anything marked **you** needs a password, a
browser login or admin rights, so it has to be done by a person — after each
of those, everything else can be automated.

Check where you are at any point:

```bash
bash ci/preflight.sh
```

---

## Stage 0 — Docker (the gate)

Six of the seven remaining pieces run *through* Docker, so nothing else can
start until this is done.

**you** — WSL2 first. Needs admin rights and a reboot:

```bash
wsl --install
```

**you** — then Docker Desktop, and the two other CLIs. `winget` takes one
`--id` per invocation, so these are three separate commands:

```bash
winget install -e --id Docker.DockerDesktop
```

```bash
winget install -e --id GitHub.cli
```

```bash
winget install -e --id Kubernetes.kubectl
```

**you** — start Docker Desktop, accept the license agreement it shows on
first run, and allow WSL integration when it asks. Verify:

```bash
docker run --rm hello-world
```

> Newly installed tools are not on the `PATH` of shells that were already
> open. Start a new terminal after installing, or call the executable by its
> full path.

> **If WSL2 refuses to install**, virtualisation may be off in the BIOS.
> Docker Desktop can also run on Hyper-V instead, but WSL2 is the smoother
> path on Windows 11.

---

## Stage A — Docker, Jenkins and SonarQube (no accounts, nothing to pay)

### A1. Build and run the application stack

```bash
docker compose build
```

```bash
docker compose up -d
```

The client is at <http://localhost:8080>, the API at
<http://localhost:5000/api/health>. Seed the containerised database:

```bash
docker compose exec server node src/seed/seed.js
```

This proves the two `Dockerfile`s and `docker-compose.yml` work — the Docker
half of the notes.

### A2. Start the CI stack

```bash
cp .env.ci.example .env.ci
```

**you** — open `.env.ci` and set `JENKINS_ADMIN_PASSWORD` and
`SONAR_DB_PASSWORD`. Leave the token fields empty for now.

```bash
docker compose -f docker-compose.ci.yml --env-file .env.ci up -d --build
```

First build takes a few minutes: it installs the Docker CLI, Node 20 and the
Jenkins plugins. SonarQube then needs another minute or two to start its
embedded Elasticsearch.

- Jenkins → <http://localhost:8081> (admin / your password)
- SonarQube → <http://localhost:9000> (admin / admin)

Jenkins comes up with the `skillswap` job, the Node and SonarScanner tools
and the SonarQube server link already configured, because it reads
`ci/jenkins/jenkins.yaml` at boot.

### A3. Connect SonarQube to Jenkins

**you** — SonarQube forces a password change on first login.

**you** — generate an analysis token: **My Account → Security → Generate
Token**, type *Global Analysis Token*. Copy it into `.env.ci` as
`SONAR_TOKEN`, then restart Jenkins so it picks the value up:

```bash
docker compose -f docker-compose.ci.yml --env-file .env.ci up -d
```

**you** — the quality gate step waits for SonarQube to call Jenkins back, so
add the webhook: **Administration → Configuration → Webhooks → Create**

| Field | Value |
|-------|-------|
| Name | `Jenkins` |
| URL | `http://jenkins:8080/sonarqube-webhook/` |

Without it, the *Quality gate* stage waits ten minutes and times out.

### A4. Run the pipeline

In Jenkins, open **skillswap → Build with Parameters** and run with the
defaults (`RUN_SONAR` on, `PUSH_IMAGES` off, `DEPLOY_TARGET` none).

Expected: **Checkout → Install → Test (50 tests) → Build bundle → SonarQube →
Quality gate → Build images → Scan**, all green, with push and deploy shown
as skipped.

At that point **Docker, Jenkins and SonarQube** are all genuinely exercised.

---

## Stage B — GitHub and Docker Hub (your accounts, you log in once)

### B1. GitHub

**you** — authenticate. This opens a browser; no token needs typing:

```bash
gh auth login
```

Then the repository can be created and pushed:

```bash
gh repo create skillswap --public --source=. --remote=origin --push
```

Point the Jenkins job at GitHub instead of the mounted copy by setting
`SKILLSWAP_REPO_URL` in `.env.ci` to the new clone URL, then restarting the
CI stack. A private repository also needs a GitHub credential inside Jenkins.

### B2. Docker Hub

**you** — create an **access token** at hub.docker.com → *Account Settings →
Security*. Use a token, never the account password.

**you** — log the local Docker in:

```bash
docker login
```

Put the same username and token into `.env.ci` as `DOCKERHUB_USERNAME` and
`DOCKERHUB_TOKEN`, and restart the CI stack so Jenkins picks up the
credential.

Then set `DOCKERHUB_NAMESPACE` in the `Jenkinsfile` `environment` block to
your Docker Hub username, and run the job again with **`PUSH_IMAGES` ticked**.

Both images land in Docker Hub, tagged `<build number>-<short SHA>` and
`latest`.

---

## Deferred: Stage C — deployment

`DEPLOY_TARGET` stays `none`, so the pipeline stops after the push. When you
want a live URL:

- **Coolify** (~$5/month VPS) — the webhook stage is already written; you
  supply the `coolify-webhook` credential.
- **AWS EKS** (~$73/month control plane plus nodes) —
  `k8s/skillswap.yaml` is ready; you supply a working kubeconfig. Note the
  AWS CLI on this machine currently reports `InvalidClientTokenId`, so those
  credentials need refreshing first.

---

## Troubleshooting

| Symptom | Cause |
|---------|-------|
| `docker: command not found` in a Jenkins build | The socket mount or the Docker CLI layer is missing — rebuild the Jenkins image. |
| *Quality gate* hangs then times out | The SonarQube webhook in A3 is missing or has the wrong URL. |
| SonarQube exits shortly after start | Elasticsearch bootstrap check. `SONAR_ES_BOOTSTRAP_CHECKS_DISABLE` is already set; if it persists, give Docker Desktop more memory. |
| `denied: requested access to the resource is denied` on push | `DOCKERHUB_NAMESPACE` does not match the logged-in account. |
| `Login Succeeded` but push fails with `access token has insufficient scopes` | The token was created read-only. Docker Hub bakes the scope in at creation and editing it afterwards does not take effect — generate a **new** token with *Read & Write*. |
| Image build fails with `401 incorrect username or password` while fetching `docker/dockerfile` | Stale credentials in the agent's `~/.docker/config.json`, which lives in the Jenkins volume. buildx offers them even for anonymous pulls. The pipeline now runs `docker logout` in its post block; to clear an existing one: `docker exec skillswap-jenkins docker logout`. |
| Jenkins job cannot clone `file:///workspace/skillswap` | The read-only mount is missing, or the commit is not on `main`. |
| `buildWithParameters` returns HTTP 400 | A pipeline's parameters are declared in the Jenkinsfile, so Jenkins only learns them by running the job once — and updating the job's `config.xml` clears them again. Trigger a plain `/build` first. |
| Build fails with `BuildKit is enabled but the buildx component is missing` | The Jenkins image needs `docker-buildx-plugin`, because the pipeline sets `DOCKER_BUILDKIT=1`. |
| `permission denied ... /var/run/docker.sock` | Docker Desktop exposes the socket as `root:root` mode 660; the jenkins user needs `group_add: ["0"]`. |
| `detected dubious ownership in repository` | The bind-mounted repo is owned by another uid. `safe.directory` is only honoured from system or global config, and `/var/jenkins_home` is a volume — hence `GIT_CONFIG_GLOBAL` pointing outside it. |
| Containers cannot reach each other | Jenkins and SonarQube share the `ci` network; use service names (`http://sonarqube:9000`), not `localhost`. |
