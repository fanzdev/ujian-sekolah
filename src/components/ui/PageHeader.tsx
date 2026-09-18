import { cn } from '@/lib/utils'
import { Avatar } from './Avatar'

export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className="mb-5 flex flex-col gap-4 sm:mb-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <div className="mt-1 flex items-center gap-3">
          {icon && (
            <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm dark:bg-white dark:text-[#0B1E24] sm:flex" style={{ background: 'var(--app-gradient, rgb(var(--c-primary-600)))' }}>
              {icon}
            </div>
          )}
          <div>
            <h1 className="truncate text-xl font-bold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-2xl">{title}</h1>
            {subtitle && <p className="mt-1 max-w-[60ch] text-sm leading-relaxed text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({
  label,
  value,
  icon,
  tone = 'blue',
  hint,
}: {
  label: string
  value: React.ReactNode
  icon?: React.ReactNode
  tone?: 'blue' | 'green' | 'amber' | 'rose' | 'purple'
  hint?: string
}) {
  const tones: Record<string, string> = {
    blue: 'bg-primary-500/10 text-primary-600 dark:bg-white/10 dark:text-white',
    green: 'bg-emerald-500/10 text-emerald-700 dark:bg-white/10 dark:text-white',
    amber: 'bg-accent/10 text-accent dark:bg-white/10 dark:text-white',
    rose: 'bg-rose-500/10 text-rose-600 dark:bg-white/10 dark:text-white',
    purple: 'bg-violet-500/10 text-violet-700 dark:bg-white/10 dark:text-white',
  }
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-white/10 dark:bg-[#0F1D24] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1.5 truncate text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">{value}</p>
          {hint && <p className="mt-1 truncate text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
        </div>
        {icon && (
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11', tones[tone])}>
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}

export { Avatar }
