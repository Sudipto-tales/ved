// Package credential is the shared login-handle + temporary-password generator
// (docs/06-onboarding-credentials.md). Every people slice (students now; teachers/staff
// at M5) onboards users through it, so the handle algorithm exists once.
//
// The generated handle is a LOGIN IDENTIFIER, not a real mailbox:
//
//	{name_slug}.{type_suffix}@{school_slug}.com
//	on collision, an incrementing number is appended to the name part:
//	  johndoe.student@ved.com → johndoe2.student@ved.com → johndoe3.student@ved.com
//
// Uniqueness is GLOBAL (users.login_identifier is globally unique), so the caller
// supplies an `exists` probe that checks the users table.
package credential

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"strings"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

// TypeSuffix maps a user_type to its login-handle suffix (docs/06).
func TypeSuffix(userType string) string {
	switch strings.ToUpper(userType) {
	case "STUDENT":
		return "student"
	case "TEACHER":
		return "teacher"
	case "EMPLOYEE":
		return "employee"
	case "GUARDIAN":
		return "guardian"
	default:
		return "user"
	}
}

// Slugify lowercases, strips accents, and reduces a name to alphanumerics (docs/06:
// "lowercase, strip accents, alnum + dots"). Empty/garbage input yields "user".
func Slugify(name string) string {
	// Decompose accents (é → e +  ́) then drop the combining marks.
	t := transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC)
	cleaned, _, err := transform.String(t, name)
	if err != nil {
		cleaned = name
	}
	var b strings.Builder
	for _, r := range strings.ToLower(cleaned) {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	slug := b.String()
	if slug == "" {
		return "user"
	}
	return slug
}

// GenerateHandle builds an available login handle for the person. `exists` reports
// whether a candidate handle is already taken (global check against users).
func GenerateHandle(name, userType, schoolSlug string, exists func(handle string) (bool, error)) (string, error) {
	base := Slugify(name)
	suffix := TypeSuffix(userType)
	for i := 1; i <= 1000; i++ {
		namePart := base
		if i > 1 {
			namePart = fmt.Sprintf("%s%d", base, i)
		}
		candidate := fmt.Sprintf("%s.%s@%s.com", namePart, suffix, schoolSlug)
		taken, err := exists(candidate)
		if err != nil {
			return "", err
		}
		if !taken {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("could not allocate a unique handle for %q", name)
}

const pwAlphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"

// TempPassword returns a 12-char temporary password (ambiguous chars excluded). The
// user is forced to reset it on first login (must_reset_password).
func TempPassword() (string, error) {
	const n = 12
	b := make([]byte, n)
	max := big.NewInt(int64(len(pwAlphabet)))
	for i := range b {
		idx, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		b[i] = pwAlphabet[idx.Int64()]
	}
	return string(b), nil
}
