package onboarding

import (
	"encoding/json"

	"github.com/google/uuid"
)

// Small SQL/marshalling helpers shared by people slices (students/teachers/staff).

// NullString returns nil for "" so empty optional text becomes SQL NULL.
func NullString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// NilUUID returns nil for the zero UUID (e.g. an absent actor → SQL NULL).
func NilUUID(a uuid.UUID) *uuid.UUID {
	if a == uuid.Nil {
		return nil
	}
	return &a
}

// NullJSON returns nil for empty raw JSON so it becomes SQL NULL, else the bytes.
func NullJSON(j json.RawMessage) any {
	if len(j) == 0 {
		return nil
	}
	return []byte(j)
}

// IsUniqueViolation reports whether err is a Postgres unique-constraint violation (23505).
func IsUniqueViolation(err error) bool {
	return err != nil && containsStr(err.Error(), "SQLSTATE 23505")
}

// NameFromHandle recovers a roster label from a login handle's local part
// (johndoe.teacher@ved.com → "johndoe"). The real display name is not stored on a profile
// yet (it rides the audit/event payload); this is a reasonable label for now.
func NameFromHandle(handle string) string {
	local := handle
	if at := indexByte(local, '@'); at >= 0 {
		local = local[:at]
	}
	if dot := lastIndexByte(local, '.'); dot >= 0 {
		local = local[:dot]
	}
	return local
}

func indexByte(s string, b byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == b {
			return i
		}
	}
	return -1
}
func lastIndexByte(s string, b byte) int {
	for i := len(s) - 1; i >= 0; i-- {
		if s[i] == b {
			return i
		}
	}
	return -1
}
func containsStr(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
