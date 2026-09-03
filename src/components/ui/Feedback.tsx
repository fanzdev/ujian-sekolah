import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import { RefreshCw, InboxIcon } from 'lucide-react'

function useThemeColor(): string {
  return useMemo(() => {
    try {
      const raw = localStorage.getItem('cbt-branding')
      if (raw) {
        const b = JSON.parse(raw) as { primary_color?: string }
        if (b.primary_color && /^#[0-9a-fA-F]{6}$/.test(b.primary_color)) return b.primary_color
      }
    } catch { void 0 }
    return '#0D868F'
  }, [])
}

export function Spinner({ className }: { className?: string }) {
  const color = useThemeColor()
  return <Loader2 className={cn('h-5 w-5 animate-spin', className)} style={{ color }} />
}

export function PageLoader({ label = 'Memuat...' }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-3">
      <Spinner className="h-8 w-8" />
      <p className="text-sm text-slate-400">{label}</p>
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-lg bg-slate-200/70 dark:bg-slate-700/50', className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-slate-600/40" />
    </div>
  )
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn('h-4', c === 0 ? 'w-10' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string
  description?: string
  icon?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center animate-fade-in">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        {icon ?? <InboxIcon className="h-6 w-6" />}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {description && <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-slate-400">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 dark:bg-rose-600 dark:text-white dark:text-white">!</div>
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Gagal memuat data</h3>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-400">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:bg-slate-800"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Coba Lagi
        </button>
      )}
    </div>
  )
}
