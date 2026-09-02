import { cn } from '@/lib/utils'

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string; badge?: number }[]
  active: string
  onChange: (id: string) => void
}) {
  return (
    <div className="border-b border-slate-200">
      <nav className="-mb-px flex gap-1 overflow-x-auto scrollbar-thin" role="tablist">
        {tabs.map((tab) => {
          const isActive = tab.id === active
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={cn(
                'relative flex shrink-0 items-center gap-2 whitespace-nowrap rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'text-primary-700 after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary-600 dark:text-primary-300 dark:after:bg-primary-400'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200',
              )}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-100 px-1.5 text-[11px] font-bold text-primary-700">
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
