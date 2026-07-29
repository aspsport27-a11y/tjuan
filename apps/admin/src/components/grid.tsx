import { useMemo, useState } from 'react';

type SortDir = 'asc' | 'desc';

export interface GridState<T> {
  rows: T[];          // filtered + sorted + paged -- what the table renders
  totalRows: number;  // before filtering
  matchedRows: number; // after filtering, before paging
  search: string;
  setSearch: (v: string) => void;
  page: number;
  pageCount: number;
  setPage: (p: number) => void;
  sortKey: string | null;
  sortDir: SortDir;
  toggleSort: (key: string) => void;
}

interface UseGridOptions<T> {
  /** Fields (or derived strings) the search box matches against. */
  searchFields?: ((row: T) => string | null | undefined)[];
  /** Value used when sorting by a column key. Numbers sort numerically. */
  sortValue?: (row: T, key: string) => string | number | null | undefined;
  pageSize?: number;
  initialSort?: { key: string; dir?: SortDir };
}

/**
 * Client-side search / sort / pagination for list pages.
 *
 * Deliberately client-side: every list endpoint here already caps at
 * 100-300 rows, so paging on the server would add round-trips without
 * changing what the user can reach. If a dataset outgrows that cap, the
 * endpoint should paginate and this hook gets replaced for that page.
 */
export function useGrid<T>(allRows: T[], options: UseGridOptions<T> = {}): GridState<T> {
  const { searchFields, sortValue, pageSize = 20, initialSort } = options;
  const [search, setSearchRaw] = useState('');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<string | null>(initialSort?.key ?? null);
  const [sortDir, setSortDir] = useState<SortDir>(initialSort?.dir ?? 'asc');

  // Any new search starts from page 1, otherwise a narrow result set can
  // land the user on a page that no longer exists.
  function setSearch(v: string) {
    setSearchRaw(v);
    setPage(1);
  }

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  }

  const filtered = useMemo(() => {
    if (!search.trim() || !searchFields?.length) return allRows;
    const q = search.trim().toLowerCase();
    return allRows.filter((row) =>
      searchFields.some((get) => (get(row) ?? '').toString().toLowerCase().includes(q)),
    );
  }, [allRows, search, searchFields]);

  const sorted = useMemo(() => {
    if (!sortKey || !sortValue) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;   // blanks always sink, regardless of direction
      if (bv == null) return -1;
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'id');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir, sortValue]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const rows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  return {
    rows,
    totalRows: allRows.length,
    matchedRows: sorted.length,
    search,
    setSearch,
    page: safePage,
    pageCount,
    setPage,
    sortKey,
    sortDir,
    toggleSort,
  };
}

export function GridToolbar<T>({
  grid,
  placeholder = 'Cari...',
  children,
}: {
  grid: GridState<T>;
  placeholder?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <input
        value={grid.search}
        onChange={(e) => grid.setSearch(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 sm:w-64"
      />
      <span className="text-xs text-slate-500">
        {grid.matchedRows === grid.totalRows
          ? `${grid.totalRows} data`
          : `${grid.matchedRows} dari ${grid.totalRows} data`}
      </span>
      {children}
    </div>
  );
}

/** Clickable <th> that sorts by `sortKey`. */
export function SortHeader<T>({
  grid,
  sortKey,
  children,
  align = 'left',
}: {
  grid: GridState<T>;
  sortKey: string;
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  const active = grid.sortKey === sortKey;
  return (
    <th className={`px-4 py-3 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        onClick={() => grid.toggleSort(sortKey)}
        className={`inline-flex items-center gap-1 font-medium hover:text-slate-700 ${active ? 'text-slate-700' : ''}`}
      >
        {children}
        <span className={`text-[10px] ${active ? 'opacity-100' : 'opacity-30'}`}>
          {active && grid.sortDir === 'desc' ? '▼' : '▲'}
        </span>
      </button>
    </th>
  );
}

export function GridPagination<T>({ grid }: { grid: GridState<T> }) {
  if (grid.pageCount <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-between gap-2">
      <button
        onClick={() => grid.setPage(grid.page - 1)}
        disabled={grid.page <= 1}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
      >
        &larr; Sebelumnya
      </button>
      <span className="text-sm text-slate-500">
        Halaman {grid.page} dari {grid.pageCount}
      </span>
      <button
        onClick={() => grid.setPage(grid.page + 1)}
        disabled={grid.page >= grid.pageCount}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
      >
        Berikutnya &rarr;
      </button>
    </div>
  );
}
