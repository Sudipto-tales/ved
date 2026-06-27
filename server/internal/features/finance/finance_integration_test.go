//go:build integration

// Integration tests for the finance slice — the append-only, event-sourced ledger.
// Proves what the slice's design care point promises, automatically:
//   - derived outstanding = Σ DEBIT − Σ CREDIT (never stored)
//   - void writes a REVERSAL and PRESERVES the original payment row (append-only)
//   - receipts are gapless (RCT-00001, RCT-00002)
//   - RLS isolation: one tenant's ledger is invisible to another
//
// Run: ./ved.sh test   (or: go test -tags=integration ./internal/features/finance/...)
package finance

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/weloin/ved/internal/features/students"
	"github.com/weloin/ved/internal/platform/onboarding"
	"github.com/weloin/ved/internal/platform/testdb"
)

func TestLedgerDerivedOutstandingAndAppendOnlyVoid(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	tenant := testdb.NewTenant(t, pool, nodeID)

	studentSvc := students.NewService(students.NewRepo(pool, nodeID), onboarding.NewEngine(pool, nodeID))
	sres, err := studentSvc.Onboard(context.Background(), tenant.ID, tenant.Actor, students.OnboardInput{
		Name: "Fee Payer", AdmissionNo: "ADM-FIN-001",
	})
	require.NoError(t, err)
	studentID := sres.StudentID

	svc := NewService(pool, onboarding.NewEngine(pool, nodeID))
	ctx := context.Background()

	// Issue a 5000 invoice → outstanding 5000.
	_, err = svc.IssueInvoice(ctx, tenant.ID, tenant.Actor, studentID, "2026-07-01", []InvoiceLine{
		{Description: "Tuition Q1", Amount: 5000},
	})
	require.NoError(t, err)
	assertOutstanding(t, svc, tenant.ID, studentID, 5000)

	// Pay 5000 → outstanding 0; receipt RCT-00001.
	pay1, err := svc.RecordPayment(ctx, tenant.ID, tenant.Actor, studentID, 5000, "CASH")
	require.NoError(t, err)
	assert.Equal(t, "RCT-00001", pay1.ReceiptNo, "first receipt is gapless RCT-00001")
	assertOutstanding(t, svc, tenant.ID, studentID, 0)

	// Void the payment → outstanding back to 5000; the original payment row is PRESERVED.
	require.NoError(t, svc.VoidPayment(ctx, tenant.ID, tenant.Actor, pay1.PaymentID))
	assertOutstanding(t, svc, tenant.ID, studentID, 5000)
	payRows := testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM payment WHERE id = $1`, pay1.PaymentID)
	assert.Equal(t, 1, payRows, "voided payment row is preserved (append-only; reversal is a new ledger entry)")

	// A second payment gets the next gapless receipt.
	pay2, err := svc.RecordPayment(ctx, tenant.ID, tenant.Actor, studentID, 2000, "CASH")
	require.NoError(t, err)
	assert.Equal(t, "RCT-00002", pay2.ReceiptNo, "receipts are gapless")
	assertOutstanding(t, svc, tenant.ID, studentID, 3000)
}

func TestRLSIsolation(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	tenantA := testdb.NewTenant(t, pool, nodeID)
	tenantB := testdb.NewTenant(t, pool, nodeID)

	studentSvc := students.NewService(students.NewRepo(pool, nodeID), onboarding.NewEngine(pool, nodeID))
	sres, err := studentSvc.Onboard(context.Background(), tenantA.ID, tenantA.Actor, students.OnboardInput{
		Name: "A Student", AdmissionNo: "ADM-FIN-A1",
	})
	require.NoError(t, err)

	svc := NewService(pool, onboarding.NewEngine(pool, nodeID))
	_, err = svc.IssueInvoice(context.Background(), tenantA.ID, tenantA.Actor, sres.StudentID, "2026-07-01",
		[]InvoiceLine{{Description: "Tuition", Amount: 1000}})
	require.NoError(t, err)

	aEntries := testdb.CountInTenant(t, pool, tenantA.ID, `SELECT count(*) FROM ledger_entry`)
	bEntries := testdb.CountInTenant(t, pool, tenantB.ID, `SELECT count(*) FROM ledger_entry`)
	assert.GreaterOrEqual(t, aEntries, 1, "tenant A sees its own ledger entries")
	assert.Equal(t, 0, bEntries, "tenant B must NOT see tenant A's ledger entries")
}

func assertOutstanding(t *testing.T, svc *Service, tenantID, studentID uuid.UUID, want float64) {
	t.Helper()
	led, err := svc.StudentLedger(context.Background(), tenantID, studentID)
	require.NoError(t, err)
	assert.InDelta(t, want, led["outstanding"], 0.001, "derived outstanding")
}
