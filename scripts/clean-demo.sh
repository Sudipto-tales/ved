#!/usr/bin/env bash
#
# clean-demo.sh — remove ALL demo-school data created by seed-demo.sh, in one shot.
# Everything is keyed by tenant slug (default: lincoln maple), so this is deterministic
# and safe to re-run. It wipes every tenant-plane table for those tenants, the matching
# control-plane rows, and the demo login users (by @<slug>.com handle domain).
#
# Append-only ledgers have DB triggers blocking UPDATE/DELETE; we set
# session_replication_role=replica for this maintenance session, which disables triggers
# AND foreign-key checks, so the wipe is order-independent and complete.
#
# Usage:  ./ved.sh clean-demo            (cleans lincoln + maple)
#         scripts/clean-demo.sh acme     (clean specific slug[s])
set -euo pipefail
cd "$(dirname "$0")/.."

SLUGS=("$@"); [ ${#SLUGS[@]} -eq 0 ] && SLUGS=(lincoln maple)
PGW="docker exec -i ved-postgres-1 psql -U ved -d ved"
PGQ="docker exec -i ved-postgres-1 psql -U ved -d ved -t -A"

c_g=$'\033[32m'; c_y=$'\033[33m'; c_0=$'\033[0m'

# Quoted IN-list of slugs and a users-by-domain WHERE clause.
slug_in=$(printf "'%s'," "${SLUGS[@]}"); slug_in="${slug_in%,}"
user_like=""
for s in "${SLUGS[@]}"; do user_like+="login_identifier LIKE '%@$s.com' OR "; done
user_like="${user_like% OR }"

before=$($PGQ -c "SELECT count(*) FROM control_plane.tenant WHERE slug IN ($slug_in);" 2>/dev/null | tr -d '[:space:]' || echo 0)
printf '%s!%s cleaning demo schools: %s  (matched tenants: %s)\n' "$c_y" "$c_0" "${SLUGS[*]}" "${before:-0}"

# Tenant-plane tables (all carry tenant_id). Deleted before control_plane.tenant so the
# slug→id subquery still resolves.
TENANT_TABLES="mark_entry attendance_event grade submission_file submission material assignment \
teaching_assignment enrollment exam section curriculum subject program_stage program academic_year \
ledger_entry payment invoice_line invoice fee_head finance_counter \
membership_roles role_permissions roles designations tenant_profile \
guardian_student guardian student teacher employee person_document \
memberships outbox inbox audit_log"

{
  echo "SET session_replication_role = replica;"
  for t in $TENANT_TABLES; do
    echo "DELETE FROM $t WHERE tenant_id IN (SELECT id FROM control_plane.tenant WHERE slug IN ($slug_in));"
  done
  echo "DELETE FROM control_plane.sync_event         WHERE tenant_id IN (SELECT id FROM control_plane.tenant WHERE slug IN ($slug_in));"
  echo "DELETE FROM control_plane.license            WHERE tenant_id IN (SELECT id FROM control_plane.tenant WHERE slug IN ($slug_in));"
  echo "DELETE FROM control_plane.subscription_invoice WHERE tenant_id IN (SELECT id FROM control_plane.tenant WHERE slug IN ($slug_in));"
  echo "DELETE FROM control_plane.payment_proof      WHERE registration_id IN (SELECT id FROM control_plane.school_registration WHERE slug IN ($slug_in));"
  echo "DELETE FROM control_plane.subscription       WHERE tenant_id IN (SELECT id FROM control_plane.tenant WHERE slug IN ($slug_in));"
  echo "DELETE FROM control_plane.school_registration WHERE slug IN ($slug_in);"
  echo "DELETE FROM control_plane.tenant             WHERE slug IN ($slug_in);"
  echo "DELETE FROM users WHERE $user_like;"
} | $PGW -v ON_ERROR_STOP=1 -q

rm -f scripts/demo-seed-record.json
printf '%s✓%s demo data removed (tenants, students, staff, academics, finance, logins) + record file.\n' "$c_g" "$c_0"
