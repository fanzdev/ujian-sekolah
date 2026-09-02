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
      className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-md lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-around rounded-[20px] border border-slate-200/60 bg-white/90 px-1 pb-2 pt-2 shadow-[0_8px_32px_-8px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:border-slate-700/50 dark:bg-slate-900/90 dark:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.5)]">
        {items.map((item) => {
          const active = isActivePath(location.pathname, item.path)
          const Icon = item.icon
          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex flex-1 flex-col items-center justify-center gap-1 px-1 py-1 text-[10px] font-bold leading-none transition-all active:scale-95',
                active
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300',
              )}
            >
              <span className={cn(
                'flex h-11 w-11 items-center justify-center rounded-[14px] transition-all',
                active
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/30 dark:bg-primary-500 dark:shadow-primary-500/30'
                  : 'bg-transparent',
              )}>
                <Icon className={cn('h-[22px] w-[22px]', active ? 'text-white' : 'text-current')} />
              </span>
              <span className={cn('transition-colors', active ? 'text-primary-600 dark:text-primary-400' : '')}>{item.label}</span>
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
