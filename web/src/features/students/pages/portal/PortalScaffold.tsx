// Shared scaffold for the STUDENT self-service portal pages. These are identity-scoped
// views (no permission gate) — the student sees only their own data. The "my-data"
// backend endpoints do not exist yet, so each page is a polished placeholder: real layout
// + an EmptyState describing exactly what will appear once the slice is wired.
import type { ReactNode } from 'react';
import { Card, EmptyState, Icon, PageHeader, type IconName } from '@/shared/ui';

// A single "coming soon" section panel with the real header it will keep.
export function ComingSoonCard({
  icon,
  title,
  desc,
}: {
  icon: IconName;
  title: string;
  desc: string;
}) {
  return (
    <Card className="mt-16">
      <EmptyState icon={<Icon name={icon} size={28} />} title={title} desc={desc} />
    </Card>
  );
}

// A portal page shell: header + (optional) intro children + a coming-soon body.
export function PortalPage({
  title,
  subtitle,
  icon,
  comingTitle,
  comingDesc,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: IconName;
  comingTitle: string;
  comingDesc: string;
  children?: ReactNode;
}) {
  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader title={title} subtitle={subtitle} />
      {children}
      <ComingSoonCard icon={icon} title={comingTitle} desc={comingDesc} />
    </div>
  );
}
