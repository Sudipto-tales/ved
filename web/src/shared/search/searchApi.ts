// Tenant entity search — calls the permission-scoped backend endpoint and maps hits to
// CommandItems. The backend decides which entity types the caller may see; the client
// just renders what comes back. Fails soft (returns []) so page-nav still works offline
// or on error.
import { api } from '@/shared/api/client';
import type { IconName } from '@/shared/ui';
import type { CommandItem, SearchFn } from './command';

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

// type → palette section heading + icon.
const TYPE_META: Record<string, { label: string; icon: IconName }> = {
  student: { label: 'Students', icon: 'users' },
  teacher: { label: 'Teachers', icon: 'graduation' },
  staff: { label: 'Staff', icon: 'users' },
  guardian: { label: 'Guardians', icon: 'shield' },
};

export const tenantSearch: SearchFn = async (query): Promise<CommandItem[]> => {
  try {
    const res = await api.get<SearchResponse>(`/api/v1/search?q=${encodeURIComponent(query)}`);
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
