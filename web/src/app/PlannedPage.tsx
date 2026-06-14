// Placeholder for any PageDef not built yet. Because routing is manifest-driven, this
// single styled component gives EVERY planned page the design-system look today, and
// shows exactly what each route will become.
import { Badge, PageHeader } from '@/shared/ui';
import type { PageDef } from '@/shared/types/page';
import { topicForPath } from '@/features/help/content';

const TONE = { T1: 'primary', T2: 'neutral', T3: 'warning' } as const;

export function PlannedPage({ page }: { page: PageDef }) {
  return (
    <div style={{ maxWidth: 680 }}>
      <PageHeader title={page.title} subtitle={`${page.persona} · planned`} help={topicForPath(page.path)} />
      <div className="empty">
        <div className="flex gap-8">
          <Badge tone={TONE[page.tier]}>{page.tier}</Badge>
          <span>This page is scaffolded but not built yet.</span>
        </div>
        <ul>
          <li>Route: <span className="kbd">/{page.path}</span></li>
          <li>Persona: <span className="kbd">{page.persona}</span></li>
          <li>Permission: <span className="kbd">{page.permission ?? '— (identity-scoped)'}</span></li>
        </ul>
      </div>
    </div>
  );
}
