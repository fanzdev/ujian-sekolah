import { Fragment } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'

const SEGMENT_LABELS: Record<string, string> = {
  admin: 'Admin',
  teacher: 'Guru',
  student: 'Siswa',
  dashboard: 'Dashboard',
  students: 'Data Siswa',
  teachers: 'Data Guru',
  classes: 'Kelas',
  departments: 'Jurusan',
  subjects: 'Mata Pelajaran',
  'question-banks': 'Bank Soal',
  questions: 'Soal',
  exams: 'Ujian',
  new: 'Buat Baru',
  edit: 'Ubah',
  participants: 'Peserta & Monitoring',
  monitoring: 'Monitoring',
  results: 'Hasil Ujian',
  reports: 'Laporan',
  grading: 'Penilaian Essay',
  'import-export': 'Import / Export',
  'audit-logs': 'Audit Log',
  'violation-logs': 'Log Pelanggaran',
  settings: 'Pengaturan',
  profile: 'Profil Saya',
  security: 'Keamanan',
  history: 'Riwayat & Nilai',
  card: 'Kartu Ujian',
  examsAvailable: '',
}

function labelFor(segment: string): string {
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment]
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(segment)) return `#${segment.slice(0, 6)}`
  if (segment.length > 18) return segment.slice(0, 16) + '…'
  return segment.charAt(0).toUpperCase() + segment.slice(1)
}

export function Breadcrumb() {
  const location = useLocation()
  const segments = location.pathname.split('/').filter(Boolean)
  if (segments.length === 0) return null

  let acc = ''
  const crumbs = segments.map((seg) => {
    acc += `/${seg}`
    return { path: acc, label: labelFor(seg), raw: seg }
  })

  return (
    <nav aria-label="Alamat halaman" className="min-w-0 flex-1 overflow-hidden">
      <ol className="flex items-center gap-0.5 text-xs">
        <li className="shrink-0">
          <Link
            to={`/${segments[0]}`}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-primary-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:bg-slate-700 dark:hover:text-primary-300 dark:bg-slate-700 dark:text-slate-200"
          >
            <Home className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{crumbs[0].label}</span>
          </Link>
        </li>
        {crumbs.slice(1).map((c, i) => (
          <Fragment key={c.path}>
            <ChevronRight className="h-3 w-3 shrink-0 text-slate-300 dark:text-slate-600" />
            <li className="min-w-0">
              {i === crumbs.length - 2 ? (
                <span aria-current="page" className="block truncate rounded-md px-1.5 py-1 font-bold text-slate-800 dark:text-slate-100">
                  {c.label}
                </span>
              ) : (
                <Link
                  to={c.path}
                  className="block truncate rounded-md px-1.5 py-1 font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 dark:hover:bg-slate-700 dark:bg-slate-700 dark:text-slate-200"
                >
                  {c.label}
                </Link>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  )
}
