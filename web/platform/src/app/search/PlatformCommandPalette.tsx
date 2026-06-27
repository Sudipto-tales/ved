// PlatformCommandPalette — the control-plane app's command palette: gated platform
// pages + control-plane entity search, wired into the shared CommandPalette.
import { useNavigate } from 'react-router-dom';
import { CommandPalette, useCommandSearch } from '@/shared/ui';
import { usePlatformVisiblePages } from './usePlatformVisiblePages';
import { platformSearch } from './searchApi';

export function PlatformCommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const pages = usePlatformVisiblePages();
  const { query, setQuery, groups, loading, remember } = useCommandSearch({
    pages,
    searchFn: platformSearch,
    storageKey: 'ved.cmdk.platform',
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
      placeholder="Search schools, tenants, plans…"
      onSelect={(item) => {
        remember(item);
        onClose();
        navigate(item.url);
      }}
    />
  );
}
