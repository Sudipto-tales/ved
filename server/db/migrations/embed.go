// Package migrations embeds the goose SQL migrations so the binary is fully
// self-contained (no files to ship alongside the node). See 13-update-pipeline.md
// for the expand/contract migration strategy.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
