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
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 animate-fade-in">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="hidden h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-600 dark:text-white dark:ring-1 dark:ring-primary-500/30 shadow-sm sm:flex">
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
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
  const tones = {
    blue: 'bg-primary-50 text-primary-600 dark:bg-primary-600 dark:text-white dark:ring-1 dark:ring-primary-500/20',
    green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-600 dark:text-white dark:ring-1 dark:ring-emerald-500/20',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-600 dark:text-white dark:ring-1 dark:ring-amber-500/20',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-600 dark:text-white dark:ring-1 dark:ring-rose-500/20',
    purple: 'bg-violet-50 text-violet-600 dark:bg-violet-600 dark:text-white dark:ring-1 dark:ring-violet-500/20',
  }
  return (
    <div className="card p-3 transition-all hover:shadow-card-hover animate-fade-in sm:p-5">
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-400 sm:text-xs">{label}</p>
          <p className="mt-1 truncate text-xl font-bold tracking-tight text-slate-900 sm:mt-2 sm:text-2xl">{value}</p>
          {hint && <p className="mt-0.5 text-[10px] text-slate-400 sm:mt-1 sm:text-xs">{hint}</p>}
        </div>
        {icon && (
          <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 sm:rounded-xl', tones[tone])}>
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}

export { Avatar }
