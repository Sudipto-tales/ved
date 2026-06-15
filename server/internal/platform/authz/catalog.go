// Package authz is the RBAC kernel (docs/plan/bridges.md §4, docs/05-rbac.md). It owns:
//
//   - the CLOSED, code-defined permission catalog (the strings handlers check),
//   - the default-role template used by tenant provisioning,
//   - the effective-permission resolver (membership roles -> permissions, via RLS),
//   - the `Require(...)` middleware that gates a handler on one permission.
//
// Permissions are FIXED in code so `Require("student.onboard")` is reliable; roles are
// DYNAMIC bundles a school assembles. Tenant-plane permissions live here; platform
// (control-plane) permissions are a SEPARATE namespace and never merge (docs/05).
package authz

// Permission is one entry in the closed catalog.
type Permission struct {
	Key         string
	Description string
}

// TenantAdmin is the wildcard-within-a-tenant permission. When a membership's effective
// set contains it, every tenant-plane permission check short-circuits to allow (School
// Admin = god within one tenant, nothing outside it).
const TenantAdmin = "tenant.admin"

// Catalog is the closed set of tenant-plane permissions (docs/05-rbac.md). Seeded into
// the global `permissions` table at startup; adding a capability means adding a row here.
var Catalog = []Permission{
	// People management
	{"student.create", "Create a student directly"},
	{"student.onboard", "Run the student onboarding workflow"},
	{"student.read", "View students"},
	{"student.update", "Edit student records"},
	{"teacher.create", "Create a teacher directly"},
	{"teacher.onboard", "Run the teacher onboarding workflow"},
	{"teacher.read", "View teachers"},
	{"teacher.update", "Edit teacher records"},
	{"staff.create", "Create a staff member directly"},
	{"staff.onboard", "Run the staff onboarding workflow"},
	{"staff.read", "View staff"},
	{"staff.update", "Edit staff records"},

	// Access control
	{"role.manage", "Create, edit and delete roles and their permissions"},
	{"designation.manage", "Manage designations (job titles)"},
	{"user.assign_roles", "Assign roles to a member"},

	// Onboarding
	{"onboarding.skip", "Bypass the wizard and register a user directly"},
	{"onboarding.approve", "Approve a pending onboarding"},

	// Academics
	{"academics.manage", "Manage programs, sections, curriculum"},
	{"attendance.mark", "Record attendance"},
	{"exam.manage", "Manage exams"},
	{"marks.enter", "Enter marks"},

	// Finance
	{"fee.manage", "Manage fee heads, structures and schedules"},
	{"payment.record", "Record a payment"},
	{"receipt.issue", "Issue a receipt"},

	// Tenant
	{"tenant.settings", "Edit tenant settings"},
	{TenantAdmin, "Full control within this tenant (School Admin)"},

	// Guardian portal (always self-scoped to the guardian's own children; see docs/18)
	{"guardian.read_child", "View own child's records"},
	{"guardian.read_fees", "View own child's fees"},
	{"guardian.pay_fees", "Pay own child's fees"},
	{"guardian.update_own_contact", "Update own contact details"},
	{"guardian.request_leave", "Request leave for own child"},
}

// DefaultRole is a system role seeded at tenant provisioning (is_system=true), with the
// permission keys it bundles. Schools can add their own roles on top of these.
type DefaultRole struct {
	Name        string
	Permissions []string
}

// DefaultRoles is the provisioning template (docs/05-rbac.md "The Bootstrap"). The first
// admin is attached to "School Admin" (tenant.admin) so the tenant has a god-within-it
// account that can then build out every other role.
var DefaultRoles = []DefaultRole{
	{"School Admin", []string{TenantAdmin}},
	{"Admission Officer", []string{"student.onboard", "student.create", "student.read", "student.update", "onboarding.approve"}},
	{"Class Teacher", []string{"student.read", "attendance.mark", "marks.enter", "exam.manage"}},
	{"Accountant", []string{"fee.manage", "payment.record", "receipt.issue"}},
	{"Student", []string{}},
}

// SchoolAdminRole is the role the first admin is bootstrapped into.
const SchoolAdminRole = "School Admin"
