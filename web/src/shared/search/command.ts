// Shared command-palette types. Used by BOTH the tenant app and the platform app
// (the platform build aliases @ → web/src, so this module is importable from both).
import type { IconName } from '@/shared/ui';

// CommandItem is one selectable row — a page to navigate to, or an entity record hit.
export interface CommandItem {
  id: string; // stable key within a render (e.g. "page:students" or "student:<uuid>")
  type: string; // 'page' | 'student' | 'teacher' | 'tenant' | …
  label: string; // primary line
  sublabel?: string; // secondary line
  url: string; // route to navigate to on select
  group: string; // section heading the item belongs to ("Pages", "Students", …)
  icon?: IconName;
}

// CommandGroup is a labelled section of items, rendered in order.
export interface CommandGroup {
  group: string;
  items: CommandItem[];
}

// SearchFn runs the backend entity search for a query and maps hits to CommandItems
// (with their group + icon already set). Returns [] on error so page-nav still works.
export type SearchFn = (query: string) => Promise<CommandItem[]>;

// Flatten groups into the keyboard-navigable item order.
export function flattenGroups(groups: CommandGroup[]): CommandItem[] {
  return groups.flatMap((g) => g.items);
}

// groupItems buckets a flat item list into ordered groups (first-seen order).
export function groupItems(items: CommandItem[]): CommandGroup[] {
  const order: string[] = [];
  const map = new Map<string, CommandItem[]>();
  for (const it of items) {
    if (!map.has(it.group)) {
      map.set(it.group, []);
      order.push(it.group);
    }
    map.get(it.group)!.push(it);
  }
  return order.map((g) => ({ group: g, items: map.get(g)! }));
}
