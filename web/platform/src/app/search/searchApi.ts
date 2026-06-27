// Platform entity search — calls the permission-scoped control-plane endpoint and maps
// hits to CommandItems. The backend gates which entity types the superadmin may see.
// Fails soft (returns []) so page-nav still works on error.
import type { IconName } from '@/shared/ui';
import type { CommandItem, SearchFn } from '@/shared/search/command';
import { api } from '../../shared/api';

interface SearchHit {
  type: string;
  id: string;
  label: string;
  sublabel: string;
  url: string;
  score: number;
}
interface SearchResponse {
  query: string;
  groups: Record<string, SearchHit[]>;
}

const TYPE_META: Record<string, { label: string; icon: IconName }> = {
  registration: { label: 'Registrations', icon: 'user-plus' },
  tenant: { label: 'Tenants', icon: 'building' },
  subscription: { label: 'Subscriptions', icon: 'layers' },
  plan: { label: 'Plans', icon: 'note' },
  license: { label: 'Licenses', icon: 'shield' },
};

export const platformSearch: SearchFn = async (query): Promise<CommandItem[]> => {
  try {
    const res = await api.get<SearchResponse>(`/api/v1/platform/search?q=${encodeURIComponent(query)}`);
    const items: CommandItem[] = [];
    for (const [type, hits] of Object.entries(res.groups ?? {})) {
      const meta = TYPE_META[type] ?? { label: type, icon: 'grid' as IconName };
      for (const h of hits) {
        items.push({
          id: `${h.type}:${h.id}`,
          type: h.type,
          label: h.label || '(unnamed)',
          sublabel: h.sublabel,
          url: h.url,
          group: meta.label,
          icon: meta.icon,
        });
      }
    }
    return items;
  } catch {
    return [];
  }
};
