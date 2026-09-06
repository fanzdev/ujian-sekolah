import type { UserRole } from '@/types/models'
import {
  LayoutDashboard,
  GraduationCap,
  Users,
  School,
  Building2,
  Database,
  FileText,
  CalendarDays,
  CalendarClock,
  ClipboardCheck,
  BarChart3,
  Upload,
  ScrollText,
  ShieldAlert,
  Settings,
  UserCircle,
  ShieldCheck,
  PencilRuler,
  IdCard,
} from 'lucide-react'

export interface NavItem {
  path: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const ADMIN_NAV: NavItem[] = [
  { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/admin/students', label: 'Siswa', icon: GraduationCap },
  { path: '/admin/teachers', label: 'Guru', icon: Users },
  { path: '/admin/classes', label: 'Kelas', icon: School },
  { path: '/admin/departments', label: 'Jurusan', icon: Building2 },
  { path: '/admin/question-banks', label: 'Bank Soal', icon: Database },
  { path: '/admin/exams', label: 'Ujian', icon: FileText },
  { path: '/admin/schedule', label: 'Jadwal', icon: CalendarClock },
  { path: '/admin/results', label: 'Hasil Ujian', icon: ClipboardCheck },
  { path: '/admin/reports', label: 'Laporan', icon: BarChart3 },
  { path: '/admin/import-export', label: 'Import / Export', icon: Upload },
  { path: '/admin/ai-usage', label: 'Laporan AI', icon: PencilRuler },
  { path: '/admin/audit-logs', label: 'Audit Log', icon: ScrollText },
  { path: '/admin/violation-logs', label: 'Pelanggaran', icon: ShieldAlert },
  { path: '/admin/settings', label: 'Pengaturan', icon: Settings },
]

const TEACHER_NAV: NavItem[] = [
  { path: '/teacher', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/teacher/question-banks', label: 'Bank Soal', icon: Database },
  { path: '/teacher/questions', label: 'Soal Saya', icon: PencilRuler },
  { path: '/teacher/exams', label: 'Ujian Saya', icon: FileText },
  { path: '/teacher/schedule', label: 'Jadwal', icon: CalendarClock },
  { path: '/teacher/results', label: 'Hasil Ujian', icon: ClipboardCheck },
  { path: '/teacher/grading', label: 'Penilaian Essay', icon: CheckSquareIcon },
  { path: '/teacher/reports', label: 'Laporan', icon: BarChart3 },
]

function CheckSquareIcon({ className }: { className?: string }) {
  return <ClipboardCheck className={className} />
}

const STUDENT_NAV: NavItem[] = [
  { path: '/student', label: 'Beranda', icon: LayoutDashboard },
  { path: '/student/exams', label: 'Ujian Tersedia', icon: CalendarDays },
  { path: '/student/schedule', label: 'Jadwal', icon: CalendarClock },
  { path: '/student/history', label: 'Riwayat & Nilai', icon: ClipboardCheck },
  { path: '/student/card', label: 'Kartu Ujian', icon: IdCard },
]

export const PROFILE_PATHS: Record<UserRole, string> = {
  admin: '/admin/profile',
  teacher: '/teacher/profile',
  student: '/student/profile',
}

export const SECURITY_PATHS: Partial<Record<UserRole, string>> = {
  admin: '/admin/security',
  teacher: '/teacher/security',
  student: '/student/security',
}

export function getNav(role: UserRole): NavItem[] {
  switch (role) {
    case 'admin':
      return ADMIN_NAV
    case 'teacher':
      return TEACHER_NAV
    case 'student':
      return STUDENT_NAV
    default:
      return []
  }
}

export const EXTRA_FOOTER_NAV: NavItem[] = [
  { path: '#profile', label: 'Profil', icon: UserCircle },
  { path: '#security', label: 'Keamanan', icon: ShieldCheck },
]
