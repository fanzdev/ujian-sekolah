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
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4 scrollbar-thin" aria-label="Menu utama">
      {items.map((item) => {
        const active = isActive(item.path)
        const Icon = item.icon
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn('nav-item', active && 'nav-item-active')}
          >
            <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-primary-600' : 'text-slate-400')} />
            <span className="truncate">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
