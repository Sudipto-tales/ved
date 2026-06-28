// Dynamic school-registration form (control plane). The superadmin curates which fields a
// prospective school must submit at sign-up — toggling/relabelling the built-ins and adding
// custom fields — and the public /signup form + the review screen render from it. This is
// the control-plane sibling of the tenant-plane "dynamic onboarding template" (M10).
//
// Saving the template is the golden-rule analog: field upserts + ONE cp_audit_log row in a
// single tx. No cp_outbox — the template is control-plane-only; tenant nodes never need it.
package registration

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// customKeyRe validates a superadmin-coined custom field key — a JSONB-safe slug.
var customKeyRe = regexp.MustCompile(`^[a-z][a-z0-9_]{1,40}$`)

// builtinKeys are the fixed fields that map 1:1 to school_registration columns. New built-ins
// cannot be created; any unknown key the editor submits is treated as a custom field.
var builtinKeys = map[string]bool{
	"school_name": true, "slug": true, "admin_name": true,
	"admin_email": true, "admin_phone": true, "plan_id": true,
	"business_reg": true, "gst": true,
}

var allowedFieldTypes = map[string]bool{
	"TEXT": true, "NUMBER": true, "DATE": true,
	"EMAIL": true, "PHONE": true, "DROPDOWN": true, "FILE": true,
}

// ErrLockedField is returned when the editor tries to hide / un-require / delete a locked
// built-in (school_name, slug, admin_name, admin_email, plan_id).
var ErrLockedField = errors.New("a required built-in field cannot be hidden or made optional")

// OptionDef is one choice in a DROPDOWN custom field.
type OptionDef struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

// FieldDef is one configurable row of the registration form.
type FieldDef struct {
	FieldKey  string      `json:"field_key"`
	Kind      string      `json:"kind"` // BUILTIN | CUSTOM
	FieldType string      `json:"field_type"`
	Label     string      `json:"label"`
	HelpText  string      `json:"help_text"`
	Visible   bool        `json:"visible"`
	Required  bool        `json:"required"`
	Locked    bool        `json:"locked"`
	Ordinal   int         `json:"ordinal"`
	Options   []OptionDef `json:"options"`
}

// GetRegistrationForm returns the form template ordered for display. includeHidden=false is
// the public projection (the signup form only needs the fields it should render).
func (s *Service) GetRegistrationForm(ctx context.Context, includeHidden bool) ([]FieldDef, error) {
	q := `SELECT field_key, kind, field_type, label, help_text, visible, required, locked, ordinal, options
	        FROM control_plane.registration_field_config`
	if !includeHidden {
		q += ` WHERE visible`
	}
	q += ` ORDER BY ordinal, field_key`
	rows, err := s.pool.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []FieldDef{}
	for rows.Next() {
		var f FieldDef
		var opts []byte
		if err := rows.Scan(&f.FieldKey, &f.Kind, &f.FieldType, &f.Label, &f.HelpText,
			&f.Visible, &f.Required, &f.Locked, &f.Ordinal, &opts); err != nil {
			return nil, err
		}
		f.Options = []OptionDef{}
		if len(opts) > 0 {
			_ = json.Unmarshal(opts, &f.Options)
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// SaveRegistrationForm replaces the template authoritatively in one tx: every incoming field
// is upserted, any custom field absent from the payload is deleted, and a single cp_audit_log
// row records the change. kind/field_type/locked are immutable after creation — they're taken
// from the existing row, never from client input (a built-in can't be relabelled into a
// custom, a locked field can't be unlocked).
func (s *Service) SaveRegistrationForm(ctx context.Context, adminID uuid.UUID, fields []FieldDef) error {
	return inTx(ctx, s.pool, func(tx pgx.Tx) error {
		// Authoritative view of what already exists (kind + locked).
		type existing struct {
			kind   string
			locked bool
		}
		have := map[string]existing{}
		rows, err := tx.Query(ctx, `SELECT field_key, kind, locked FROM control_plane.registration_field_config`)
		if err != nil {
			return err
		}
		for rows.Next() {
			var k, kind string
			var locked bool
			if err := rows.Scan(&k, &kind, &locked); err != nil {
				rows.Close()
				return err
			}
			have[k] = existing{kind: kind, locked: locked}
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}

		incoming := map[string]bool{}
		for _, f := range fields {
			if f.FieldKey == "" || f.Label == "" {
				return fmt.Errorf("%w: every field needs a key and a label", ErrInvalidInput)
			}
			if incoming[f.FieldKey] {
				return fmt.Errorf("%w: duplicate field key %q", ErrInvalidInput, f.FieldKey)
			}
			incoming[f.FieldKey] = true

			prev, exists := have[f.FieldKey]
			kind, locked, fieldType := f.Kind, false, f.FieldType
			if exists {
				// Immutable attributes come from the stored row.
				kind, locked = prev.kind, prev.locked
			} else {
				// A new key is always a CUSTOM field (built-ins are a fixed set).
				if builtinKeys[f.FieldKey] {
					return fmt.Errorf("%w: built-in field %q is missing from the catalog", ErrInvalidInput, f.FieldKey)
				}
				kind = "CUSTOM"
				if !customKeyRe.MatchString(f.FieldKey) {
					return fmt.Errorf("%w: custom key %q must be a slug (a-z, 0-9, _)", ErrInvalidInput, f.FieldKey)
				}
				if !allowedFieldTypes[fieldType] {
					return fmt.Errorf("%w: unknown field_type %q", ErrInvalidInput, fieldType)
				}
			}

			visible, required := f.Visible, f.Required
			if locked {
				// Locked built-ins are always shown and always required.
				if !visible || !required {
					return fmt.Errorf("%w (%s)", ErrLockedField, f.FieldKey)
				}
				visible, required = true, true
			}
			if !visible {
				required = false // a hidden field can't be required
			}

			opts := f.Options
			if opts == nil {
				opts = []OptionDef{}
			}
			if kind == "CUSTOM" && fieldType == "DROPDOWN" && len(opts) == 0 {
				return fmt.Errorf("%w: dropdown %q needs at least one option", ErrInvalidInput, f.FieldKey)
			}
			optsJSON, err := json.Marshal(opts)
			if err != nil {
				return err
			}

			if _, err := tx.Exec(ctx,
				`INSERT INTO control_plane.registration_field_config
				   (id, field_key, kind, field_type, label, help_text, visible, required, locked, ordinal, options, updated_at)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
				 ON CONFLICT (field_key) DO UPDATE SET
				   label=$5, help_text=$6, visible=$7, required=$8, ordinal=$10, options=$11, updated_at=now()`,
				uuid.Must(uuid.NewV7()), f.FieldKey, kind, fieldType, f.Label, f.HelpText,
				visible, required, locked, f.Ordinal, optsJSON); err != nil {
				return err
			}
		}

		// Delete custom fields the editor removed. Built-ins are never deleted, even if omitted.
		for key, ex := range have {
			if ex.kind == "CUSTOM" && !incoming[key] {
				if _, err := tx.Exec(ctx,
					`DELETE FROM control_plane.registration_field_config WHERE field_key=$1`, key); err != nil {
					return err
				}
			}
		}

		// One audit row for the whole save (golden-rule analog; no cp_outbox).
		detail, _ := json.Marshal(map[string]any{"field_count": len(fields)})
		if _, err := tx.Exec(ctx,
			`INSERT INTO control_plane.cp_audit_log (id, admin_id, action, target_type, detail)
			 VALUES ($1,$2,'registration_form.update','registration_form',$3)`,
			uuid.Must(uuid.NewV7()), adminID, detail); err != nil {
			return err
		}
		return nil
	})
}

// isBlank reports whether a custom-field answer is effectively empty.
func isBlank(v any) bool {
	if v == nil {
		return true
	}
	if s, ok := v.(string); ok {
		return strings.TrimSpace(s) == ""
	}
	return false
}

// missingRegistrationFields returns the LABELS of every visible+required field the submission
// did not provide. Direct analog of onboarding.MissingRequiredFields.
func missingRegistrationFields(form []FieldDef, present map[string]bool) []string {
	var missing []string
	for _, f := range form {
		if f.Visible && f.Required && !present[f.FieldKey] {
			missing = append(missing, f.Label)
		}
	}
	return missing
}
