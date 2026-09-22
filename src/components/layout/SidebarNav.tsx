import { useLocation, Link } from 'react-router-dom'
import type { NavItem } from './nav'
import { cn } from '@/lib/utils'

export function SidebarNav({
  items,
  onNavigate,
}: {
  items: NavItem[]
  onNavigate?: () => void
}) {
  const location = useLocation()

  const isActive = (path: string): boolean => {
    if (path === '/admin' || path === '/teacher' || path === '/student') {
      return location.pathname === path
    }
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  return (
    <nav className="stagger flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-4 scrollbar-thin" aria-label="Menu utama">
      {items.map((item) => {
        const active = isActive(item.path)
        const Icon = item.icon
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group relative flex items-center gap-3 rounded-2xl px-2.5 py-2 text-sm font-semibold transition-all duration-300',
              active
                ? 'bg-white text-slate-900 shadow-[0_14px_30px_-12px_rgba(0,0,0,0.5)] hover:-translate-y-px'
                : 'text-white/65 hover:-translate-y-px hover:bg-white/10 hover:text-white',
            )}
          >
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-105',
                active
                  ? 'text-white shadow-md'
                  : 'bg-white/10 text-white/60 group-hover:bg-white/15 group-hover:text-white',
              )}
              style={active ? { background: 'var(--app-gradient, linear-gradient(135deg, rgb(var(--c-primary-600)), rgb(var(--c-primary-700))))' } : undefined}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
            </span>
            <span className="min-w-0 flex-1 truncate tracking-tight">{item.label}</span>
            {active ? (
              <span
                className="h-6 w-1 shrink-0 rounded-full shadow-sm"
                style={{ background: 'var(--app-gradient, linear-gradient(to bottom, rgb(var(--c-primary-500)), rgb(var(--c-primary-700))))' }}
                aria-hidden
              />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-70" aria-hidden>
                <path d="m9 18 6-6-6-6" />
              </svg>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
