// Package config loads runtime configuration from the environment. The Docker
// stack (docker-compose.yml) supplies these; defaults keep local runs working.
package config

import (
	"os"
	"strings"
)

type Config struct {
	HTTPAddr    string
	DatabaseURL string
	// AppDBRole is the NON-superuser role the runtime connection pool runs as, so RLS
	// enforces. Empty = connect as the owner (used by the control plane).
	AppDBRole string
	NATSURL   string
	RedisURL  string
	// JWTSecret signs/verifies access + refresh tokens (M1 auth). A node generates a
	// stable secret at provisioning (M6); for local dev a fixed default is fine.
	JWTSecret string
	// PlatformJWTSecret signs the control-plane (platform superadmin) token. Separate
	// secret + issuer from the tenant token — separate namespace (M4).
	PlatformJWTSecret string
	// LicenseSigningKey signs the offline-validatable node license (M4 control plane).
	LicenseSigningKey string
	// DevSeed, when true, idempotently seeds a demo tenant + admin user on startup so
	// login works out of the box before control-plane provisioning exists (M4).
	DevSeed bool
	// CORSOrigins are the browser origins allowed to call this API (the SPA dev servers).
	// The tenant app runs on :5173, the platform SPA on :5174.
	CORSOrigins []string
}

// FromEnv reads config, falling back to defaultAddr for the HTTP listen address.
func FromEnv(defaultAddr string) Config {
	return Config{
		HTTPAddr:          env("HTTP_ADDR", defaultAddr),
		DatabaseURL:       env("DATABASE_URL", "postgres://ved:ved@localhost:5432/ved?sslmode=disable"),
		AppDBRole:         env("APP_DB_ROLE", "ved_app"),
		NATSURL:           env("NATS_URL", "nats://localhost:4222"),
		RedisURL:          env("REDIS_URL", "redis://localhost:6379"),
		JWTSecret:         env("JWT_SECRET", "dev-insecure-secret-change-me"),
		PlatformJWTSecret: env("PLATFORM_JWT_SECRET", "dev-insecure-platform-secret-change-me"),
		LicenseSigningKey: env("LICENSE_SIGNING_KEY", "dev-insecure-license-key-change-me"),
		DevSeed:           env("DEV_SEED", "true") == "true",
		CORSOrigins:       splitCSV(env("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174")),
	}
}

// splitCSV splits a comma-separated list and trims blanks (e.g. CORS_ORIGINS).
func splitCSV(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if v := strings.TrimSpace(p); v != "" {
			out = append(out, v)
		}
	}
	return out
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
