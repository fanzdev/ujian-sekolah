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
        <p className="hidden font-mono text-[10px] tracking-[0.16em] text-accent dark:text-accent sm:block">SMK AL-FATA • RUANG KERJA</p>
        <div className="mt-1 flex items-center gap-3">
          {icon && (
            <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm dark:bg-white dark:text-[#0B1E24] sm:flex" style={{ background: 'var(--app-gradient, rgb(var(--c-primary-600)))' }}>
              {icon}
            </div>
          )}
          <div>
            <h1 className="text-[22px] font-black leading-none tracking-[-0.03em] text-primary-800 dark:text-white sm:text-[26px]">{title}</h1>
            {subtitle && <p className="mt-1.5 max-w-[60ch] text-sm leading-relaxed text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
        </div>
        <div className="mt-3 hidden h-1 w-12 rounded-full sm:block" style={{ background: 'var(--app-gradient, rgb(var(--c-primary-600)))' }} aria-hidden />
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
    <div className="group relative overflow-hidden rounded-[20px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(11,30,36,0.06)] transition-all hover:shadow-[0_12px_32px_rgba(11,30,36,0.08)] dark:border-white/10 dark:bg-[#0F1D24] sm:p-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 opacity-60 transition-opacity group-hover:opacity-100" style={{ background: 'var(--app-gradient, linear-gradient(90deg, rgb(var(--c-primary-600)), rgb(var(--c-accent-600))))' }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[10px] tracking-[0.12em] text-[#8A9AA0] dark:text-white/50 sm:text-[11px]">{label}</p>
          <p className="mt-1.5 truncate text-[22px] font-black leading-none tracking-[-0.03em] text-[#0B1E24] dark:text-white sm:text-[26px]">{value}</p>
          {hint && <p className="mt-1 font-mono text-[11px] tracking-wide text-[#6B7A7F] dark:text-white/45">{hint}</p>}
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
