// Notices & Announcements (DESIGNED SCAFFOLD, no backend). Compose a notice targeting an
// audience and see the published list. Publishing is local until the communication slice
// ships its tables + endpoints.
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  Icon,
  PageHeader,
  Select,
  type Column,
} from '@/shared/ui';

interface Notice {
  id: string;
  title: string;
  audience: string;
  status: string;
  date: string;
}

const AUDIENCES = ['All', 'Students', 'Teachers', 'Staff', 'Guardians'];

const SEED: Notice[] = [
  { id: 'n1', title: 'Annual Sports Day — June 28', audience: 'All', status: 'Published', date: '2026-06-10' },
  { id: 'n2', title: 'Mid-term exam schedule released', audience: 'Students', status: 'Published', date: '2026-06-05' },
  { id: 'n3', title: 'Staff meeting — Friday 4pm', audience: 'Staff', status: 'Draft', date: '2026-06-12' },
];

export default function NoticesPage() {
  const [notices, setNotices] = useState<Notice[]>(SEED);
  const [title, setTitle] = useState('');
  const [audience, setAudience] = useState('All');
  const [body, setBody] = useState('');

  function publish(status: 'Published' | 'Draft') {
    if (!title.trim()) return;
    setNotices((prev) => [
      { id: `n-${Date.now()}`, title: title.trim(), audience, status, date: new Date().toISOString().slice(0, 10) },
      ...prev,
    ]);
    setTitle('');
    setBody('');
    setAudience('All');
  }

  const columns: Column<Notice>[] = [
    { header: 'Title', cell: (n) => <span style={{ fontWeight: 600 }}>{n.title}</span> },
    { header: 'Audience', cell: (n) => <Badge tone="info">{n.audience}</Badge> },
    {
      header: 'Status',
      cell: (n) => <Badge tone={n.status === 'Published' ? 'success' : 'neutral'}>{n.status}</Badge>,
    },
    { header: 'Date', align: 'right', cell: (n) => <span className="subtle">{n.date}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Notices & Announcements"
        subtitle="Broadcast notices to a chosen audience. Preview only — publishing is not yet wired to the backend."
      />

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Compose notice</h3>
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
            <Field label="Title">
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Notice headline" />
            </Field>
            <Field label="Audience">
              <Select value={audience} onChange={(e) => setAudience(e.target.value)}>
                {AUDIENCES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Message">
            <textarea
              className="input"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write the notice…"
              rows={4}
              style={{ resize: 'vertical' }}
            />
          </Field>
        </div>
        <div className="flex gap-8 mt-16">
          <Button disabled={!title.trim()} onClick={() => publish('Published')}>
            Publish
          </Button>
          <Button variant="ghost" disabled={!title.trim()} onClick={() => publish('Draft')}>
            Save draft
          </Button>
        </div>
      </Card>

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Published & drafts</h3>
        {notices.length === 0 ? (
          <EmptyState icon={<Icon name="bell" />} title="No notices yet" desc="Compose your first notice above." />
        ) : (
          <DataTable columns={columns} rows={notices} rowKey={(n) => n.id} />
        )}
      </Card>
    </div>
  );
}
