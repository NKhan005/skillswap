# Credentials and accounts

What exists, where the value lives, and what breaks without it.

**This file deliberately contains no secrets.** It is committed; the values it
points at are not. Keep the actual values in a password manager.

---

## The one file that matters

Everything for the local CI stack lives in **`.env.ci`** in the project root.
It is gitignored, so it is not in the repository and nobody you share the repo
with receives it — they create their own from `.env.ci.example`.

If you back up one thing, back up that file. To read it:

```bash
cat .env.ci
```

Copy those values into a password manager. If `.env.ci` is lost, nothing is
destroyed — every value can be regenerated (see *Recovery* below) — but it is
half an hour you need not spend.

---

## Accounts and where they live

| What | Username | Value stored in | Unlocks |
|------|----------|-----------------|---------|
| **Jenkins** (local) | `admin` | `.env.ci` → `JENKINS_ADMIN_PASSWORD` | http://localhost:8081 |
| **SonarQube** (local) | `admin` | `.env.ci` → `SONAR_ADMIN_PASSWORD` | http://localhost:9000 |
| SonarQube database | `sonar` | `.env.ci` → `SONAR_DB_PASSWORD` | Internal; Postgres container only |
| SonarQube analysis token | — | `.env.ci` → `SONAR_TOKEN` | Lets Jenkins submit analyses |
| **Docker Hub** | `nyamatullakhan` | `.env.ci` → `DOCKERHUB_TOKEN` | Pushing images from Jenkins |
| **MongoDB Atlas** | `Nayeem_Khan` | Render → `MONGO_URI` | The live database |
| **GitHub** | `NKhan005` | Your machine's git credential store | Pushing code |
| **Render** | your login | Render's own account | The live site |

The Jenkins and SonarQube passwords were generated for this project and exist
nowhere but `.env.ci` — they are not recoverable from anywhere else, which is
why that file is worth saving.

The live site's `JWT_SECRET` and `MONGO_URI` live in Render's environment
settings, not in any file here. Render shows `MONGO_URI` on request;
`JWT_SECRET` it generated itself and will not reveal, which is fine — nothing
needs to read it back, and regenerating it only logs everyone out.

---

## Seeded demo accounts

If you run `npm run seed`, it creates seven members who all share the password
`password123`:

`gowthami@` · `arjun@` · `priya@` · `daniel@` · `meera@` · `sanjay@` ·
`laura@` — all `@skillswap.dev`.

Fine for a local demo. Do not seed a public deployment you care about, or
change the password in `server/src/seed/seed.js` first.

---

## Docker Hub tokens

There have been three. Only the current one matters:

| Token | Scope | Status |
|-------|-------|--------|
| First | Read & Write | **Revoke** — it was committed to the public repository |
| Second | Read-only | **Revoke** — it could not push, and was superseded |
| Third | **Read & Write** | **Keep.** This is the one in `.env.ci`, and the one Jenkins uses |

Revoking the third would break the pipeline's push stage. If you ever do,
generate a new one with *Read & Write* and update `DOCKERHUB_TOKEN`.

---

## Recovery

Nothing here is unrecoverable.

| Lost | How to get back |
|------|-----------------|
| `.env.ci` | Copy `.env.ci.example`, then regenerate each value below |
| Jenkins password | Delete the `jenkins-home` volume and restart; it rebuilds from `.env.ci` |
| SonarQube password | Reset via its own UI, or drop the `sonarqube-data` volume |
| SonarQube token | My Account → Security → Generate, then `bash ci/sonar/provision.sh` |
| Docker Hub token | Generate a new one with *Read & Write* |
| Atlas password | Atlas → Database Access → Edit → Autogenerate, then update `MONGO_URI` in Render |
| `JWT_SECRET` (live) | Render regenerates it; everyone is logged out once |

The Docker volumes (`jenkins-home`, `sonarqube-data`, `mongo-data`) hold local
state — Jenkins build history, Sonar analyses, the local database. They
survive `docker compose down` and are only lost with `docker compose down -v`
or an explicit `docker volume rm`.
