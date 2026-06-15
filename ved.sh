#!/usr/bin/env bash
#
# ved.sh — single-command control for the VED Docker stack.
# Usage: ./ved.sh <command> [args].  Run `./ved.sh help` for the full list.
# Docs: docs/commands.md
#
set -euo pipefail

cd "$(dirname "$0")"

# ---- pretty output -----------------------------------------------------------
c_reset=$'\033[0m'; c_bold=$'\033[1m'; c_blue=$'\033[34m'; c_green=$'\033[32m'
c_yellow=$'\033[33m'; c_red=$'\033[31m'
info()  { printf '%s==>%s %s\n' "$c_blue"  "$c_reset" "$*"; }
ok()    { printf '%s✓%s %s\n'   "$c_green" "$c_reset" "$*"; }
warn()  { printf '%s!%s %s\n'   "$c_yellow" "$c_reset" "$*"; }
die()   { printf '%s✗ %s%s\n'   "$c_red" "$*" "$c_reset" >&2; exit 1; }

# ---- resolve docker compose (v2 plugin or legacy) ----------------------------
if docker compose version >/dev/null 2>&1; then
  DC=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DC=(docker-compose)
else
  die "docker compose not found. Install Docker Desktop or the compose plugin."
fi

# app profile = the buildable services (controlplane, node, web); infra is always on.
DC_APP=("${DC[@]}" --profile app)

ensure_env() {
  if [[ ! -f .env ]]; then
    cp .env.example .env
    warn "Created .env from .env.example — review secrets before any real use."
  fi
}

# ---- commands ----------------------------------------------------------------
cmd_build() {   # build all app images
  ensure_env; info "Building app images…"; "${DC_APP[@]}" build "$@"; ok "Build complete."
}

cmd_up() {      # start everything (infra + app), detached
  ensure_env
  if [[ "${1:-}" == "infra" ]]; then
    info "Starting infrastructure only…"; "${DC[@]}" up -d; ok "Infra up."
  else
    info "Starting the full stack…"; "${DC_APP[@]}" up -d --build; ok "Stack up."
  fi
  cmd_ps
}

cmd_down() {    # stop and remove containers (keeps data volumes)
  info "Stopping the stack…"; "${DC_APP[@]}" down "$@"; ok "Stopped (volumes kept)."
}

cmd_stop() {    # pause containers without removing them
  info "Pausing containers…"; "${DC_APP[@]}" stop "$@"; ok "Containers stopped."
}

cmd_restart() { info "Restarting…"; cmd_down; cmd_up "$@"; }

cmd_logs() {    # follow logs, optionally for one service
  "${DC_APP[@]}" logs -f --tail=100 "$@"
}

cmd_ps() {      info "Services:"; "${DC_APP[@]}" ps; }

cmd_shell() {   # open a shell in a service: ./ved.sh shell postgres
  [[ $# -ge 1 ]] || die "usage: ./ved.sh shell <service>"
  "${DC_APP[@]}" exec "$1" sh
}

cmd_psql() {    "${DC[@]}" exec postgres psql -U "${POSTGRES_USER:-ved}" -d "${POSTGRES_DB:-ved}" "$@"; }

cmd_reset() {   # DESTROY all containers AND volumes (wipes the database)
  warn "This deletes ALL containers and data volumes (Postgres, MinIO, NATS, Redis)."
  read -r -p "Type 'reset' to confirm: " a
  [[ "$a" == "reset" ]] || die "Aborted."
  "${DC_APP[@]}" down -v; ok "Reset complete — fresh state."
}

cmd_seed_demo() {   # seed two demo schools with full test data
  exec "$(dirname "$0")/scripts/seed-demo.sh" "$@"
}

cmd_clean_demo() {  # remove all demo-school data in one shot
  exec "$(dirname "$0")/scripts/clean-demo.sh" "$@"
}

cmd_help() {
  cat <<EOF
${c_bold}VED — Docker control${c_reset}   (docs/commands.md)

  ${c_bold}Core (single command each)${c_reset}
    ./ved.sh build            Build all app images
    ./ved.sh start | up       Start the full stack (build if needed), detached
    ./ved.sh stop | down      Stop & remove containers (keeps data)
    ./ved.sh restart          Stop then start

  ${c_bold}Variants & helpers${c_reset}
    ./ved.sh up infra         Start ONLY infra (postgres/redis/nats/minio) — use before app code exists
    ./ved.sh logs [service]   Follow logs (all, or one service)
    ./ved.sh ps               Show service status
    ./ved.sh shell <service>  Open a shell in a running service
    ./ved.sh psql             Open psql on the database
    ./ved.sh reset            DESTROY containers + volumes (wipes data; confirms)
    ./ved.sh help             This help

  ${c_bold}Demo / test data${c_reset}
    ./ved.sh seed-demo        Seed 2 demo schools (Lincoln + Maple) with ~100 students each
    ./ved.sh clean-demo       Remove ALL demo-school data in one shot (record + both tenants)

  Aliases: start=up, stop=down.
EOF
}

# ---- dispatch ----------------------------------------------------------------
case "${1:-help}" in
  build)            shift; cmd_build "$@";;
  up|start)         shift; cmd_up "$@";;
  down|stop)        shift; cmd_down "$@";;
  restart)          shift; cmd_restart "$@";;
  logs)             shift; cmd_logs "$@";;
  ps|status)        shift; cmd_ps "$@";;
  shell|sh)         shift; cmd_shell "$@";;
  psql)             shift; cmd_psql "$@";;
  seed-demo)        shift; cmd_seed_demo "$@";;
  clean-demo)       shift; cmd_clean_demo "$@";;
  reset|nuke)       shift; cmd_reset "$@";;
  help|-h|--help)   cmd_help;;
  *)                warn "Unknown command: $1"; echo; cmd_help; exit 1;;
esac
