import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface Column<T> {
  key: string
  header: ReactNode
  render?: (row: T, index: number) => ReactNode
  className?: string
  headerClassName?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  rowKey: (row: T) => string
  loading?: boolean
  emptyState?: ReactNode
  onRowClick?: (row: T) => void
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  emptyState,
  onRowClick,
}: DataTableProps<T>) {
  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>
  }

  return (
    <>
      <div className="hidden overflow-x-auto scrollbar-thin sm:block">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              {columns.map((col) => (
                <th key={col.key} className={cn('table-th', col.headerClassName)}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((row, rowIndex) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'transition-colors hover:bg-slate-50/80',
                  onRowClick && 'cursor-pointer',
                )}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn('table-td', col.className)}>
                    {col.render ? col.render(row, rowIndex) : String((row as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 p-3 sm:hidden">
        {data.map((row, rowIndex) => (
          <div
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn(
              'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all dark:border-slate-700 dark:bg-slate-900',
              onRowClick && 'active:scale-[0.99] cursor-pointer active:bg-slate-50',
            )}
          >
            <div className="space-y-3">
              {columns
                .filter((c) => c.key !== 'actions' && c.header !== '')
                .map((col) => (
                  <div key={col.key} className="flex items-start justify-between gap-3">
                    <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-slate-400">{String(col.header)}</span>
                    <span className="min-w-0 flex-1 text-right text-sm font-medium text-slate-700 dark:text-slate-200">
                      {col.render ? col.render(row, rowIndex) : String((row as Record<string, unknown>)[col.key] ?? '')}
                    </span>
                  </div>
                ))}
              {columns.some((c) => c.key === 'actions') && (
                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  {columns
                    .filter((c) => c.key === 'actions')
                    .map((col) => (
                      <div key={col.key}>{col.render ? col.render(row, rowIndex) : null}</div>
                    ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)

  const pages: (number | '...')[] = []
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) pages.push(i)
    else if (pages[pages.length - 1] !== '...') pages.push('...')
  }

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-4">
      <p className="hidden text-xs text-slate-400 sm:block">
        Menampilkan <span className="font-semibold text-slate-600">{from}</span>–
        <span className="font-semibold text-slate-600">{to}</span> dari{' '}
        <span className="font-semibold text-slate-600">{total}</span> data
      </p>
      <p className="text-center text-[11px] font-medium text-slate-500 sm:hidden">
        Hal. {page} / {totalPages} • {total} data
      </p>
      <nav className="flex items-center justify-center gap-1 sm:justify-end" aria-label="Navigasi halaman">
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="tap-target rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          ‹ Prev
        </button>
        {pages.map((p, idx) =>
          p === '...' ? (
            <span key={`dots-${idx}`} className="px-1 text-xs text-slate-300">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              aria-current={p === page ? 'page' : undefined}
              className={cn(
                'tap-target min-w-[36px] rounded-xl px-3 py-2 text-xs font-bold transition-colors',
                p === page
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
              )}
            >
              {p}
            </button>
          ),
        )}
        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="tap-target rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Next ›
        </button>
      </nav>
    </div>
  )
}
