// Dynamic onboarding template + dropdown lists (M10, docs/06, docs/database/03-tenant-setup.md).
// Part of the access slice (it owns tenant.settings). A School Admin tailors the people
// onboarding forms — which built-in fields are shown/required and how the dropdown option
// lists read — without a code change. The field_key always maps to an existing OnboardInput
// field (the "field-toggle" model), so this governs the form, not the schema.
package access

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ---- Default catalog (code source of truth for the seed + GET fallback) ----------

// FieldDef is one configurable field in the default onboarding template.
type FieldDef struct {
	Key              string `json:"field_key"`
	Label            string `json:"label"`
	Visible          bool   `json:"visible"`
	Required         bool   `json:"required"`
	Ordinal          int    `json:"ordinal"`
	DropdownCategory string `json:"dropdown_category,omitempty"`
}

// DefaultTemplates is the per-person-type set of built-in optional fields. Core identity
// fields (name; student admission_no) are always required in code and NOT listed here.
var DefaultTemplates = map[string][]FieldDef{
	"STUDENT": {
		{Key: "dob", Label: "Date of Birth", Visible: true, Ordinal: 1},
		{Key: "gender", Label: "Gender", Visible: true, Ordinal: 2, DropdownCategory: "GENDER"},
		{Key: "category", Label: "Category", Visible: true, Ordinal: 3, DropdownCategory: "STUDENT_CATEGORY"},
		{Key: "blood_group", Label: "Blood Group", Visible: true, Ordinal: 4, DropdownCategory: "BLOOD_GROUP"},
		{Key: "address", Label: "Address", Visible: true, Ordinal: 5},
		{Key: "prior_school", Label: "Previous School", Visible: true, Ordinal: 6},
		{Key: "prior_class", Label: "Previous Class", Visible: true, Ordinal: 7},
		{Key: "guardians", Label: "Guardians", Visible: true, Ordinal: 8},
	},
	"TEACHER": {
		{Key: "qualifications", Label: "Qualifications", Visible: true, Ordinal: 1},
		{Key: "specialization", Label: "Specialization", Visible: true, Ordinal: 2},
		{Key: "joining_date", Label: "Joining Date", Visible: true, Ordinal: 3},
		{Key: "employee_code", Label: "Employee Code", Visible: true, Ordinal: 4},
	},
	"EMPLOYEE": {
		{Key: "department", Label: "Department", Visible: true, Ordinal: 1, DropdownCategory: "DEPARTMENT"},
		{Key: "designation", Label: "Designation", Visible: true, Ordinal: 2, DropdownCategory: "DESIGNATION"},
		{Key: "joining_date", Label: "Joining Date", Visible: true, Ordinal: 3},
		{Key: "employee_code", Label: "Employee Code", Visible: true, Ordinal: 4},
	},
}

// defaultDropdowns are seeded so the form selects work out of the box; school-specific lists
// (DEPARTMENT/DESIGNATION) start empty for the admin to fill.
var defaultDropdowns = map[string][][2]string{ // category → [(label, value)]
	"GENDER":            {{"Male", "MALE"}, {"Female", "FEMALE"}, {"Other", "OTHER"}, {"Undisclosed", "UNDISCLOSED"}},
	"BLOOD_GROUP":       {{"A+", "A+"}, {"A-", "A-"}, {"B+", "B+"}, {"B-", "B-"}, {"O+", "O+"}, {"O-", "O-"}, {"AB+", "AB+"}, {"AB-", "AB-"}},
	"STUDENT_CATEGORY":  {{"General", "GENERAL"}, {"OBC", "OBC"}, {"SC", "SC"}, {"ST", "ST"}, {"EWS", "EWS"}},
	"GUARDIAN_RELATION": {{"Father", "FATHER"}, {"Mother", "MOTHER"}, {"Guardian", "GUARDIAN"}},
}

// ---- DTOs -------------------------------------------------------------------------

type FieldConfigDTO struct {
	FieldKey         string `json:"field_key"`
	Label            string `json:"label"`
	Visible          bool   `json:"visible"`
	Required         bool   `json:"required"`
	Ordinal          int    `json:"ordinal"`
	DropdownCategory string `json:"dropdown_category,omitempty"`
}

type DropdownOptionDTO struct {
	ID       uuid.UUID `json:"id"`
	Category string    `json:"category"`
	Label    string    `json:"label"`
	Value    string    `json:"value"`
	Ordinal  int       `json:"ordinal"`
	Active   bool      `json:"active"`
}

// ---- Reads ------------------------------------------------------------------------

// GetOnboardingTemplate returns the tenant's field config for a person_type. If the tenant
// has no stored rows (un-customized), it falls back to the code defaults so forms still work.
func (s *Service) GetOnboardingTemplate(ctx context.Context, tenantID uuid.UUID, personType string) ([]FieldConfigDTO, error) {
	if _, ok := DefaultTemplates[personType]; !ok {
		return nil, fmt.Errorf("%w: unknown person_type %q", ErrBadPerm, personType)
	}
	out := []FieldConfigDTO{}
	err := s.repo.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT field_key, label, visible, required, ordinal, COALESCE(dropdown_category,'')
			   FROM onboarding_field_config
			  WHERE person_type = $1 AND deleted_at IS NULL
			  ORDER BY ordinal, field_key`, personType)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var d FieldConfigDTO
			if err := rows.Scan(&d.FieldKey, &d.Label, &d.Visible, &d.Required, &d.Ordinal, &d.DropdownCategory); err != nil {
				return err
			}
			out = append(out, d)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	if len(out) == 0 {
		for _, f := range DefaultTemplates[personType] {
			out = append(out, FieldConfigDTO{FieldKey: f.Key, Label: f.Label, Visible: f.Visible, Required: f.Required, Ordinal: f.Ordinal, DropdownCategory: f.DropdownCategory})
		}
	}
	return out, nil
}

// ListDropdowns returns the tenant's active dropdown options (all categories).
func (s *Service) ListDropdowns(ctx context.Context, tenantID uuid.UUID) ([]DropdownOptionDTO, error) {
	out := []DropdownOptionDTO{}
	err := s.repo.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT id, category, label, value, ordinal, active FROM dropdown_option
			  WHERE deleted_at IS NULL ORDER BY category, ordinal, label`)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var d DropdownOptionDTO
			if err := rows.Scan(&d.ID, &d.Category, &d.Label, &d.Value, &d.Ordinal, &d.Active); err != nil {
				return err
			}
			out = append(out, d)
		}
		return rows.Err()
	})
	return out, err
}

// ---- Writes (golden rule: rows + one outbox + one audit per save) -----------------

// SetOnboardingTemplate upserts the field config for a person_type in one tx, then writes a
// single domain event + audit for the template aggregate.
func (s *Service) SetOnboardingTemplate(ctx context.Context, tenantID, actor uuid.UUID, personType string, fields []FieldConfigDTO) error {
	if _, ok := DefaultTemplates[personType]; !ok {
		return fmt.Errorf("%w: unknown person_type %q", ErrBadPerm, personType)
	}
	allowed := map[string]bool{}
	for _, f := range DefaultTemplates[personType] {
		allowed[f.Key] = true
	}
	hlc := nowHLC()
	return s.repo.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		for _, f := range fields {
			if !allowed[f.FieldKey] {
				return fmt.Errorf("%w: field %q is not configurable for %s", ErrBadPerm, f.FieldKey, personType)
			}
			if _, err := tx.Exec(ctx,
				`INSERT INTO onboarding_field_config
				   (id, tenant_id, person_type, field_key, label, visible, required, ordinal, dropdown_category, created_by, hlc, version, origin_node_id)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,$12)
				 ON CONFLICT (tenant_id, person_type, field_key) DO UPDATE
				   SET label=EXCLUDED.label, visible=EXCLUDED.visible, required=EXCLUDED.required,
				       ordinal=EXCLUDED.ordinal, dropdown_category=EXCLUDED.dropdown_category,
				       updated_at=now(), deleted_at=NULL, version=onboarding_field_config.version+1, hlc=EXCLUDED.hlc`,
				uuid.Must(uuid.NewV7()), tenantID, personType, f.FieldKey, f.Label, f.Visible, f.Required, f.Ordinal,
				nullDropdown(f.DropdownCategory), actorOrNil(actor), hlc, s.repo.nodeID); err != nil {
				return fmt.Errorf("upsert field %s: %w", f.FieldKey, err)
			}
		}
		payload, _ := json.Marshal(map[string]any{"person_type": personType, "fields": fields})
		return writeOutboxAudit(ctx, tx, tenantID, "onboarding_template", deterministicAgg(tenantID, personType),
			"UPDATE", "onboarding_template.updated", actor, payload, hlc, s.repo.nodeID)
	})
}

// UpsertDropdown creates or updates one option (matched by category+value) + outbox + audit.
func (s *Service) UpsertDropdown(ctx context.Context, tenantID, actor uuid.UUID, in DropdownOptionDTO) (uuid.UUID, error) {
	if in.Category == "" || in.Label == "" || in.Value == "" {
		return uuid.Nil, fmt.Errorf("%w: category, label, value required", ErrBadPerm)
	}
	hlc := nowHLC()
	id := in.ID
	if id == uuid.Nil {
		id = uuid.Must(uuid.NewV7())
	}
	err := s.repo.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx,
			`INSERT INTO dropdown_option (id, tenant_id, category, label, value, ordinal, active, created_by, hlc, version, origin_node_id)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10)
			 ON CONFLICT (tenant_id, category, value) WHERE deleted_at IS NULL DO UPDATE
			   SET label=EXCLUDED.label, ordinal=EXCLUDED.ordinal, active=EXCLUDED.active,
			       updated_at=now(), version=dropdown_option.version+1, hlc=EXCLUDED.hlc`,
			id, tenantID, in.Category, in.Label, in.Value, in.Ordinal, in.Active, actorOrNil(actor), hlc, s.repo.nodeID); err != nil {
			return fmt.Errorf("upsert dropdown: %w", err)
		}
		payload, _ := json.Marshal(map[string]any{"category": in.Category, "label": in.Label, "value": in.Value})
		return writeOutboxAudit(ctx, tx, tenantID, "dropdown_option", id, "UPDATE", "dropdown_option.upsert", actor, payload, hlc, s.repo.nodeID)
	})
	return id, err
}

// DeleteDropdown soft-deletes an option + outbox + audit.
func (s *Service) DeleteDropdown(ctx context.Context, tenantID, actor, id uuid.UUID) error {
	hlc := nowHLC()
	return s.repo.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		ct, err := tx.Exec(ctx,
			`UPDATE dropdown_option SET deleted_at=now(), updated_at=now(), version=version+1, hlc=$2
			  WHERE id=$1 AND deleted_at IS NULL`, id, hlc)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return ErrNotFound
		}
		payload, _ := json.Marshal(map[string]any{"id": id})
		return writeOutboxAudit(ctx, tx, tenantID, "dropdown_option", id, "DELETE", "dropdown_option.delete", actor, payload, hlc, s.repo.nodeID)
	})
}

// ---- Provisioning seed ------------------------------------------------------------

// SeedTenantSetup populates the default onboarding templates + dropdown lists for a fresh
// tenant. Idempotent (ON CONFLICT no-op), so it's safe to call on every boot.
func SeedTenantSetup(ctx context.Context, repo *Repo, tenantID uuid.UUID) error {
	hlc := nowHLC()
	return repo.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		for personType, fields := range DefaultTemplates {
			for _, f := range fields {
				if _, err := tx.Exec(ctx,
					`INSERT INTO onboarding_field_config
					   (id, tenant_id, person_type, field_key, label, visible, required, ordinal, dropdown_category, hlc, version, origin_node_id)
					 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1,$11)
					 ON CONFLICT (tenant_id, person_type, field_key) DO NOTHING`,
					uuid.Must(uuid.NewV7()), tenantID, personType, f.Key, f.Label, f.Visible, f.Required, f.Ordinal,
					nullDropdown(f.DropdownCategory), hlc, repo.nodeID); err != nil {
					return fmt.Errorf("seed field %s/%s: %w", personType, f.Key, err)
				}
			}
		}
		for category, opts := range defaultDropdowns {
			for i, lv := range opts {
				if _, err := tx.Exec(ctx,
					`INSERT INTO dropdown_option (id, tenant_id, category, label, value, ordinal, active, hlc, version, origin_node_id)
					 VALUES ($1,$2,$3,$4,$5,$6,true,$7,1,$8)
					 ON CONFLICT (tenant_id, category, value) WHERE deleted_at IS NULL DO NOTHING`,
					uuid.Must(uuid.NewV7()), tenantID, category, lv[0], lv[1], i, hlc, repo.nodeID); err != nil {
					return fmt.Errorf("seed dropdown %s/%s: %w", category, lv[1], err)
				}
			}
		}
		return nil
	})
}

// ---- helpers ----------------------------------------------------------------------

func nullDropdown(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// deterministicAgg derives a stable aggregate id for a tenant's template-of-a-type so the
// outbox/audit reference is consistent across saves (UUIDv5 over tenant+type).
func deterministicAgg(tenantID uuid.UUID, personType string) uuid.UUID {
	return uuid.NewSHA1(tenantID, []byte("onboarding_template:"+personType))
}
