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
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4 scrollbar-thin" aria-label="Menu utama">
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
              'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
              active
                ? 'bg-white text-[#0B1E24] shadow-sm'
                : 'text-white/65 hover:bg-white/10 hover:text-white'
            )}
          >
            <Icon className={cn('h-[18px] w-[18px] shrink-0 transition-colors', active ? 'text-[#0D868F]' : 'text-white/45 group-hover:text-white')} />
            <span className="truncate tracking-tight">{item.label}</span>
            {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#C67C3B]" aria-hidden />}
          </Link>
        )
      })}
    </nav>
  )
}
