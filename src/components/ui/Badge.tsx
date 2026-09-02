import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Tone = 'gray' | 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'sky'

const TONES: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:ring-slate-600',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-500/30',
  red: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-400 dark:ring-rose-500/30',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-500/30',
  blue: 'bg-primary-50 text-primary-700 ring-primary-200 dark:bg-primary-500/15 dark:text-primary-300 dark:ring-primary-500/30',
  purple: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-400 dark:ring-violet-500/30',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-400 dark:ring-sky-500/30',
}

export function Badge({
  children,
  tone = 'gray',
  className,
  dot = false,
}: {
  children: ReactNode
  tone?: Tone
  className?: string
  dot?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  )
}
