# Commands & Tooling

One script drives the whole Docker stack: [`ved.sh`](../ved.sh) at the repo root.
Everything is a single command — build, start, stop. This doc is the reference for
those commands and the files behind them.

## Files

| File | Purpose |
|---|---|
| [`../ved.sh`](../ved.sh) | The control script (build/start/stop + helpers). Single entrypoint. |
| [`../docker-compose.yml`](../docker-compose.yml) | The stack: infra (always) + app services (under the `app` profile). |
| `../.env` | Local config & secrets. Auto-created from `.env.example` on first run. |
| `../.env.example` | Template of every variable (ports, credentials, JWT secrets). |

## Prerequisites

- **Docker** with the **Compose v2 plugin** (`docker compose …`). The script also
  falls back to legacy `docker-compose` if that's all you have.
- Nothing else — Postgres, Redis, NATS/JetStream, and MinIO all run in containers.

## Quick start

```bash
./ved.sh up infra     # start just the infrastructure (works today, no app code needed)
./ved.sh up           # start the FULL stack (builds app images first)
./ved.sh stop         # stop & remove containers (your data is kept)
```

`./ved.sh` auto-creates `.env` from `.env.example` the first time — **review the
secrets** (`JWT_*`, `MINIO_ROOT_PASSWORD`) before anything real.

## Command reference

### Core — one command each

| Command | What it does |
|---|---|
| `./ved.sh build` | Build all app images (`controlplane`, `node`, `web`). |
| `./ved.sh start` *(=`up`)* | Start the full stack, detached; builds images if missing. |
| `./ved.sh stop` *(=`down`)* | Stop and remove containers. **Data volumes are kept.** |
| `./ved.sh restart` | `stop` then `start`. |

### Variants & helpers

| Command | What it does |
|---|---|
| `./ved.sh up infra` | Start **only** infra (postgres/redis/nats/minio). Use this until `./server` and `./web` exist. |
| `./ved.sh logs [service]` | Follow logs — all services, or one (e.g. `./ved.sh logs node`). |
| `./ved.sh ps` | Show service status. |
| `./ved.sh shell <service>` | Open a shell inside a running service (e.g. `./ved.sh shell node`). |
| `./ved.sh psql` | Open `psql` on the database. |
| `./ved.sh reset` | **Destroys containers + volumes** (wipes the DB). Asks for confirmation. |
| `./ved.sh help` | Full usage. |

## The stack (`docker-compose.yml`)

| Service | Image / build | Port(s) | Profile |
|---|---|---|---|
| `postgres` | postgres:16 | 5432 | always (infra) |
| `redis` | redis:7 | 6379 | always (infra) |
| `nats` | nats:2.10 (`-js` JetStream) | 4222, 8222 (monitor) | always (infra) |
| `minio` | minio | 9000 (API), 9001 (console) | always (infra) |
| `controlplane` | build `./server` (target `controlplane`) | 8080 | `app` |
| `node` | build `./server` (target `node`) | 8091 | `app` |
| `web` | build `./web` | 5173 | `app` |

### Why the `app` profile

Infra services have **no profile**, so they always start — useful right now while the
project is still docs + planning. The app services (`controlplane`, `node`, `web`)
sit under the `app` profile and build from `./server` and `./web`. Until those code
directories exist (see [plan/](./plan/)), use `./ved.sh up infra`; once they exist,
`./ved.sh up` builds and runs everything. All ports/credentials come from `.env`.

## Typical workflows

```bash
# Day-to-day dev (once app code exists)
./ved.sh up                 # bring everything up
./ved.sh logs node          # watch the school-node binary
./ved.sh restart            # after a config change
./ved.sh stop               # end of day (keeps data)

# Infra-only while building the backend locally (not in a container)
./ved.sh up infra
./ved.sh psql               # poke the database

# Start clean
./ved.sh reset              # wipe volumes, then:
./ved.sh up
```

## Adding a command

Commands live in `ved.sh` as `cmd_<name>` functions wired into the `case` at the
bottom. Add a `cmd_foo()`, add a `foo)` branch, and document it in the table above —
keep the script the single source of truth so "one command" stays true.

> Prefer separate `build.sh` / `start.sh` / `stop.sh` files? Make them one-line
> wrappers that call `exec ./ved.sh build` / `up` / `down` so there's still one
> implementation.
