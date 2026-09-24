# Quality report

Measurements from the pipeline, with how to reproduce each one. Figures are
from the SonarQube analysis on commit `ccc318d`, the last run before the
deployment work.

---

## Summary

| Metric | Value |
|--------|-------|
| Lines of code analysed | 6,309 |
| Tests | **51 passing**, 0 failing |
| Line coverage | **84.2%** |
| Bugs | **0** |
| Vulnerabilities | **0** |
| Code smells | **0** |
| Duplicated lines | **0.0%** |
| Security hotspots reviewed | **100%** (4 of 4) |
| Reliability rating | **A** |
| Security rating | **A** |
| Maintainability rating | **A** |
| Quality gate | **Passed** |

The analysis started at **82 open issues** and finished at zero. Of those, 59
were the analyser misreading this stack and are excluded with written
justifications in [`sonar-project.properties`](sonar-project.properties); 23
were real and were fixed. The distinction matters: nothing was silenced to
make a number look better.

---

## What the pipeline does

```
git push → Jenkins polls (5 min) → Install → Test + coverage
         → Build client → SonarQube analysis → Quality gate
         → Build Docker images → Scan → Push to Docker Hub
```

Nineteen builds were run while this was assembled. Eight failed, each for a
real reason — a git plugin refusing local checkouts, a missing buildx plugin,
Docker socket permissions, a read-only registry token, stale cached
credentials, and a quality gate that correctly rejected a build with no
coverage reporting. Every one is recorded in a commit message and in
[`ci/RUNBOOK.md`](ci/RUNBOOK.md).

The last several builds are green, and the final one was triggered by a push
rather than by hand — `Started by an SCM change`.

---

## The quality gate earned its place

Build 11 **failed** on `new_coverage 0% < 80%`, and it was right to.
`sonar-project.properties` pointed at a coverage report that nothing
generated, so all 51 tests were invisible to the analysis and every line
counted as uncovered.

That gap would have sat there indefinitely. The gate is what surfaced it.

---

## Reproducing the figures

### Tests and coverage

```bash
npm --prefix server run test:coverage
```

51 tests, and an lcov report at `server/coverage/lcov.info`. Server line
coverage measures 86.9% directly; SonarQube reports 84.2% across the whole
project.

### The full analysis

Start the CI stack and run the pipeline:

```bash
docker compose -f docker-compose.ci.yml --env-file .env.ci up -d
```

Then in Jenkins (http://localhost:8081) run the `skillswap` job. SonarQube's
dashboard is at http://localhost:9000/dashboard?id=skillswap.

Credentials are in `.env.ci` — see [CREDENTIALS.md](CREDENTIALS.md).

### The numbers straight from the API

With SonarQube running:

```bash
curl -s -u admin:$SONAR_ADMIN_PASSWORD "http://localhost:9000/api/measures/component?component=skillswap&metricKeys=bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density,ncloc"
```

---

## Showing this to someone

Jenkins and SonarQube run on `localhost`, so there is no link to send. Three
options, in order of effort:

**Quote the table above.** It is all reproducible from the repository.

**Demo live.** Bring the CI stack up, then walk through:

1. **Jenkins → skillswap → Stage View** — the pipeline's stages as a grid,
   with timings. The clearest single picture of what the pipeline does.
2. **A build's Console Output** — 51 tests passing, the Sonar analysis, both
   images being built and pushed.
3. **SonarQube dashboard** — 0 issues, A ratings, the coverage figure.
4. **SonarQube → Issues → filter to Closed** — the 82 findings that were
   dealt with, which is more interesting than an empty list.

**Screenshot those four.** They survive without the stack running, which
matters if whoever is reviewing cannot run Docker.

---

## What is not measured here

Honest limits, so nobody reads more into the numbers than they carry.

- **The client has no tests.** Coverage measures the server. The client is
  analysed for bugs and smells but excluded from the coverage metric, which
  is stated in `sonar-project.properties` rather than hidden.
- **Coverage is line coverage**, not branch coverage, and a covered line is
  not necessarily a tested behaviour. The integration suites do exercise real
  flows against a real MongoDB, which is worth more than the percentage.
- **No load or performance testing** has been done. The geospatial queries
  are indexed and the wallet ledger is atomic, but neither has been measured
  under concurrency.
- **`trivy` is not installed**, so the image scan stage reports as skipped
  rather than clean.
