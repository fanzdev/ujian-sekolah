import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('card min-w-0 overflow-hidden', className)}>{children}</div>
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
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:gap-3 sm:px-5 sm:py-4">
      <div>
        <h3 className="text-[13px] font-semibold text-slate-900 sm:text-[15px]">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[11px] text-slate-400 sm:text-xs">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-4 sm:p-5', className)}>{children}</div>
}
