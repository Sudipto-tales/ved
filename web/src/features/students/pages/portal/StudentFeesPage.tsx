// STUDENT portal — My fees / dues (DESIGNED SCAFFOLD). Identity-scoped. Keeps a summary
// StatCard row the live view will fill, plus a placeholder ledger.
import { StatCard } from '@/shared/ui';
import { PortalPage } from './PortalScaffold';

export default function StudentFeesPage() {
  return (
    <PortalPage
      title="My fees"
      subtitle="Your fee schedule, payments, and outstanding dues."
      icon="wallet"
      comingTitle="Fees and dues are coming soon"
      comingDesc="When the finance slice is wired, you'll see your invoices, payment history, and any outstanding dues here — with online payment where enabled."
    >
      <div className="grid-stats mt-16">
        <StatCard label="Total billed" value={<span className="muted">—</span>} />
        <StatCard label="Paid" value={<span className="muted">—</span>} />
        <StatCard label="Outstanding" value={<span className="muted">—</span>} />
      </div>
    </PortalPage>
  );
}
