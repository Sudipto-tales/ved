// Backup & Restore (DESIGNED SCAFFOLD, gated tenant.settings). Per-tenant backups are a
// product invariant (schools must recover data). This previews the backup list and the
// restore flow with clear danger styling. Actions are inert until the backup service ships.
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  DataTable,
  Icon,
  PageHeader,
  type Column,
} from '@/shared/ui';

interface Backup {
  id: string;
  takenAt: string;
  size: string;
  kind: 'Automatic' | 'Manual';
}

const BACKUPS: Backup[] = [
  { id: 'b1', takenAt: '2026-06-15 02:00', size: '184 MB', kind: 'Automatic' },
  { id: 'b2', takenAt: '2026-06-14 02:00', size: '182 MB', kind: 'Automatic' },
  { id: 'b3', takenAt: '2026-06-13 16:40', size: '181 MB', kind: 'Manual' },
  { id: 'b4', takenAt: '2026-06-13 02:00', size: '180 MB', kind: 'Automatic' },
];

export default function BackupRestorePage() {
  const [confirmRestore, setConfirmRestore] = useState<Backup | null>(null);

  const columns: Column<Backup>[] = [
    { header: 'Taken at', cell: (b) => <span style={{ fontWeight: 600 }}>{b.takenAt}</span> },
    { header: 'Size', cell: (b) => <span className="subtle">{b.size}</span> },
    { header: 'Type', cell: (b) => <Badge tone={b.kind === 'Manual' ? 'info' : 'neutral'}>{b.kind}</Badge> },
    {
      header: '',
      align: 'right',
      cell: (b) => (
        <div className="flex gap-8" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" disabled>
            Download
          </Button>
          <Button variant="ghost" onClick={() => setConfirmRestore(b)}>
            Restore
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Backup & Restore"
        subtitle="Per-tenant snapshots for disaster recovery. Preview only — backup operations are not yet wired."
      />

      <Card className="mt-16">
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: 15 }}>Automatic backups</h3>
            <p className="subtle" style={{ fontSize: 13, marginTop: 4 }}>
              Daily at 02:00, retained for 30 days.
            </p>
          </div>
          <Button variant="secondary" disabled>
            Back up now
          </Button>
        </div>
      </Card>

      <Card className="mt-16">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Snapshots</h3>
        <DataTable columns={columns} rows={BACKUPS} rowKey={(b) => b.id} />
      </Card>

      <Card className="mt-16" style={{ borderLeft: '3px solid var(--danger)' }}>
        <div className="flex gap-8" style={{ alignItems: 'flex-start' }}>
          <span style={{ color: 'var(--danger)' }}>
            <Icon name="shield" />
          </span>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 15, color: 'var(--danger)' }}>Danger zone — Restore</h3>
            <p className="subtle" style={{ fontSize: 13, marginTop: 4 }}>
              Restoring overwrites all current data for this institution with the selected snapshot. This cannot be undone.
            </p>
            {confirmRestore ? (
              <div className="mt-16">
                <p style={{ fontSize: 13 }}>
                  Restore from <strong>{confirmRestore.takenAt}</strong>? All data after this point will be lost.
                </p>
                <div className="flex gap-8 mt-16">
                  <Button
                    className="btn-danger"
                    style={{ background: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff' }}
                    disabled
                  >
                    Confirm restore
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmRestore(null)}>
                    Cancel
                  </Button>
                </div>
                <p className="subtle" style={{ fontSize: 12, marginTop: 8 }}>
                  Disabled — wiring the restore service is part of the backup slice.
                </p>
              </div>
            ) : (
              <p className="subtle mt-16" style={{ fontSize: 13 }}>
                Choose a snapshot above and click Restore to begin.
              </p>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
