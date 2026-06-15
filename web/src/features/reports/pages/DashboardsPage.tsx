// Role-Based Dashboards (DESIGNED SCAFFOLD — illustrative KPIs). A premium overview built
// from the design-system StatCard (with Sparkline + GrowthDelta) plus supporting tables.
// The numbers are illustrative until the reports aggregation endpoints land.
import {
  Badge,
  Card,
  DataTable,
  HeroBanner,
  PageHeader,
  StatCard,
  type Column,
} from '@/shared/ui';

interface CollectionRow {
  head: string;
  billed: string;
  collected: string;
  rate: string;
}

const COLLECTIONS: CollectionRow[] = [
  { head: 'Tuition', billed: '₹ 42,00,000', collected: '₹ 38,80,000', rate: '92%' },
  { head: 'Transport', billed: '₹ 6,40,000', collected: '₹ 5,10,000', rate: '80%' },
  { head: 'Hostel', billed: '₹ 9,20,000', collected: '₹ 8,95,000', rate: '97%' },
  { head: 'Lab & Misc', billed: '₹ 2,10,000', collected: '₹ 1,60,000', rate: '76%' },
];

interface AdmissionRow {
  stage: string;
  capacity: number;
  enrolled: number;
}

const ADMISSIONS: AdmissionRow[] = [
  { stage: 'Primary', capacity: 480, enrolled: 442 },
  { stage: 'Middle', capacity: 360, enrolled: 351 },
  { stage: 'Secondary', capacity: 320, enrolled: 298 },
  { stage: 'Senior Secondary', capacity: 240, enrolled: 205 },
];

export default function DashboardsPage() {
  const collectionColumns: Column<CollectionRow>[] = [
    { header: 'Fee head', cell: (r) => <span style={{ fontWeight: 600 }}>{r.head}</span> },
    { header: 'Billed', align: 'right', cell: (r) => r.billed },
    { header: 'Collected', align: 'right', cell: (r) => r.collected },
    {
      header: 'Rate',
      align: 'right',
      cell: (r) => (
        <Badge tone={Number(r.rate.replace('%', '')) >= 90 ? 'success' : Number(r.rate.replace('%', '')) >= 80 ? 'info' : 'warning'}>
          {r.rate}
        </Badge>
      ),
    },
  ];

  const admissionColumns: Column<AdmissionRow>[] = [
    { header: 'Stage', cell: (r) => <span style={{ fontWeight: 600 }}>{r.stage}</span> },
    { header: 'Capacity', align: 'right', cell: (r) => r.capacity },
    { header: 'Enrolled', align: 'right', cell: (r) => r.enrolled },
    {
      header: 'Fill',
      align: 'right',
      cell: (r) => <span className="subtle">{Math.round((r.enrolled / r.capacity) * 100)}%</span>,
    },
  ];

  return (
    <div style={{ maxWidth: 1100 }}>
      <PageHeader
        title="Dashboard"
        subtitle="A snapshot of the institution. Illustrative figures — live aggregation lands with the reports slice."
      />

      <div className="mt-16">
        <HeroBanner
          tag="Academic year 2026-27"
          title="Good afternoon"
          subtitle="Enrolment is up and fee collection is tracking ahead of last term."
        />
      </div>

      <div className="mt-16" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <StatCard
          label="Students"
          value="1,296"
          accent
          spark={{ data: [18, 22, 20, 26, 30, 28, 34], tone: 'primary' }}
          delta={{ value: '2.6%', dir: 'up', ctx: 'vs last term' }}
        />
        <StatCard
          label="Attendance today"
          value="94.2%"
          spark={{ data: [90, 92, 91, 95, 94, 96, 94], tone: 'info' }}
          delta={{ value: '0.8%', dir: 'up', ctx: 'vs yesterday' }}
        />
        <StatCard
          label="Fees collected (MTD)"
          value="₹ 54.4L"
          spark={{ data: [10, 14, 18, 22, 30, 40, 54], tone: 'primary' }}
          delta={{ value: '11%', dir: 'up', ctx: 'vs last month' }}
        />
        <StatCard
          label="Outstanding"
          value="₹ 8.1L"
          spark={{ data: [14, 12, 13, 11, 10, 9, 8], tone: 'danger' }}
          delta={{ value: '6%', dir: 'down', ctx: 'vs last month' }}
        />
      </div>

      <div className="mt-16" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <Card>
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Fee collection by head</h3>
          <DataTable columns={collectionColumns} rows={COLLECTIONS} rowKey={(r) => r.head} />
        </Card>
        <Card>
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Enrolment by stage</h3>
          <DataTable columns={admissionColumns} rows={ADMISSIONS} rowKey={(r) => r.stage} />
        </Card>
      </div>
    </div>
  );
}
