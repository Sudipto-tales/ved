// Notification Center (DESIGNED SCAFFOLD, no backend). A log of system + delivered
// notifications across channels, with a channel filter. Data is illustrative until the
// communication slice ships.
import { useMemo, useState } from 'react';
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  Field,
  Icon,
  PageHeader,
  Select,
  StatCard,
  Toolbar,
  type Column,
} from '@/shared/ui';

interface Notification {
  id: string;
  channel: 'Email' | 'SMS' | 'In-app' | 'Push';
  subject: string;
  recipients: number;
  status: 'Delivered' | 'Queued' | 'Failed';
  sentAt: string;
}

const SEED: Notification[] = [
  { id: 'm1', channel: 'Email', subject: 'Fee reminder — June', recipients: 312, status: 'Delivered', sentAt: '2026-06-14 09:10' },
  { id: 'm2', channel: 'SMS', subject: 'School closed tomorrow', recipients: 540, status: 'Delivered', sentAt: '2026-06-13 18:02' },
  { id: 'm3', channel: 'In-app', subject: 'New assignment posted', recipients: 48, status: 'Delivered', sentAt: '2026-06-13 11:30' },
  { id: 'm4', channel: 'Push', subject: 'Result published', recipients: 290, status: 'Queued', sentAt: '2026-06-15 08:00' },
  { id: 'm5', channel: 'SMS', subject: 'Bus route change', recipients: 75, status: 'Failed', sentAt: '2026-06-12 07:45' },
];

const CHANNELS = ['All', 'Email', 'SMS', 'In-app', 'Push'];

function tone(status: Notification['status']): 'success' | 'warning' | 'neutral' {
  if (status === 'Delivered') return 'success';
  if (status === 'Queued') return 'warning';
  return 'neutral';
}

export default function NotificationsPage() {
  const [channel, setChannel] = useState('All');

  const rows = useMemo(
    () => (channel === 'All' ? SEED : SEED.filter((n) => n.channel === channel)),
    [channel],
  );

  const delivered = SEED.filter((n) => n.status === 'Delivered').length;
  const queued = SEED.filter((n) => n.status === 'Queued').length;
  const failed = SEED.filter((n) => n.status === 'Failed').length;

  const columns: Column<Notification>[] = [
    { header: 'Channel', cell: (n) => <Badge tone="neutral">{n.channel}</Badge> },
    { header: 'Subject', cell: (n) => <span style={{ fontWeight: 600 }}>{n.subject}</span> },
    { header: 'Recipients', align: 'right', cell: (n) => n.recipients },
    { header: 'Status', cell: (n) => <Badge tone={tone(n.status)}>{n.status}</Badge> },
    { header: 'Sent', align: 'right', cell: (n) => <span className="subtle">{n.sentAt}</span> },
  ];

  return (
    <div style={{ maxWidth: 920 }}>
      <PageHeader
        title="Notification Center"
        subtitle="A log of notifications sent across channels. Illustrative data — the delivery pipeline is not yet wired."
      />

      <div className="mt-16" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <StatCard label="Delivered" value={delivered} accent />
        <StatCard label="Queued" value={queued} />
        <StatCard label="Failed" value={failed} />
      </div>

      <Card className="mt-16">
        <Toolbar>
          <Field label="Channel">
            <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </Toolbar>
        {rows.length === 0 ? (
          <EmptyState icon={<Icon name="bell" />} title="No notifications" desc="Nothing on this channel yet." />
        ) : (
          <DataTable columns={columns} rows={rows} rowKey={(n) => n.id} />
        )}
      </Card>
    </div>
  );
}
