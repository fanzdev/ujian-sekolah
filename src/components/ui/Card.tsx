import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('relative overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_24px_rgba(11,30,36,0.06)] dark:border-white/10 dark:bg-[#0F1D24] min-w-0', className)}>{children}</div>
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 bg-slate-50/50 px-4 py-3.5 dark:border-white/8 dark:bg-white/[0.03] sm:px-5 sm:py-4">
      <div>
        <h3 className="text-[13px] font-bold tracking-tight text-primary-900 dark:text-white sm:text-[15px]">{title}</h3>
        {subtitle && <p className="mt-0.5 font-mono text-[11px] tracking-wide text-[#6B7A7F] dark:text-white/50 sm:text-xs">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-4 sm:p-5', className)}>{children}</div>
}
