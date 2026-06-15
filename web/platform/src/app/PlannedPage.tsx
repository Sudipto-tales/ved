// Placeholder for platform pages not built yet (reuses the tenant design kit).
import { Badge, PageHeader } from '@/shared/ui';
import type { PageDef } from '@/shared/types/page';

const TONE = { T1: 'primary', T2: 'neutral', T3: 'warning' } as const;

export function PlannedPage({ page }: { page: PageDef }) {
  return (
    <div style={{ maxWidth: 680 }}>
      <PageHeader title={page.title} subtitle="Platform · planned" />
      <div className="empty">
        <div className="flex gap-8">
          <Badge tone={TONE[page.tier]}>{page.tier}</Badge>
          <span>This control-plane page is scaffolded but not built yet.</span>
        </div>
        <ul>
          <li>Route: <span className="kbd">/{page.path}</span></li>
          <li>Permission: <span className="kbd">{page.permission ?? '—'}</span></li>
        </ul>
      </div>
    </div>
  );
}
