// Package finance is the M5 finance slice — the append-only, event-sourced ledger
// (docs/database/06-finance.md, docs/10-finance-payments.md, flow B in docs/20). Two
// non-negotiables, enforced here and by DB triggers:
//
//  1. Money is append-only — a payment/invoice/ledger_entry is never UPDATEd or DELETEd;
//     a void inserts a REVERSAL entry that negates the original.
//  2. The student balance is DERIVED (Σ DEBIT − Σ CREDIT), never a stored column.
//
// Receipt numbers are GAPLESS per tenant (a missing number is itself an audit flag),
// drawn from a per-tenant counter advanced inside the payment transaction. Reuses the
// shared engine for the tenant tx + outbox/audit writer.
package finance

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/weloin/ved/internal/platform/authz"
	"github.com/weloin/ved/internal/platform/httpx"
	"github.com/weloin/ved/internal/platform/onboarding"
)

var (
	ErrNotFound     = errors.New("not found")
	ErrInvalidInput = errors.New("invalid input")
)

type Service struct {
	pool   *pgxpool.Pool
	engine *onboarding.Engine
}

func NewService(pool *pgxpool.Pool, engine *onboarding.Engine) *Service {
	return &Service{pool: pool, engine: engine}
}

// ---- fee heads -------------------------------------------------------------------

func (s *Service) CreateFeeHead(ctx context.Context, tenantID, actor uuid.UUID, name, kind string) (uuid.UUID, error) {
	if name == "" {
		return uuid.Nil, fmt.Errorf("%w: name required", ErrInvalidInput)
	}
	if kind == "" {
		kind = "RECURRING"
	}
	id := uuid.Must(uuid.NewV7())
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		hlc := onboarding.NowHLC()
		if _, err := tx.Exec(ctx,
			`INSERT INTO fee_head (id, tenant_id, name, kind, created_by, hlc, version, origin_node_id)
			 VALUES ($1,$2,$3,$4,$5,$6,1,$7)`,
			id, tenantID, name, kind, onboarding.NilUUID(actor), hlc, s.engine.NodeID()); err != nil {
			return fmt.Errorf("insert fee_head: %w", err)
		}
		b, _ := json.Marshal(map[string]any{"id": id, "name": name, "kind": kind})
		return s.engine.WriteEventAndAudit(ctx, tx, tenantID, "fee_head", id, "fee_head.create", actor, b, hlc)
	})
	return id, err
}

func (s *Service) ListFeeHeads(ctx context.Context, tenantID uuid.UUID) ([]map[string]any, error) {
	out := []map[string]any{}
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `SELECT id, name, kind FROM fee_head WHERE deleted_at IS NULL ORDER BY name`)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var id uuid.UUID
			var name, kind string
			if err := rows.Scan(&id, &name, &kind); err != nil {
				return err
			}
			out = append(out, map[string]any{"id": id, "name": name, "kind": kind})
		}
		return rows.Err()
	})
	return out, err
}

// ---- invoice (DEBIT) -------------------------------------------------------------

type InvoiceLine struct {
	FeeHeadID   *uuid.UUID `json:"fee_head_id"`
	Description string     `json:"description"`
	Amount      float64    `json:"amount"`
}

// IssueInvoice writes the invoice + its lines + one DEBIT ledger entry per line, in one tx.
func (s *Service) IssueInvoice(ctx context.Context, tenantID, actor, studentID uuid.UUID, dueDate string, lines []InvoiceLine) (uuid.UUID, error) {
	if studentID == uuid.Nil || len(lines) == 0 {
		return uuid.Nil, fmt.Errorf("%w: student_id and at least one line required", ErrInvalidInput)
	}
	invID := uuid.Must(uuid.NewV7())
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		hlc := onboarding.NowHLC()
		if _, err := tx.Exec(ctx,
			`INSERT INTO invoice (id, tenant_id, student_id, status, due_date, created_by, hlc, origin_node_id)
			 VALUES ($1,$2,$3,'ISSUED',$4,$5,$6,$7)`,
			invID, tenantID, studentID, onboarding.NullString(dueDate), onboarding.NilUUID(actor), hlc, s.engine.NodeID()); err != nil {
			return fmt.Errorf("insert invoice: %w", err)
		}
		for _, ln := range lines {
			if ln.Amount <= 0 {
				return fmt.Errorf("%w: line amount must be > 0", ErrInvalidInput)
			}
			if _, err := tx.Exec(ctx,
				`INSERT INTO invoice_line (id, tenant_id, invoice_id, fee_head_id, description, gross, net, created_by, hlc, origin_node_id)
				 VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9)`,
				uuid.Must(uuid.NewV7()), tenantID, invID, ln.FeeHeadID, onboarding.NullString(ln.Description),
				ln.Amount, onboarding.NilUUID(actor), hlc, s.engine.NodeID()); err != nil {
				return fmt.Errorf("insert invoice_line: %w", err)
			}
			// Issuing an invoice writes its DEBIT ledger entries (one per line).
			if err := insertLedger(ctx, tx, tenantID, studentID, "DEBIT", ln.Amount, "INVOICE", invID, nil, ln.FeeHeadID, actor, hlc, s.engine.NodeID()); err != nil {
				return err
			}
		}
		b, _ := json.Marshal(map[string]any{"invoice_id": invID, "student_id": studentID, "lines": len(lines)})
		return s.engine.WriteEventAndAudit(ctx, tx, tenantID, "invoice", invID, "invoice.issued", actor, b, hlc)
	})
	return invID, err
}

// ---- payment (CREDIT, gapless receipt) -------------------------------------------

type PaymentResult struct {
	PaymentID uuid.UUID `json:"payment_id"`
	ReceiptNo string    `json:"receipt_no"`
}

// RecordPayment writes a payment (gapless receipt_no) + its CREDIT ledger entry (flow B).
func (s *Service) RecordPayment(ctx context.Context, tenantID, actor, studentID uuid.UUID, amount float64, method string) (PaymentResult, error) {
	if studentID == uuid.Nil || amount <= 0 || method == "" {
		return PaymentResult{}, fmt.Errorf("%w: student_id, amount > 0, method required", ErrInvalidInput)
	}
	var res PaymentResult
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		hlc := onboarding.NowHLC()
		receipt, err := nextReceiptNo(ctx, tx, tenantID)
		if err != nil {
			return err
		}
		payID := uuid.Must(uuid.NewV7())
		if _, err := tx.Exec(ctx,
			`INSERT INTO payment (id, tenant_id, student_id, receipt_no, amount, method, collected_by, status, created_by, hlc, origin_node_id)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,'RECORDED',$8,$9,$10)`,
			payID, tenantID, studentID, receipt, amount, method, onboarding.NilUUID(actor), onboarding.NilUUID(actor), hlc, s.engine.NodeID()); err != nil {
			return fmt.Errorf("insert payment: %w", err)
		}
		if err := insertLedger(ctx, tx, tenantID, studentID, "CREDIT", amount, "PAYMENT", payID, nil, nil, actor, hlc, s.engine.NodeID()); err != nil {
			return err
		}
		b, _ := json.Marshal(map[string]any{"payment_id": payID, "student_id": studentID, "receipt_no": receipt, "amount": amount})
		if err := s.engine.WriteEventAndAudit(ctx, tx, tenantID, "payment", payID, "payment.recorded", actor, b, hlc); err != nil {
			return err
		}
		res = PaymentResult{PaymentID: payID, ReceiptNo: receipt}
		return nil
	})
	return res, err
}

// VoidPayment cancels a payment by inserting REVERSAL ledger entries that negate its
// CREDIT(s) — the payment row itself is immutable (append-only) and stays in the register
// to preserve the gapless sequence. The balance recovers via the derived sum.
func (s *Service) VoidPayment(ctx context.Context, tenantID, actor, paymentID uuid.UUID) error {
	return s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT id, student_id, amount FROM ledger_entry
			  WHERE source_type='PAYMENT' AND source_id=$1 AND direction='CREDIT'`, paymentID)
		if err != nil {
			return err
		}
		type orig struct {
			id      uuid.UUID
			student uuid.UUID
			amount  float64
		}
		var origs []orig
		for rows.Next() {
			var o orig
			if err := rows.Scan(&o.id, &o.student, &o.amount); err != nil {
				rows.Close()
				return err
			}
			origs = append(origs, o)
		}
		rows.Close()
		if len(origs) == 0 {
			return ErrNotFound
		}
		hlc := onboarding.NowHLC()
		for _, o := range origs {
			rev := o.id
			if err := insertLedger(ctx, tx, tenantID, o.student, "DEBIT", o.amount, "REVERSAL", paymentID, &rev, nil, actor, hlc, s.engine.NodeID()); err != nil {
				return err
			}
		}
		b, _ := json.Marshal(map[string]any{"payment_id": paymentID, "reversed": len(origs)})
		return s.engine.WriteEventAndAudit(ctx, tx, tenantID, "payment", paymentID, "payment.voided", actor, b, hlc)
	})
}

// ---- derived ledger --------------------------------------------------------------

// StudentLedger returns the immutable entries plus the DERIVED outstanding
// (Σ DEBIT − Σ CREDIT) — there is no stored balance.
func (s *Service) StudentLedger(ctx context.Context, tenantID, studentID uuid.UUID) (map[string]any, error) {
	var out map[string]any
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT id, direction, amount, source_type, source_id, created_at
			   FROM ledger_entry WHERE student_id=$1 ORDER BY created_at, id`, studentID)
		if err != nil {
			return err
		}
		defer rows.Close()
		entries := []map[string]any{}
		var debit, credit float64
		for rows.Next() {
			var id uuid.UUID
			var dir, src string
			var srcID *uuid.UUID
			var amt float64
			var at any
			if err := rows.Scan(&id, &dir, &amt, &src, &srcID, &at); err != nil {
				return err
			}
			if dir == "DEBIT" {
				debit += amt
			} else {
				credit += amt
			}
			entries = append(entries, map[string]any{"id": id, "direction": dir, "amount": amt, "source_type": src, "source_id": srcID, "created_at": at})
		}
		if err := rows.Err(); err != nil {
			return err
		}
		out = map[string]any{
			"entries":      entries,
			"total_debit":  debit,
			"total_credit": credit,
			"outstanding":  debit - credit, // derived; never stored
		}
		return nil
	})
	return out, err
}

// ---- tx helpers ------------------------------------------------------------------

func insertLedger(ctx context.Context, tx pgx.Tx, tenantID, studentID uuid.UUID, direction string, amount float64, sourceType string, sourceID uuid.UUID, reverses *uuid.UUID, feeHead *uuid.UUID, actor uuid.UUID, hlc string, nodeID uuid.UUID) error {
	_, err := tx.Exec(ctx,
		`INSERT INTO ledger_entry (id, tenant_id, student_id, direction, fee_head_id, amount, source_type, source_id, reverses_entry_id, created_by, hlc, origin_node_id)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		uuid.Must(uuid.NewV7()), tenantID, studentID, direction, feeHead, amount, sourceType, sourceID, reverses,
		onboarding.NilUUID(actor), hlc, nodeID)
	if err != nil {
		return fmt.Errorf("insert ledger_entry: %w", err)
	}
	return nil
}

// nextReceiptNo advances the gapless per-tenant receipt counter inside the tx.
func nextReceiptNo(ctx context.Context, tx pgx.Tx, tenantID uuid.UUID) (string, error) {
	var v int64
	err := tx.QueryRow(ctx,
		`INSERT INTO finance_counter (tenant_id, name, value) VALUES ($1,'receipt',1)
		 ON CONFLICT (tenant_id, name) DO UPDATE SET value = finance_counter.value + 1
		 RETURNING value`, tenantID).Scan(&v)
	if err != nil {
		return "", fmt.Errorf("receipt counter: %w", err)
	}
	return fmt.Sprintf("RCT-%05d", v), nil
}

// ---- HTTP ------------------------------------------------------------------------

func Register(r chi.Router, pool *pgxpool.Pool, nodeID uuid.UUID, res *authz.Resolver) {
	svc := NewService(pool, onboarding.NewEngine(pool, nodeID))
	feeManage := authz.Require(res, "fee.manage")
	payRecord := authz.Require(res, "payment.record")

	r.With(feeManage).Post("/api/v1/finance/fee-heads", func(w http.ResponseWriter, req *http.Request) {
		var in struct{ Name, Kind string }
		if decode(w, req, &in) != nil {
			return
		}
		id, err := svc.CreateFeeHead(req.Context(), httpx.TenantID(req.Context()), actorID(req), in.Name, in.Kind)
		if err != nil {
			writeErr(w, err)
			return
		}
		httpx.JSON(w, http.StatusCreated, map[string]any{"id": id})
	})
	r.With(feeManage).Get("/api/v1/finance/fee-heads", func(w http.ResponseWriter, req *http.Request) {
		list, err := svc.ListFeeHeads(req.Context(), httpx.TenantID(req.Context()))
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"fee_heads": list})
	})

	r.With(feeManage).Post("/api/v1/finance/invoices", func(w http.ResponseWriter, req *http.Request) {
		var in struct {
			StudentID uuid.UUID     `json:"student_id"`
			DueDate   string        `json:"due_date"`
			Lines     []InvoiceLine `json:"lines"`
		}
		if decode(w, req, &in) != nil {
			return
		}
		id, err := svc.IssueInvoice(req.Context(), httpx.TenantID(req.Context()), actorID(req), in.StudentID, in.DueDate, in.Lines)
		if err != nil {
			writeErr(w, err)
			return
		}
		httpx.JSON(w, http.StatusCreated, map[string]any{"invoice_id": id})
	})

	r.With(payRecord).Post("/api/v1/finance/payments", func(w http.ResponseWriter, req *http.Request) {
		var in struct {
			StudentID uuid.UUID `json:"student_id"`
			Amount    float64   `json:"amount"`
			Method    string    `json:"method"`
		}
		if decode(w, req, &in) != nil {
			return
		}
		out, err := svc.RecordPayment(req.Context(), httpx.TenantID(req.Context()), actorID(req), in.StudentID, in.Amount, in.Method)
		if err != nil {
			writeErr(w, err)
			return
		}
		httpx.JSON(w, http.StatusCreated, out)
	})

	r.With(payRecord).Post("/api/v1/finance/payments/{id}/void", func(w http.ResponseWriter, req *http.Request) {
		id, err := uuid.Parse(chi.URLParam(req, "id"))
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid payment id")
			return
		}
		if err := svc.VoidPayment(req.Context(), httpx.TenantID(req.Context()), actorID(req), id); err != nil {
			writeErr(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	r.With(feeManage).Get("/api/v1/finance/students/{id}/ledger", func(w http.ResponseWriter, req *http.Request) {
		id, err := uuid.Parse(chi.URLParam(req, "id"))
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid student id")
			return
		}
		led, err := svc.StudentLedger(req.Context(), httpx.TenantID(req.Context()), id)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		httpx.JSON(w, http.StatusOK, led)
	})
}

func decode(w http.ResponseWriter, req *http.Request, v any) error {
	if err := json.NewDecoder(req.Body).Decode(v); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
		return err
	}
	return nil
}

func actorID(req *http.Request) uuid.UUID {
	ident, ok := httpx.IdentityFrom(req.Context())
	if !ok {
		return uuid.Nil
	}
	tenantID := httpx.TenantID(req.Context())
	for _, m := range ident.Memberships {
		if m.TenantID == tenantID {
			return m.MembershipID
		}
	}
	return uuid.Nil
}

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		httpx.Error(w, http.StatusNotFound, "not found")
	case errors.Is(err, ErrInvalidInput):
		httpx.Error(w, http.StatusBadRequest, err.Error())
	default:
		httpx.Error(w, http.StatusInternalServerError, err.Error())
	}
}
