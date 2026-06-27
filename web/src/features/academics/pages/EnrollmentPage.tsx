// Enrollment — pick a section, view its roster. (Enrolling happens on the section detail
// page; this is the cross-section lookup view.)
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, DataTable, EmptyState, Field, Icon, PageHeader, Select } from '@/shared/ui';
import { useEnrollments, useSections, type Enrollment } from '../api/academicsApi';

export default function EnrollmentPage() {
  const { data: sectionsData } = useSections();
  const [sectionId, setSectionId] = useState('');
  const section = sectionsData?.sections.find((s) => s.id === sectionId);
  const { data, isLoading, error } = useEnrollments(sectionId);
  const rows = data?.enrollments ?? [];

  return (
    <div style={{ maxWidth: 880 }}>
      <PageHeader title="Enrollment" subtitle="Look up a section's roster. Manage enrollments from the section's detail page." />

      <Card className="mt-16">
        <Field label="Section">
          <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">Select a section…</option>
            {(sectionsData?.sections ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.program_name} — {s.stage_name} {s.name}</option>
            ))}
          </Select>
        </Field>
      </Card>

      {!sectionId && (
        <Card className="mt-16"><EmptyState icon={<Icon name="grid" />} title="Pick a section" desc="Select a section above to view its roster." /></Card>
      )}

      {sectionId && (
        <Card className="mt-16">
          {section && (
            <div className="between" style={{ marginBottom: 12 }}>
              <span className="muted">{rows.length} enrolled</span>
              <Link to={`/sections/${sectionId}`}><Button variant="secondary">Manage section</Button></Link>
            </div>
          )}
          {error && <p style={{ color: 'var(--danger)' }}>Failed to load: {String(error)}</p>}
          <DataTable<Enrollment>
            loading={isLoading}
            rows={rows}
            rowKey={(r) => r.id}
            searchable
            searchText={(r) => `${r.login_identifier} ${r.roll_no ?? ''} ${section?.name ?? ''} ${section?.stage_name ?? ''}`}
            empty={<EmptyState icon={<Icon name="users" />} title="No students enrolled" desc="This section has no enrollments yet." />}
            columns={[
              { header: 'Roll', cell: (r) => <span className="subtle">{r.roll_no ?? '—'}</span>, width: 80 },
              { header: 'Login', cell: (r) => <span style={{ fontWeight: 600 }}>{r.login_identifier}</span> },
              { header: 'Status', cell: (r) => <Badge tone={r.status === 'ACTIVE' ? 'success' : 'neutral'}>{r.status}</Badge> },
              {
                header: '',
                align: 'right',
                cell: () => (
                  <span className="flex gap-8" style={{ justifyContent: 'flex-end' }}>
                    <Link to={`/sections/${sectionId}`} title="View section" aria-label="View section" className="icon-btn" onClick={(e) => e.stopPropagation()}><Icon name="eye" /></Link>
                  </span>
                ),
              },
            ]}
          />
        </Card>
      )}
    </div>
  );
}
