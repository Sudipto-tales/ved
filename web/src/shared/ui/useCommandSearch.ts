// useCommandSearch — the data glue behind the command palette, shared by both apps.
//
//  • Filters the (already permission-gated) page list synchronously as the user types.
//  • Runs the backend entity search debounced (250ms, min 2 chars) via TanStack Query,
//    keeping previous results visible while the next query is in flight (no flicker).
//  • Tracks recent selections in localStorage; they are the empty-query state.
//
// It is presentation-free: it returns groups + state, the palette renders them.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { type CommandGroup, type CommandItem, type SearchFn, groupItems } from '@/shared/search/command';

const DEBOUNCE_MS = 250;
const MIN_QUERY = 2;
const MAX_PAGES = 6;
const MAX_RECENT = 6;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function loadRecent(key: string): CommandItem[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as CommandItem[]) : [];
  } catch {
    return [];
  }
}

export interface UseCommandSearch {
  query: string;
  setQuery: (q: string) => void;
  groups: CommandGroup[];
  loading: boolean;
  /** Record a selection as a recent item (call from the palette's onSelect). */
  remember: (item: CommandItem) => void;
}

export function useCommandSearch(opts: {
  /** Permission-gated page items (built by the per-app adapter). */
  pages: CommandItem[];
  /** Backend entity search for this app (tenant or platform). */
  searchFn: SearchFn;
  /** localStorage namespace for recents (distinct per app). */
  storageKey: string;
  /** Whether the palette is open (gates the network query). */
  open: boolean;
}): UseCommandSearch {
  const { pages, searchFn, storageKey, open } = opts;
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim(), DEBOUNCE_MS);
  const recentKey = `${storageKey}.recent`;

  const [recent, setRecent] = useState<CommandItem[]>(() => loadRecent(recentKey));

  // Reset the query each time the palette is opened.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) setQuery('');
    wasOpen.current = open;
  }, [open]);

  // Synchronous page filter.
  const pageMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return pages
      .filter((p) => p.label.toLowerCase().includes(q) || p.url.toLowerCase().includes(q))
      .slice(0, MAX_PAGES);
  }, [pages, query]);

  // Debounced backend entity search.
  const entityQ = useQuery({
    queryKey: ['cmdk', storageKey, debounced],
    queryFn: () => searchFn(debounced),
    enabled: open && debounced.length >= MIN_QUERY,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
  const entityItems = open && debounced.length >= MIN_QUERY ? entityQ.data ?? [] : [];

  const remember = useCallback(
    (item: CommandItem) => {
      setRecent((prev) => {
        const next = [item, ...prev.filter((p) => p.id !== item.id)].slice(0, MAX_RECENT);
        try {
          localStorage.setItem(recentKey, JSON.stringify(next));
        } catch {
          /* ignore quota errors */
        }
        return next;
      });
    },
    [recentKey],
  );

  const groups = useMemo<CommandGroup[]>(() => {
    if (!query.trim()) {
      return recent.length ? [{ group: 'Recent', items: recent }] : [];
    }
    return groupItems([...pageMatches, ...entityItems]);
  }, [query, recent, pageMatches, entityItems]);

  return {
    query,
    setQuery,
    groups,
    loading: open && debounced.length >= MIN_QUERY && entityQ.isFetching,
    remember,
  };
}
