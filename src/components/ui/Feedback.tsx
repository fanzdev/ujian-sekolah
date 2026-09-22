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
  const color = useThemeColor()
  return (
    <div className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-5 px-6 py-14">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <span className="absolute inset-0 rounded-full opacity-20 blur-xl animate-pulse-soft" style={{ background: `linear-gradient(135deg, ${color}, #2DD4BF)` }} />
        <span className="absolute inset-0 rounded-full border-2 border-slate-200 dark:border-slate-700" />
        <span className="absolute inset-0 animate-orbit">
          <span className="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full shadow-lg" style={{ background: color }} />
        </span>
        <span className="absolute inset-2.5 rounded-full border border-dashed border-slate-300 dark:border-slate-600 animate-orbit" style={{ animationDirection: 'reverse', animationDuration: '8s' }} />
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl text-white shadow-lg animate-float-soft" style={{ background: `linear-gradient(135deg, ${color}, #0b6b72)` }}>
          <Loader2 className="h-5 w-5 animate-spin" />
        </span>
      </div>
      <div className="flex flex-col items-center gap-2 animate-fade-in">
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{label}</p>
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-full animate-twinkle" style={{ background: color, animationDelay: `${i * 0.35}s` }} />
          ))}
        </div>
      </div>
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
    <div className="stagger divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/70 bg-white dark:divide-slate-800 dark:border-slate-700/60 dark:bg-slate-900">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn('h-4', c === 0 ? 'w-10 rounded-full' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  )
}

type EmptyTone = 'slate' | 'primary' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet'

const EMPTY_TONES: Record<EmptyTone, { glow: string; badge: string; ring: string }> = {
  slate: { glow: 'from-slate-300/50 via-slate-200/30 to-transparent', badge: 'from-slate-500 to-slate-700 text-white', ring: 'ring-slate-200 dark:ring-slate-700' },
  primary: { glow: 'from-primary-300/60 via-primary-200/25 to-transparent', badge: 'from-primary-500 to-primary-700 text-white', ring: 'ring-primary-200/70 dark:ring-primary-800/50' },
  emerald: { glow: 'from-emerald-300/60 via-emerald-200/25 to-transparent', badge: 'from-emerald-500 to-teal-600 text-white', ring: 'ring-emerald-200/70 dark:ring-emerald-800/50' },
  amber: { glow: 'from-amber-300/60 via-amber-200/25 to-transparent', badge: 'from-amber-400 to-orange-500 text-white', ring: 'ring-amber-200/70 dark:ring-amber-800/50' },
  rose: { glow: 'from-rose-300/60 via-rose-200/25 to-transparent', badge: 'from-rose-500 to-rose-700 text-white', ring: 'ring-rose-200/70 dark:ring-rose-800/50' },
  sky: { glow: 'from-sky-300/60 via-sky-200/25 to-transparent', badge: 'from-sky-500 to-blue-600 text-white', ring: 'ring-sky-200/70 dark:ring-sky-800/50' },
  violet: { glow: 'from-violet-300/60 via-violet-200/25 to-transparent', badge: 'from-violet-500 to-purple-700 text-white', ring: 'ring-violet-200/70 dark:ring-violet-800/50' },
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  tone = 'slate',
}: {
  title: string
  description?: string
  icon?: React.ReactNode
  action?: React.ReactNode
  tone?: EmptyTone
}) {
  const t = EMPTY_TONES[tone]
  return (
    <div className="relative flex flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-14 text-center animate-rise dark:border-slate-700/70 dark:bg-slate-900/50">
      <div className={cn('pointer-events-none absolute -top-16 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-gradient-to-b blur-2xl', t.glow)} />
      <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgb(148 163 184 / 0.35) 1px, transparent 0)', backgroundSize: '18px 18px' }} />
      <div className="relative">
        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-amber-400 animate-twinkle" />
        <span className="absolute -left-2 top-1/2 h-2 w-2 rounded-full bg-sky-400 animate-twinkle" style={{ animationDelay: '0.7s' }} />
        <div className={cn('relative flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br shadow-lg ring-1 animate-float-soft', t.badge, t.ring)}>
          {icon ?? <InboxIcon className="h-7 w-7" />}
        </div>
      </div>
      <div className="relative max-w-sm">
        <h3 className="text-[15px] font-extrabold tracking-tight text-slate-800 dark:text-slate-100">{title}</h3>
        {description && <p className="mx-auto mt-1.5 max-w-xs text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {action && <div className="relative animate-fade-in" style={{ animationDelay: '0.15s' }}>{action}</div>}
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
    <div className="relative flex flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl border border-rose-200/70 bg-gradient-to-b from-rose-50/80 to-white px-6 py-12 text-center animate-rise dark:border-rose-900/40 dark:from-rose-950/40 dark:to-slate-900">
      <div className="pointer-events-none absolute -top-20 left-1/2 h-44 w-72 -translate-x-1/2 rounded-full bg-rose-300/30 blur-3xl animate-blob" />
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-rose-700 text-xl font-black text-white shadow-lg shadow-rose-500/30 animate-pop">!</div>
      <div className="relative">
        <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Gagal memuat data</h3>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500 dark:text-slate-400">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="btn-shine relative inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-md active:translate-y-0 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Coba Lagi
        </button>
      )}
    </div>
  )
}
