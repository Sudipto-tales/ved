// Package cpmigrations embeds the control-plane goose migrations. These create the
// `control_plane` schema (cloud-only: registration, billing, licensing) and run under
// their OWN goose version table, separate from the tenant-plane migrations.
package cpmigrations

import "embed"

//go:embed *.sql
var FS embed.FS
