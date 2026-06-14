// Package config loads runtime configuration from the environment. The Docker
// stack (docker-compose.yml) supplies these; defaults keep local runs working.
package config

import "os"

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
	// DevSeed, when true, idempotently seeds a demo tenant + admin user on startup so
	// login works out of the box before control-plane provisioning exists (M4).
	DevSeed bool
}

// FromEnv reads config, falling back to defaultAddr for the HTTP listen address.
func FromEnv(defaultAddr string) Config {
	return Config{
		HTTPAddr:    env("HTTP_ADDR", defaultAddr),
		DatabaseURL: env("DATABASE_URL", "postgres://ved:ved@localhost:5432/ved?sslmode=disable"),
		AppDBRole:   env("APP_DB_ROLE", "ved_app"),
		NATSURL:     env("NATS_URL", "nats://localhost:4222"),
		RedisURL:    env("REDIS_URL", "redis://localhost:6379"),
		JWTSecret:   env("JWT_SECRET", "dev-insecure-secret-change-me"),
		DevSeed:     env("DEV_SEED", "true") == "true",
	}
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
