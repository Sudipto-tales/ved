// useGlobalHotkey — opens the command palette on ⌘K / Ctrl-K from anywhere.
// Ignores the combo while typing in an input/textarea unless the palette owns focus.
import { useEffect } from 'react';

export function useCommandHotkey(onOpen: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpen]);
}
