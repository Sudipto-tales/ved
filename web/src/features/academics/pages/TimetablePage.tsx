// Timetable — a DESIGNED SCAFFOLD. The timetable_slot table does not exist yet, so this
// renders a polished weekly-grid placeholder + an EmptyState explaining it's coming. No
// backend calls. When the slot table lands, the grid cells fill from teaching assignments.
import { Badge, Card, EmptyState, Icon, PageHeader } from '@/shared/ui';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PERIODS = ['08:00', '09:00', '10:00', '11:00', '12:00', '14:00', '15:00'];

export default function TimetablePage() {
  return (
    <div style={{ maxWidth: 1040 }}>
      <PageHeader title="Timetable" subtitle="Weekly schedule of section × subject × teacher slots." />

      <div className="row mt-16">
        <Badge tone="warning">Coming soon</Badge>
        <span className="subtle" style={{ marginLeft: 8 }}>Preview of the weekly grid — not yet wired to data.</span>
      </div>

      <Card className="mt-16" style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 80 }}>Time</th>
              {DAYS.map((d) => <th key={d}>{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((p) => (
              <tr key={p}>
                <td className="subtle" style={{ fontVariantNumeric: 'tabular-nums' }}>{p}</td>
                {DAYS.map((d) => (
                  <td key={d}>
                    <div
                      aria-hidden
                      style={{
                        height: 34,
                        borderRadius: 8,
                        border: '1px dashed var(--border)',
                        background: 'var(--surface-2, transparent)',
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="mt-16">
        <EmptyState
          icon={<Icon name="grid" />}
          title="Timetable is on the way"
          desc="Once the timetable_slot table ships, this grid will fill from your teaching assignments — drag a section + subject + teacher onto a slot and it's scheduled."
        />
      </Card>
    </div>
  );
}
