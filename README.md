# SkillSwap — No Money Economy Platform

> **Exchange Skills, Not Money.**

**Live: [skillswap-hryf.onrender.com](https://skillswap-hryf.onrender.com)**

Hosted on Render's free tier, so the first request after a quiet spell takes
a few seconds to wake the service. See [DEPLOYMENT.md](DEPLOYMENT.md).

A marketplace where people trade skills instead of cash. Either barter directly
— you teach React, they teach guitar — or settle in **time credits** when there
is no direct match: teach for two hours, earn two credits, spend them on
anything later.

---

## Contents

- [How it works](#how-it-works)
- [Feature map](#feature-map)
- [Architecture](#architecture)
- [Running it locally](#running-it-locally)
- [Running it with Docker](#running-it-with-docker)
- [Environment variables](#environment-variables)
- [API reference](#api-reference)
- [Realtime events](#realtime-events)
- [The trust score](#the-trust-score)
- [The time-credit ledger](#the-time-credit-ledger)
- [Tests](#tests)
- [CI/CD](#cicd)
- [Deployment](#deployment)
- [Project layout](#project-layout)

---

## How it works

```
Traditional economy      Person A ──money──▶ Person B

Skill economy            Person A (coding) ◀──────▶ Person B (graphic design)
                                    no money involved

When there is no direct match:
                         Person A teaches C ──▶ +2 credits
                         Person A spends 2 credits ──▶ learns guitar from D
```

A member registers, lists the skills they **teach** and the skills they
**need**, and the matching engine looks for the two-way overlap that makes a
money-free swap possible. Requests turn into a chat thread, both sides confirm
completion, credits settle, and reviews feed a trust score.

---

## Feature map

| # | Feature | Where it lives |
|---|---------|----------------|
| 1 | Skill profile — name, location, skills offered/needed, experience, trust score | [`server/src/models/User.js`](server/src/models/User.js), [`client/src/pages/Profile.jsx`](client/src/pages/Profile.jsx) |
| 2 | Smart direct matching — mutual two-way overlap | [`server/src/utils/matching.js`](server/src/utils/matching.js) |
| 3 | Nearby matching — 1 / 5 / 10 / 20 km via `$geoNear` on a 2dsphere index | [`matching.js:findNearbyMatches`](server/src/utils/matching.js), [`Explore.jsx`](client/src/pages/Explore.jsx) |
| 4 | Trust score engine — reviews + completed swaps + response rate | [`server/src/utils/trustScore.js`](server/src/utils/trustScore.js) |
| 5 | Ratings and reviews | [`server/src/models/Review.js`](server/src/models/Review.js), [`Swaps.jsx`](client/src/pages/Swaps.jsx) |
| 6 | Time-credit system — earn by teaching, spend to learn | [`server/src/utils/wallet.js`](server/src/utils/wallet.js) |
| 7 | Skill wallet — balance, earned, spent, full ledger | [`server/src/controllers/walletController.js`](server/src/controllers/walletController.js), [`Wallet.jsx`](client/src/pages/Wallet.jsx) |
| 8 | Real-time chat — one Socket.io room per exchange | [`server/src/sockets/index.js`](server/src/sockets/index.js), [`Messages.jsx`](client/src/pages/Messages.jsx) |
| 9 | Skill verification — GitHub, LeetCode, portfolio, certifications | [`User.js` verification schema](server/src/models/User.js), [`Profile.jsx`](client/src/pages/Profile.jsx) |
| 10 | Community challenges — gamified quests paying bonus credits | [`server/src/controllers/challengeController.js`](server/src/controllers/challengeController.js), [`Challenges.jsx`](client/src/pages/Challenges.jsx) |

---

## Architecture

```
                 ┌──────────────┐
   Users ───────▶│ React (Vite) │  Tailwind · Axios · React Router · socket.io-client
                 └──────┬───────┘
                        │  /api  ·  /socket.io   (same origin: Vite proxy in dev, Nginx in prod)
                 ┌──────▼───────┐
                 │  Node.js     │  Express · JWT · Socket.io
                 │  Express API │
                 └──────┬───────┘
                        │  Mongoose
                 ┌──────▼───────┐
                 │  MongoDB     │  2dsphere geospatial index
                 └──────────────┘

DevOps:  GitHub → Jenkins → SonarQube → Docker → Docker Hub → Coolify / AWS EKS
```

The browser only ever talks to **one origin**. In development Vite proxies
`/api` and `/socket.io` to the API; in production Nginx does the same inside
the client container. CORS never enters the picture, and no API host is baked
into the bundle at build time.

---

## Running it locally

**Prerequisites:** Node.js 18+ and a MongoDB you can reach.

```bash
npm run install:all
```

### 1. Start MongoDB

Use your own MongoDB or Atlas, or — if you have neither installed — the bundled
dev server, which downloads a real MongoDB binary and runs it on port 27018:

```bash
npm --prefix server run mongo:dev
```

### 2. Configure the API

```bash
cp server/.env.example server/.env
```

Set `MONGO_URI` to match (`mongodb://127.0.0.1:27018/skillswap` for the dev
server above) and put a long random string in `JWT_SECRET`.

### 3. Seed some data

```bash
npm run seed
```

This creates seven members around Hyderabad whose skills deliberately overlap,
a history of completed swaps, reviews, chat threads and four challenges — so
matching, nearby search, the wallet and trust scores all have something to show
on first run. Every seeded account uses the password `password123`.

Use `npm run seed:fresh` to drop the collections first.

### 4. Run both halves

```bash
npm run dev:server
```

```bash
npm run dev:client
```

The app is at <http://localhost:5173>, the API at <http://localhost:5000>.
Log in as `gowthami@skillswap.dev` / `password123`.

---

## Running it with Docker

```bash
cp .env.example .env
```

Set `JWT_SECRET` in that file, then:

```bash
docker compose up -d --build
```

- Client: <http://localhost:8080>
- API: <http://localhost:5000/api/health>
- MongoDB: `127.0.0.1:27017` (bound to localhost only)

Seed the containerised database:

```bash
docker compose exec server node src/seed/seed.js
```

---

## Environment variables

### `server/.env`

| Variable | Default | Notes |
|----------|---------|-------|
| `NODE_ENV` | `development` | |
| `PORT` | `5000` | |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/skillswap` | Local, Docker (`mongodb://mongo:27017/...`) or Atlas |
| `DNS_SERVERS` | `8.8.8.8,1.1.1.1` | Public resolvers applied before Mongoose connects — see below |
| `JWT_SECRET` | — | **Required.** Long random string |
| `JWT_EXPIRES_IN` | `7d` | |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Comma-separated list allowed |
| `CREDITS_PER_HOUR` | `1` | One hour taught = one credit |
| `SIGNUP_BONUS_CREDITS` | `3` | Starting balance, so a new member can learn before they teach |
| `LOG_LEVEL` | `info` | `error` / `warn` / `info` / `debug` |

> **Why `DNS_SERVERS` exists.** `mongodb+srv://` connection strings resolve
> through SRV and TXT records. Many corporate, campus and captive networks drop
> those, and the failure surfaces 30 seconds later as `querySrv ETIMEOUT` with
> no hint about DNS. [`server/src/config/db.js`](server/src/config/db.js)
> points Node's resolver at public DNS before the first lookup.

### `client/.env`

Both are empty by default, which makes the bundle call its own origin. Set them
only when the API lives on a different host.

| Variable | Notes |
|----------|-------|
| `VITE_API_URL` | Absolute API base URL |
| `VITE_SOCKET_URL` | Absolute Socket.io URL |

---

## API reference

All routes except `register`, `login` and `health` need
`Authorization: Bearer <token>`.

### Auth

| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/api/auth/register` | Create an account; returns a token and credits the signup bonus |
| `POST` | `/api/auth/login` | Exchange credentials for a token |
| `GET` | `/api/auth/me` | The signed-in member |
| `PUT` | `/api/auth/me` | Update profile, skills, location, verification links |
| `GET` | `/api/auth/users/:id` | Public profile plus recent reviews |

### Matching

| Method | Route | Query | Purpose |
|--------|-------|-------|---------|
| `GET` | `/api/matching` | `mutualOnly`, `category`, `limit` | Smart direct matches |
| `GET` | `/api/matching/nearby` | `radius`, `lng`, `lat`, `mutualOnly`, `skillFilter`, `category` | Radius search with per-result distance |
| `GET` | `/api/matching/explore` | `q`, `category`, `minTrust` | Browse and search members |
| `GET` | `/api/matching/skills` | — | Skill catalogue for filter dropdowns |

### Swaps

| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/api/swaps` | Open a `direct` or `credit` request |
| `GET` | `/api/swaps` | Everything this member is part of (`status`, `role` filters) |
| `GET` | `/api/swaps/:id` | One swap |
| `PATCH` | `/api/swaps/:id/accept` | Provider accepts |
| `PATCH` | `/api/swaps/:id/decline` | Provider declines |
| `PATCH` | `/api/swaps/:id/complete` | Confirm completion — settles once **both** sides confirm |
| `PATCH` | `/api/swaps/:id/cancel` | Either side, before completion |

### Reviews, wallet, messages, challenges

| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/api/reviews` | Rate a completed swap; recalculates the trust score |
| `GET` | `/api/reviews/user/:userId` | Reviews plus a star distribution |
| `GET` | `/api/reviews/pending` | Completed swaps this member has not reviewed |
| `GET` | `/api/reviews/trust/:userId` | Trust score with its component breakdown |
| `GET` | `/api/wallet` | Balance, totals and recent ledger rows |
| `GET` | `/api/wallet/ledger` | Paginated ledger |
| `GET` | `/api/wallet/stats` | Earned vs spent, last six months |
| `GET` | `/api/messages` | Conversation list with unread counts |
| `GET` | `/api/messages/:swapId` | Thread history; marks it read |
| `POST` | `/api/messages/:swapId` | Send over REST (fallback when websockets are blocked) |
| `GET` | `/api/challenges` | Active challenges with live progress |
| `POST` | `/api/challenges` | Create a challenge |
| `POST` | `/api/challenges/:id/join` | Join; pays out immediately if already met |
| `GET` | `/api/challenges/leaderboard` | Top members by trust |
| `GET` | `/api/health` | `200` when Mongo is connected, `503` otherwise |

---

## Realtime events

The client holds **one** socket for the session. It authenticates with the same
JWT as the REST API and multiplexes two kinds of room:

- `user:<userId>` — private notification channel, joined on connect
- `swap:<swapId>` — one chat room per exchange

Room membership is checked against the database on every join and every send,
so a client cannot read or post into a conversation by guessing an id.

| Direction | Event | Payload |
|-----------|-------|---------|
| → server | `join_room` | `{ swapId }` — acknowledges with the thread history |
| → server | `leave_room` | `{ swapId }` |
| → server | `send_message` | `{ swapId, body }` |
| → server | `typing` / `stop_typing` | `{ swapId }` |
| → server | `mark_read` | `{ swapId }` |
| ← client | `receive_message` | the persisted message |
| ← client | `message:notification` | `{ swapId, from, preview }` — badges a recipient who is not in the room |
| ← client | `swap:new`, `swap:accepted`, `swap:declined`, `swap:completed`, `swap:cancelled` | `{ swap }` |
| ← client | `review:new` | `{ review, trustScore }` |
| ← client | `challenge:completed` | `{ title, rewardCredits }` |

---

## The trust score

```
Trust Score = Reviews + Completed Swaps + Response Rate     (0–100)
```

Each term is normalised to 0–1 and weighted, so the result always lands in
0–100 no matter how active a member is:

| Term | Weight | How it is derived |
|------|--------|-------------------|
| Reviews | 50% | Average rating, damped by a Bayesian prior (3 imaginary reviews at 3.5) |
| Completed swaps | 30% | Logarithmic curve saturating around 20 swaps |
| Response rate | 20% | Requests answered ÷ requests received |

The prior is what stops a single five-star review from producing a 100. A
member with no history scores **0** rather than a flattering default.

Scores are never incremented in place — [`recalculateTrustScore`](server/src/utils/trustScore.js)
re-derives every input straight from the reviews and swaps collections, so the
number stays correct even if a counter drifts.

---

## The time-credit ledger

Every balance change goes through
[`postTransaction`](server/src/utils/wallet.js), which writes an **immutable**
ledger row and the wallet totals together.

- **Debits are atomic.** The balance check lives inside the update query
  (`'wallet.balance': { $gte: amount }`), so two concurrent spends cannot both
  pass the check and overdraw the wallet.
- **Rows are append-only.** `Transaction` blocks updates and deletes at the
  model layer; a correction is a new compensating row, which keeps balances
  auditable.
- **Transfers compensate on failure.** The debit runs first; if the credit leg
  fails, a refund row is written rather than leaving credits destroyed.
- **Swaps settle once.** A credit swap only moves credits when *both* sides
  have confirmed completion.

---

## Tests

```bash
npm test
```

50 tests, all against real infrastructure — the integration suites run a real
MongoDB in-process (`mongodb-memory-server`), so the 2dsphere index and the
aggregation pipeline behave exactly as they do in production.

| Suite | Count | Covers |
|-------|-------|--------|
| [`trustScore.test.js`](server/tests/trustScore.test.js) | 6 | Score bounds, the Bayesian prior, weighting, response-rate penalty |
| [`matching.test.js`](server/tests/matching.test.js) | 7 | Mutual vs one-way detection, name normalisation, ranking, no password leakage |
| [`api.integration.test.js`](server/tests/api.integration.test.js) | 27 | Registration, auth guards, matching, radius filtering, the full swap → wallet → review → challenge flow, ledger immutability, overdraft protection |
| [`socket.integration.test.js`](server/tests/socket.integration.test.js) | 10 | Handshake auth, room authorisation, message fan-out and persistence, notification channel |

Unit tests alone (no MongoDB download):

```bash
npm --prefix server run test:unit
```

---

## CI/CD

[`Jenkinsfile`](Jenkinsfile) implements the pipeline:

```
Checkout SCM → Install → Test → Build bundle → SonarQube → Quality gate
             → Build images → Scan → Push to Docker Hub → Deploy → Smoke test
```

The quality gate aborts the build, so a failing Sonar analysis never reaches
Docker Hub. Images are tagged `<build number>-<short SHA>` for traceability.

Outward-facing steps are build parameters that default to off, so a fresh
Jenkins with no accounts configured still gets a green build:

| Parameter | Default | Effect |
|-----------|---------|--------|
| `RUN_SONAR` | on | Analysis plus the quality gate |
| `PUSH_IMAGES` | off | Push to Docker Hub; needs `dockerhub-credentials` |
| `DEPLOY_TARGET` | `none` | `coolify` or `eks` to deploy and smoke test |

### Running the pipeline locally

Jenkins and SonarQube both run as containers, so the whole pipeline works on
one machine with no cloud accounts:

```bash
docker compose -f docker-compose.ci.yml --env-file .env.ci up -d --build
```

Jenkins configures itself from [`ci/jenkins/jenkins.yaml`](ci/jenkins/jenkins.yaml)
— admin user, Node and SonarScanner tools, the SonarQube server link and the
pipeline job — so it comes up ready to build. Secrets come from `.env.ci`,
which is gitignored; [`.env.ci.example`](.env.ci.example) documents each one.

**[`ci/RUNBOOK.md`](ci/RUNBOOK.md) is the step-by-step guide**, and
`bash ci/preflight.sh` reports which parts of the stack the current machine
can run.

Sonar settings live in [`sonar-project.properties`](sonar-project.properties).

---

## Deployment

### Coolify

Point Coolify at the repository, let it use `docker-compose.yml`, and set
`JWT_SECRET`, `MONGO_URI` and `CLIENT_ORIGIN` in its environment panel. The
Jenkins `Deploy` stage hits the deploy webhook after a successful push.

### AWS EKS

```bash
kubectl create namespace skillswap
kubectl -n skillswap create secret generic skillswap-secrets \
  --from-literal=MONGO_URI='mongodb+srv://...' \
  --from-literal=JWT_SECRET='<long random string>'
kubectl apply -f k8s/skillswap.yaml
```

[`k8s/skillswap.yaml`](k8s/skillswap.yaml) provisions both deployments, their
services, an ALB ingress routing `/api` and `/socket.io` to the API, and a CPU
autoscaler. Readiness probes hit `/api/health`, which returns `503` until Mongo
is connected — so a pod never receives traffic it cannot serve. The database is
expected to be managed (Atlas or DocumentDB) rather than a pod, keeping the
cluster stateless.

---

## Project layout

```
skillswap/
├── server/
│   ├── src/
│   │   ├── config/        env loading, Mongo connection + DNS override
│   │   ├── models/        User, SwapRequest, Transaction, Review, Message, Challenge
│   │   ├── controllers/   auth, matching, swaps, reviews, wallet, messages, challenges
│   │   ├── routes/        one router per resource, mounted in routes/index.js
│   │   ├── middleware/    JWT auth, validation, error handling
│   │   ├── sockets/       Socket.io server + the emitter registry controllers use
│   │   ├── utils/         matching engine, trust score, wallet ledger, ApiError
│   │   ├── seed/          demo community
│   │   ├── app.js         Express app (helmet, CORS, rate limits, health)
│   │   └── index.js       HTTP + Socket.io bootstrap, graceful shutdown
│   ├── scripts/           dev-mongo.js — a MongoDB for machines without one
│   ├── tests/             unit + integration suites
│   └── Dockerfile
├── client/
│   ├── src/
│   │   ├── api/           axios client with the endpoint map, socket singleton
│   │   ├── context/       auth and notification providers
│   │   ├── components/    Navbar, MatchCard, SwapRequestModal, Toasts, ui primitives
│   │   ├── pages/         Login, Register, Dashboard, Explore, Swaps, Messages,
│   │   │                  Wallet, Profile, Challenges
│   │   ├── App.jsx        routes and auth gates
│   │   └── index.css      Tailwind v4 theme and component classes
│   ├── nginx.conf         SPA serving + API/websocket reverse proxy
│   └── Dockerfile         multi-stage build → Nginx
├── k8s/skillswap.yaml
├── docker-compose.yml
├── Jenkinsfile
└── sonar-project.properties
```

---

## License

MIT
