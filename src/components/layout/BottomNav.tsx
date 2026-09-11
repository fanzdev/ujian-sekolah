import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  GraduationCap,
  FileText,
  ClipboardCheck,
  Database,
  PencilRuler,
  CalendarDays,
  CalendarClock,
  UserCircle,
} from 'lucide-react'
import type { UserRole } from '@/types/models'
import { cn } from '@/lib/utils'

interface BottomItem {
  path: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const STUDENT_BOTTOM: BottomItem[] = [
  { path: '/student', label: 'Beranda', icon: LayoutDashboard },
  { path: '/student/exams', label: 'Ujian', icon: CalendarDays },
  { path: '/student/history', label: 'Riwayat', icon: ClipboardCheck },
  { path: '/student/schedule', label: 'Jadwal', icon: CalendarClock },
  { path: '/student/profile', label: 'Profil', icon: UserCircle },
]

const TEACHER_BOTTOM: BottomItem[] = [
  { path: '/teacher', label: 'Beranda', icon: LayoutDashboard },
  { path: '/teacher/question-banks', label: 'Bank', icon: Database },
  { path: '/teacher/exams', label: 'Ujian', icon: FileText },
  { path: '/teacher/grading', label: 'Nilai', icon: PencilRuler },
  { path: '/teacher/profile', label: 'Profil', icon: UserCircle },
]

const ADMIN_BOTTOM: BottomItem[] = [
  { path: '/admin', label: 'Beranda', icon: LayoutDashboard },
  { path: '/admin/students', label: 'Siswa', icon: GraduationCap },
  { path: '/admin/exams', label: 'Ujian', icon: FileText },
  { path: '/admin/results', label: 'Hasil', icon: ClipboardCheck },
  { path: '/admin/profile', label: 'Profil', icon: UserCircle },
]

function getBottomItems(role: UserRole): BottomItem[] {
  if (role === 'admin') return ADMIN_BOTTOM
  if (role === 'teacher') return TEACHER_BOTTOM
  return STUDENT_BOTTOM
}

function isActivePath(current: string, itemPath: string): boolean {
  if (itemPath === '/admin' || itemPath === '/teacher' || itemPath === '/student') {
    return current === itemPath
  }
  return current === itemPath || current.startsWith(itemPath + '/')
}

export function BottomNav({
  role,
  onMoreClick: _onMoreClick,
}: {
  role: UserRole
  onMoreClick: () => void
}) {
  const location = useLocation()
  const items = getBottomItems(role)

  return (
    <nav
      aria-label="Navigasi bawah"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[560px] lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-3 mb-3 flex items-center justify-around rounded-[24px] border border-black/5 bg-white px-1.5 pb-2 pt-2 shadow-[0_12px_40px_-12px_rgba(11,30,36,0.22)] backdrop-blur-xl dark:border-white/10 dark:bg-[var(--c-sidebar-bg)] dark:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)]">
        {items.map((item) => {
          const active = isActivePath(location.pathname, item.path)
          const Icon = item.icon
          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex flex-1 flex-col items-center justify-center gap-1.5 px-1 py-1.5 text-[10px] font-bold leading-none transition-all active:scale-95',
                active
                  ? 'text-primary-900 dark:text-white'
                  : 'text-slate-400 dark:text-white/50',
              )}
            >
              <span className={cn(
                'flex h-11 w-11 items-center justify-center rounded-[14px] transition-all',
                active
                  ? 'text-white shadow-md dark:bg-white dark:text-primary-900'
                  : 'bg-slate-100 text-slate-400 dark:bg-white/10 dark:text-white/60',
              )} style={active ? { background: 'var(--app-gradient, rgb(var(--c-primary-600)))' } : undefined}>
                <Icon className="h-[22px] w-[22px]" />
              </span>
              <span className="tracking-wide">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export function StudentBottomNoticeSpacer() {
  return <div className="h-28 lg:hidden" aria-hidden />
}
