// Package crypto holds the password hashing primitives used by identity. We use
// argon2id (memory-hard, side-channel resistant) and store a self-describing
// PHC-style string so parameters can evolve without a schema change
// (docs/database/02-identity-access.md — password_hash is argon2id, never plaintext).
package crypto

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// params are the argon2id cost parameters. Encoded into every hash so older hashes
// stay verifiable after a tuning change.
type params struct {
	memory      uint32 // KiB
	iterations  uint32
	parallelism uint8
	saltLen     uint32
	keyLen      uint32
}

var defaultParams = params{memory: 64 * 1024, iterations: 3, parallelism: 2, saltLen: 16, keyLen: 32}

var (
	// ErrMismatch is returned when a password does not match the hash.
	ErrMismatch = errors.New("password does not match")
	// ErrBadHash is returned when a stored hash cannot be parsed.
	ErrBadHash = errors.New("invalid password hash format")
)

// HashPassword returns a PHC-encoded argon2id hash of the plaintext password.
func HashPassword(plaintext string) (string, error) {
	p := defaultParams
	salt := make([]byte, p.saltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("read salt: %w", err)
	}
	key := argon2.IDKey([]byte(plaintext), salt, p.iterations, p.memory, p.parallelism, p.keyLen)
	b64 := base64.RawStdEncoding.EncodeToString
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, p.memory, p.iterations, p.parallelism, b64(salt), b64(key)), nil
}

// VerifyPassword reports whether plaintext matches the PHC-encoded hash. It uses a
// constant-time comparison to avoid timing leaks.
func VerifyPassword(plaintext, encoded string) error {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return ErrBadHash
	}
	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return ErrBadHash
	}
	var p params
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &p.memory, &p.iterations, &p.parallelism); err != nil {
		return ErrBadHash
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return ErrBadHash
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return ErrBadHash
	}
	got := argon2.IDKey([]byte(plaintext), salt, p.iterations, p.memory, p.parallelism, uint32(len(want)))
	if subtle.ConstantTimeCompare(got, want) != 1 {
		return ErrMismatch
	}
	return nil
}
