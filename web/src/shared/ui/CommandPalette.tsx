// CommandPalette — the presentational overlay for global search, shared by both apps.
// It owns NO data: query/groups/loading and the select/close handlers are props, so it
// is router-instance-agnostic (navigation happens in the caller's onSelect). Keyboard:
// ↑/↓ move the active row across all groups, Enter selects it, Esc closes.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { Icon } from './Icon';
import { type CommandGroup, type CommandItem, flattenGroups } from '@/shared/search/command';

export function CommandPalette({
  open,
  onClose,
  query,
  onQueryChange,
  groups,
  loading,
  onSelect,
  placeholder = 'Search…',
  emptyHint = 'Type to search pages and records.',
}: {
  open: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  groups: CommandGroup[];
  loading?: boolean;
  onSelect: (item: CommandItem) => void;
  placeholder?: string;
  emptyHint?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(0);
  const flat = useMemo(() => flattenGroups(groups), [groups]);

  // Focus the input when opened; reset the active row when results change.
  useEffect(() => {
    if (open) {
      setActive(0);
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);
  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  const move = (delta: number) => {
    if (flat.length === 0) return;
    setActive((i) => (i + delta + flat.length) % flat.length);
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flat[active];
      if (item) onSelect(item);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let flatIndex = -1;

  return (
    <div className="cmdk-backdrop" onMouseDown={onClose} role="presentation">
      <div
        className="cmdk-panel"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
      >
        <div className="cmdk-input-row">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            className="cmdk-input"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label="Search"
            autoComplete="off"
            spellCheck={false}
          />
          {loading && <span className="spinner" role="status" aria-label="loading" />}
          <span className="kbd">Esc</span>
        </div>

        <div className="cmdk-results">
          {flat.length === 0 && (
            <div className="cmdk-empty">{query.trim() ? `No matches for “${query.trim()}”.` : emptyHint}</div>
          )}
          {groups.map((g) => (
            <div className="cmdk-group" key={g.group}>
              <div className="cmdk-group-label">{g.group}</div>
              {g.items.map((item) => {
                flatIndex += 1;
                const isActive = flatIndex === active;
                const idx = flatIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`cmdk-item${isActive ? ' active' : ''}`}
                    onMouseMove={() => setActive(idx)}
                    onClick={() => onSelect(item)}
                  >
                    {item.icon && <Icon name={item.icon} className="cmdk-item-icon" />}
                    <span className="cmdk-item-label">{item.label}</span>
                    {item.sublabel && <span className="cmdk-item-sub">{item.sublabel}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="cmdk-footer">
          <span><span className="kbd">↑↓</span> to navigate</span>
          <span><span className="kbd">↵</span> to open</span>
        </div>
      </div>
    </div>
  );
}
