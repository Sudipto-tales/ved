-- Migration #8 — Finance (M5). The append-only, event-sourced ledger
-- (docs/database/06-finance.md, docs/10-finance-payments.md). The two non-negotiables:
--   1. Money is append-only — never UPDATE/DELETE a payment, invoice, or ledger_entry;
--      corrections are REVERSAL rows that point at the original.
--   2. The student balance is a DERIVED ledger sum (Σ DEBIT − Σ CREDIT), never stored.
--
-- Immutability is enforced at the DB by the forbid_mutation() trigger (from #7), not just
-- the repository. Receipt numbers are GAPLESS per tenant (a missing number is an audit
-- flag), assigned from a per-tenant counter advanced inside the payment transaction.

-- +goose Up

-- Configuration (mutable): the fee catalog.
CREATE TABLE IF NOT EXISTS fee_head (
    id             uuid PRIMARY KEY,
    tenant_id      uuid NOT NULL,
    name           text NOT NULL,
    kind           text NOT NULL DEFAULT 'RECURRING'
                     CHECK (kind IN ('RECURRING','ONE_TIME','PENALTY','DEPOSIT','SALE')),
    refundable     boolean NOT NULL DEFAULT false,
    taxable        boolean NOT NULL DEFAULT false,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    deleted_at     timestamptz,
    hlc            text NOT NULL,
    version        bigint NOT NULL DEFAULT 1,
    origin_node_id uuid NOT NULL,
    CONSTRAINT fee_head_tenant_name_key UNIQUE (tenant_id, name)
);

-- Billing — invoice is an immutable demand document (status DERIVED on read, not edited).
CREATE TABLE IF NOT EXISTS invoice (
    id               uuid PRIMARY KEY,
    tenant_id        uuid NOT NULL,
    student_id       uuid NOT NULL REFERENCES student (id),
    academic_year_id uuid REFERENCES academic_year (id),
    period           text,
    status           text NOT NULL DEFAULT 'ISSUED'
                       CHECK (status IN ('DRAFT','ISSUED','PARTLY_PAID','PAID','OVERDUE','CANCELLED')),
    issued_at        timestamptz NOT NULL DEFAULT now(),
    due_date         date,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    hlc              text NOT NULL,
    origin_node_id   uuid NOT NULL
);
CREATE INDEX IF NOT EXISTS invoice_student_idx ON invoice (tenant_id, student_id);

CREATE TABLE IF NOT EXISTS invoice_line (
    id             uuid PRIMARY KEY,
    tenant_id      uuid NOT NULL,
    invoice_id     uuid NOT NULL REFERENCES invoice (id),
    fee_head_id    uuid REFERENCES fee_head (id),
    description    text,
    gross          numeric(12,2) NOT NULL DEFAULT 0,
    concession     numeric(12,2) NOT NULL DEFAULT 0,
    fine           numeric(12,2) NOT NULL DEFAULT 0,
    net            numeric(12,2) NOT NULL DEFAULT 0,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid,
    hlc            text NOT NULL,
    origin_node_id uuid NOT NULL
);
CREATE INDEX IF NOT EXISTS invoice_line_invoice_idx ON invoice_line (tenant_id, invoice_id);

-- Payments — immutable receipt record; gapless receipt_no per tenant.
CREATE TABLE IF NOT EXISTS payment (
    id             uuid PRIMARY KEY,
    tenant_id      uuid NOT NULL,
    student_id     uuid NOT NULL REFERENCES student (id),
    receipt_no     text NOT NULL,
    amount         numeric(12,2) NOT NULL,
    currency       text NOT NULL DEFAULT 'INR',
    method         text NOT NULL CHECK (method IN ('CASH','CHEQUE','CARD','UPI','ONLINE','OTHER')),
    paid_at        timestamptz NOT NULL DEFAULT now(),
    collected_by   uuid,
    status         text NOT NULL DEFAULT 'RECORDED'
                     CHECK (status IN ('RECORDED','CLEARED','BOUNCED','VOIDED')),
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid,
    hlc            text NOT NULL,
    origin_node_id uuid NOT NULL,
    CONSTRAINT payment_receipt_key UNIQUE (tenant_id, receipt_no)
);
CREATE INDEX IF NOT EXISTS payment_student_idx ON payment (tenant_id, student_id);

-- The ledger — append-only, event-sourced heart of the slice.
CREATE TABLE IF NOT EXISTS ledger_entry (
    id                uuid PRIMARY KEY,
    tenant_id         uuid NOT NULL,
    student_id        uuid NOT NULL REFERENCES student (id),
    direction         text NOT NULL CHECK (direction IN ('DEBIT','CREDIT')),
    fee_head_id       uuid REFERENCES fee_head (id),
    amount            numeric(12,2) NOT NULL,
    currency          text NOT NULL DEFAULT 'INR',
    source_type       text NOT NULL
                        CHECK (source_type IN ('INVOICE','PAYMENT','CONCESSION','FINE','REFUND',
                                               'REVERSAL','WRITE_OFF','OPENING_BALANCE')),
    source_id         uuid,
    reverses_entry_id uuid REFERENCES ledger_entry (id),
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    hlc               text NOT NULL,
    origin_node_id    uuid NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_entry_student_idx ON ledger_entry (tenant_id, student_id);

-- Gapless per-tenant counter (receipt numbers). Mutable; advanced inside the payment tx.
CREATE TABLE IF NOT EXISTS finance_counter (
    tenant_id uuid NOT NULL,
    name      text NOT NULL,
    value     bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, name)
);

-- ---- RLS ------------------------------------------------------------------------
-- +goose StatementBegin
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fee_head','invoice','invoice_line','payment','ledger_entry','finance_counter']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  END LOOP;
END $$;
-- +goose StatementEnd

-- ---- immutability triggers (money is append-only) -------------------------------
CREATE TRIGGER invoice_immutable      BEFORE UPDATE OR DELETE ON invoice      FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER invoice_line_immutable BEFORE UPDATE OR DELETE ON invoice_line FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER payment_immutable      BEFORE UPDATE OR DELETE ON payment      FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER ledger_entry_immutable BEFORE UPDATE OR DELETE ON ledger_entry FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- +goose Down
DROP TABLE IF EXISTS finance_counter;
DROP TABLE IF EXISTS ledger_entry;
DROP TABLE IF EXISTS payment;
DROP TABLE IF EXISTS invoice_line;
DROP TABLE IF EXISTS invoice;
DROP TABLE IF EXISTS fee_head;
