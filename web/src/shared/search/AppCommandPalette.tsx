// AppCommandPalette — the tenant app's command palette: wires the gated page index +
// the tenant entity search into the shared CommandPalette, and navigates on select.
import { useNavigate } from 'react-router-dom';
import { CommandPalette, useCommandSearch } from '@/shared/ui';
import { useVisiblePages } from './useVisiblePages';
import { tenantSearch } from './searchApi';

export function AppCommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const pages = useVisiblePages();
  const { query, setQuery, groups, loading, remember } = useCommandSearch({
    pages,
    searchFn: tenantSearch,
    storageKey: 'ved.cmdk.tenant',
    open,
  });

  return (
    <CommandPalette
      open={open}
      onClose={onClose}
      query={query}
      onQueryChange={setQuery}
      groups={groups}
      loading={loading}
      placeholder="Search students, teachers, pages…"
      onSelect={(item) => {
        remember(item);
        onClose();
        navigate(item.url);
      }}
    />
  );
}
