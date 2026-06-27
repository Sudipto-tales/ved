#!/usr/bin/env bash
#
# seed-demo.sh — provision TWO demo schools through the real VED APIs and fill each
# with ~100 students + teachers + staff + academics + finance. Data is distinct per
# school (different slug → different login domain, different admission prefix, different
# tenant_id) so there is zero conflict between them.
#
# It uses the superadmin control-plane flow (register → pay-proof → approve) to
# provision each tenant, then the node API (as that tenant's admin) to onboard data.
# A record of what was created is written to scripts/demo-seed-record.json so it can be
# removed in one command:  ./ved.sh clean-demo
#
# Env overrides: CP_URL (default :8080), NODE_URL (default :8091), STUDENTS (default 100),
#                SUPER_EMAIL / SUPER_PASS (platform superadmin).
set -euo pipefail
cd "$(dirname "$0")/.."

CP_URL=${CP_URL:-http://localhost:8080}
NODE_URL=${NODE_URL:-http://localhost:8091}
SUPER_EMAIL=${SUPER_EMAIL:-super@ved.platform}
SUPER_PASS=${SUPER_PASS:-super1234}
STUDENTS=${STUDENTS:-100}
PG="docker exec -i ved-postgres-1 psql -U ved -d ved -t -A"
RECORD=scripts/demo-seed-record.json

c_b=$'\033[34m'; c_g=$'\033[32m'; c_r=$'\033[31m'; c_0=$'\033[0m'
info(){ printf '%s==>%s %s\n' "$c_b" "$c_0" "$*"; }
ok(){ printf '%s✓%s %s\n' "$c_g" "$c_0" "$*"; }
die(){ printf '%s✗ %s%s\n' "$c_r" "$*" "$c_0" >&2; exit 1; }
jget(){ python3 -c "import sys,json;print(json.load(sys.stdin)$1)"; }

command -v curl >/dev/null || die "curl required"
curl -fsS -m 3 "$CP_URL/healthz" >/dev/null 2>&1 || die "control plane not reachable at $CP_URL (start the stack: ./ved.sh up)"
curl -fsS -m 3 "$NODE_URL/healthz" >/dev/null 2>&1 || die "node not reachable at $NODE_URL"

# Superadmin token.
PTOK=$(curl -fsS -X POST "$CP_URL/api/v1/platform/login" -d "{\"email\":\"$SUPER_EMAIL\",\"password\":\"$SUPER_PASS\"}" | jget '["access_token"]')
[ -n "$PTOK" ] || die "platform login failed"
PLAN=$($PG -c "SELECT id FROM control_plane.plan_catalog WHERE name='Standard' LIMIT 1;" | tr -d '[:space:]')
[ -n "$PLAN" ] || die "no plan_catalog row (control plane dev seed missing)"

cp_post(){ curl -fsS -X POST -H "Authorization: Bearer $PTOK" "$CP_URL$1" -d "$2"; }

# provision_school <name> <slug> <admin_name> <admin_email>  → sets globals TENANT, ADMTOK
provision_school(){
  local name="$1" slug="$2" aname="$3" aemail="$4"
  info "Provisioning $name ($slug)…"
  local rid
  rid=$(curl -fsS -X POST "$CP_URL/api/v1/register" \
    -d "{\"school_name\":\"$name\",\"slug\":\"$slug\",\"admin_name\":\"$aname\",\"admin_email\":\"$aemail\",\"plan_id\":\"$PLAN\"}" \
    | jget '["id"]') || die "register $slug failed (already seeded? run ./ved.sh clean-demo first)"
  curl -fsS -o /dev/null -X POST "$CP_URL/api/v1/registrations/$rid/payment-proof" \
    -d "{\"amount\":49999,\"method\":\"UPI\",\"txn_id\":\"DEMO-$slug-$(date +%s)\",\"payer_name\":\"$aname\"}"
  local ap; ap=$(cp_post "/api/v1/platform/registrations/$rid/approve" "")
  TENANT=$(echo "$ap" | jget '["tenant_id"]')
  local login pass
  login=$(echo "$ap" | jget '["admin_login"]'); pass=$(echo "$ap" | jget '["admin_temp_password"]')
  ADMTOK=$(curl -fsS -X POST "$NODE_URL/auth/login" -d "{\"login_identifier\":\"$login\",\"password\":\"$pass\"}" | jget '["access_token"]')
  [ -n "$ADMTOK" ] || die "admin login failed for $slug"
  ok "$name provisioned — tenant=$TENANT admin=$login"
  SCHOOL_LOGIN="$login"; SCHOOL_PASS="$pass"
}

# napi <METHOD> <path> [body]  — node API call as the current school admin.
napi(){ local m="$1" p="$2" b="${3:-}"; curl -fsS -X "$m" -H "Authorization: Bearer $ADMTOK" -H "X-Tenant-ID: $TENANT" ${b:+-d "$b"} "$NODE_URL$p"; }

# seed_school <slug> <admprefix> <p_name> <p_code> <stage1> <stage2> <subjJSON...> <fee>
# Uses positional config arrays declared by the caller.
seed_school(){
  local admp="$1" pname="$2" pcode="$3" s1="$4" s2="$5" feeamt="$6"; shift 6
  local subjects=("$@")   # "Name:CODE" pairs

  info "  setting up academics…"
  local pid; pid=$(napi POST /api/v1/academics/programs "{\"name\":\"$pname\",\"code\":\"$pcode\"}" | jget '["id"]')
  local st1 st2
  st1=$(napi POST "/api/v1/academics/programs/$pid/stages" "{\"name\":\"$s1\",\"ordinal\":1}" | jget '["id"]')
  st2=$(napi POST "/api/v1/academics/programs/$pid/stages" "{\"name\":\"$s2\",\"ordinal\":2}" | jget '["id"]')
  local subj_ids=() s
  for s in "${subjects[@]}"; do
    local sn=${s%%:*} sc=${s##*:}
    subj_ids+=("$(napi POST /api/v1/academics/subjects "{\"name\":\"$sn\",\"code\":\"$sc\"}" | jget '["id"]')")
  done
  local sec1 sec2
  sec1=$(napi POST /api/v1/academics/sections "{\"program_stage_id\":\"$st1\",\"name\":\"A\",\"capacity\":60}" | jget '["id"]')
  sec2=$(napi POST /api/v1/academics/sections "{\"program_stage_id\":\"$st2\",\"name\":\"A\",\"capacity\":60}" | jget '["id"]')
  local secs=("$sec1" "$sec2")
  local examid; examid=$(napi POST /api/v1/academics/exams "{\"name\":\"Mid-Term\",\"max_marks\":100}" | jget '["id"]')

  info "  onboarding 5 teachers + 3 staff…"
  local teacher1="" i
  for i in $(seq 1 5); do
    local tid; tid=$(napi POST /api/v1/teachers/onboard "{\"name\":\"$admp Teacher $i\",\"specialization\":\"${subjects[$(((i-1)%${#subjects[@]}))]%%:*}\",\"employee_code\":\"$admp-T$i\"}" | jget '["teacher_id"]')
    [ -z "$teacher1" ] && teacher1="$tid"
  done
  for i in $(seq 1 3); do
    napi POST /api/v1/staff/onboard "{\"name\":\"$admp Staff $i\",\"department\":\"Administration\",\"designation\":\"Officer $i\",\"employee_code\":\"$admp-E$i\"}" >/dev/null
  done
  # bind teacher1 to section1 + subject1 so LMS/marks have an anchor
  napi POST /api/v1/academics/teaching-assignments "{\"section_id\":\"$sec1\",\"subject_id\":\"${subj_ids[0]}\",\"teacher_id\":\"$teacher1\"}" >/dev/null

  info "  onboarding $STUDENTS students (+guardians, enroll, invoice)…"
  local sample_enr=() guardian_ids=() n
  for n in $(seq 1 "$STUDENTS"); do
    local adm; adm=$(printf '%s-%04d' "$admp" "$n")
    local sid; sid=$(napi POST /api/v1/students/onboard \
      "{\"name\":\"$admp Student $n\",\"admission_no\":\"$adm\",\"gender\":\"$([ $((n%2)) -eq 0 ] && echo MALE || echo FEMALE)\",\"guardians\":[{\"name\":\"$admp Parent $n\",\"phone\":\"9000$(printf '%05d' "$n")\",\"relation\":\"$([ $((n%2)) -eq 0 ] && echo FATHER || echo MOTHER)\",\"is_primary\":true,\"can_pay\":true}]}" \
      | jget '["student_id"]')
    local sec=${secs[$(((n-1)%2))]}
    local enr; enr=$(napi POST "/api/v1/academics/sections/$sec/enroll" "{\"student_id\":\"$sid\",\"roll_no\":\"$n\"}" | jget '["id"]')
    napi POST /api/v1/finance/invoices "{\"student_id\":\"$sid\",\"lines\":[{\"description\":\"Term 1 tuition\",\"amount\":$feeamt}]}" >/dev/null
    # ~1 in 3 students has paid something
    if [ $((n%3)) -eq 0 ]; then
      napi POST /api/v1/finance/payments "{\"student_id\":\"$sid\",\"amount\":$((feeamt/2)),\"method\":\"UPI\"}" >/dev/null
    fi
    # capture a sample (section-1 students) for attendance/marks
    if [ $(((n-1)%2)) -eq 0 ] && [ ${#sample_enr[@]} -lt 15 ]; then sample_enr+=("$enr"); fi
    if [ ${#guardian_ids[@]} -lt 2 ]; then
      guardian_ids+=("$(napi GET "/api/v1/students/$sid" | jget '["guardians"][0]["id"]')")
    fi
    if [ $((n%20)) -eq 0 ]; then printf '    … %d/%d\n' "$n" "$STUDENTS"; fi
  done

  info "  marking sample attendance + entering marks…"
  local att_entries="" mk_entries="" e first=1
  for e in "${sample_enr[@]}"; do
    [ $first -eq 0 ] && { att_entries+=","; mk_entries+=","; }; first=0
    att_entries+="{\"enrollment_id\":\"$e\",\"status\":\"$([ $((RANDOM%5)) -eq 0 ] && echo ABSENT || echo PRESENT)\"}"
    mk_entries+="{\"enrollment_id\":\"$e\",\"subject_id\":\"${subj_ids[0]}\",\"marks\":$((50 + RANDOM%50))}"
  done
  if [ -n "$att_entries" ]; then
    napi POST /api/v1/academics/attendance "{\"section_id\":\"$sec1\",\"marked_by\":\"$teacher1\",\"date\":\"2026-06-10\",\"entries\":[$att_entries]}" >/dev/null
    napi POST /api/v1/academics/marks "{\"exam_id\":\"$examid\",\"graded_by\":\"$teacher1\",\"entries\":[$mk_entries]}" >/dev/null
  fi

  info "  promoting 2 guardians to portal users…"
  for g in "${guardian_ids[@]}"; do napi POST "/api/v1/students/guardians/$g/promote" "{}" >/dev/null || true; done
}

# ---- run both schools -----------------------------------------------------------
START=$(date +%s)

provision_school "Lincoln High School" "lincoln" "Laura Lincoln" "principal@lincoln.demo"
L_TENANT="$TENANT"; L_LOGIN="$SCHOOL_LOGIN"; L_PASS="$SCHOOL_PASS"
seed_school "LIN" "Secondary" "SEC" "Grade 9" "Grade 10" 5000 "Mathematics:MATH" "Science:SCI" "English:ENG"
ok "Lincoln seeded."

provision_school "Maple Valley College" "maple" "Marcus Maple" "dean@maple.demo"
M_TENANT="$TENANT"; M_LOGIN="$SCHOOL_LOGIN"; M_PASS="$SCHOOL_PASS"
seed_school "MPL" "Undergraduate" "UG" "Semester 1" "Semester 2" 8000 "Physics:PHY" "Chemistry:CHEM" "Computer Science:CS"
ok "Maple seeded."

# ---- record (for one-click cleanup) ---------------------------------------------
cat > "$RECORD" <<JSON
{
  "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "students_per_school": $STUDENTS,
  "schools": [
    { "name": "Lincoln High School", "slug": "lincoln", "login_domain": "lincoln.com",
      "tenant_id": "$L_TENANT", "admin_login": "$L_LOGIN", "admin_temp_password": "$L_PASS" },
    { "name": "Maple Valley College", "slug": "maple", "login_domain": "maple.com",
      "tenant_id": "$M_TENANT", "admin_login": "$M_LOGIN", "admin_temp_password": "$M_PASS" }
  ]
}
JSON

ok "Done in $(( $(date +%s) - START ))s. Record → $RECORD"
echo
echo "  Lincoln admin : $L_LOGIN  /  $L_PASS"
echo "  Maple admin   : $M_LOGIN  /  $M_PASS"
echo "  (each admin must reset password on first browser login)"
echo "  Clean it all with:  ./ved.sh clean-demo"
