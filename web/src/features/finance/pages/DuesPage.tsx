// Dues & Aging (M5) — who owes money. We fetch students, then their derived ledger
// outstanding (Σ debit − Σ credit) in parallel, and surface those with a positive
// balance. Capped at the first N students to keep the fan-out reasonable.
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { Card, DataTable, Icon, PageHeader, Spinner, StatCard, type Column } from '@/shared/ui';
import { api } from '@/shared/api/client';
import { useStudents } from '@/features/students/api/studentsApi';
import { financeKeys, type Ledger } from '../api/financeApi';

const MAX_STUDENTS = 50;

function inr(n: number) {
  return `₹${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface DueRow {
  studentId: string;
  name: string;
  admissionNo: string;
  outstanding: number;
}

export default function DuesPage() {
  const navigate = useNavigate();
  const { data: studentsData, isLoading: loadingStudents } = useStudents();

  const students = useMemo(
    () => (studentsData?.students ?? []).slice(0, MAX_STUDENTS),
    [studentsData],
  );

  const ledgerQueries = useQueries({
    queries: students.map((s) => ({
      queryKey: financeKeys.ledger(s.id),
      queryFn: () => api.get<Ledger>(`/api/v1/finance/students/${s.id}/ledger`),
    })),
  });

  const loadingLedgers = ledgerQueries.some((q) => q.isLoading);

  const dues: DueRow[] = useMemo(() => {
    const rows: DueRow[] = [];
    students.forEach((s, i) => {
      const out = ledgerQueries[i]?.data?.outstanding ?? 0;
      if (out > 0) rows.push({ studentId: s.id, name: s.name, admissionNo: s.admission_no, outstanding: out });
    });
    return rows.sort((a, b) => b.outstanding - a.outstanding);
  }, [students, ledgerQueries]);

  const totalDue = dues.reduce((sum, d) => sum + d.outstanding, 0);

  const columns: Column<DueRow>[] = [
    { header: 'Student', cell: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { header: 'Admission #', cell: (r) => <span className="muted">{r.admissionNo}</span> },
    { header: 'Outstanding', align: 'right', cell: (r) => <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{inr(r.outstanding)}</span> },
    {
      header: '',
      align: 'right',
      cell: (r) => (
        <span className="flex gap-8" style={{ justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="icon-btn"
            title="View ledger"
            aria-label="View ledger"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/ledger/${r.studentId}`);
            }}
          >
            <Icon name="eye" />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Record payment"
            aria-label="Record payment"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/ledger/${r.studentId}`);
            }}
          >
            <Icon name="wallet" />
          </button>
        </span>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 900 }}>
      <PageHeader title="Dues & Aging" subtitle={`Students carrying a positive derived balance (top ${MAX_STUDENTS}). Click through to collect.`} />

      <div className="grid-stats mt-16">
        <StatCard label="Students with dues" value={dues.length} accent />
        <StatCard label="Total outstanding" value={loadingLedgers ? <Spinner /> : inr(totalDue)} />
        <StatCard label="Largest balance" value={inr(dues[0]?.outstanding ?? 0)} />
      </div>

      <Card className="mt-16">
        <DataTable<DueRow>
          loading={loadingStudents || loadingLedgers}
          rows={dues}
          rowKey={(r) => r.studentId}
          empty="No outstanding dues. Everyone's settled up."
          onRowClick={(r) => navigate(`/ledger/${r.studentId}`)}
          searchable
          searchText={(r) => `${r.name} ${r.admissionNo} ${inr(r.outstanding)} ${r.outstanding}`}
          columns={columns}
        />
      </Card>
    </div>
  );
}
