import { useMemo } from 'react';
import SearchBar from '../docs/SearchBar';
import { findPartByTerm, formatTerm, partSearchTerms } from '../../lib/viewer/catalog';
import type { Part, PartsCatalog } from '../../lib/viewer/types';

interface Props {
  catalog: PartsCatalog;
  active: Part | null;
  onPick: (part: Part) => void;
  onClear: () => void;
  onQueryChange?: (q: string) => void;
  autoFocus?: boolean;
  size?: 'md' | 'lg';
}

export default function PartSearchBar({
  catalog,
  active,
  onPick,
  onClear,
  onQueryChange,
  autoFocus,
  size = 'md',
}: Props) {
  const terms = useMemo(() => partSearchTerms(catalog), [catalog]);
  const value = active ? formatTerm(active) : '';

  return (
    <SearchBar
      terms={terms}
      value={value}
      onPick={(term) => {
        const p = findPartByTerm(catalog, term);
        if (p) onPick(p);
      }}
      onClear={onClear}
      onQueryChange={onQueryChange}
      autoFocus={autoFocus}
      size={size}
    />
  );
}
