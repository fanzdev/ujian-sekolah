import { Link } from 'react-router-dom'
import { CalendarDays, Clock3, PlayCircle, AlertCircle, Hourglass, Ban, CheckCircle2 } from 'lucide-react'
import { useAsync, useDocumentTitle } from '@/hooks/useAsync'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback'
import { PageHeader } from '@/components/ui/PageHeader'
import { listAvailableExams } from '@/services/attempts.service'
import { formatDateTime } from '@/lib/datetime'
import { formatNumber } from '@/lib/utils'
import { AVAILABLE_EXAM_STATUS_LABELS } from '@/lib/constants'

export default function AvailableExamsPage() {
  useDocumentTitle('Ujian Tersedia')
  const query = useAsync(() => listAvailableExams(), [])
  const meQuery = useAsync(async () => {
    const { supabase } = await import('@/services/client')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: stu } = await supabase.from('students').select('class_id, classes(name)').eq('profile_id', user.id).maybeSingle()
    return stu as { class_id: string | null; classes: { name: string } | null } | null
  }, [])

  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />

  const groups: Record<string, typeof exams> = {
    resume: [],
    can_start: [],
    upcoming: [],
    closed_no: [],
  }
  const exams = query.data ?? []
  for (const e of exams) {
    if (e.status_for_me === 'resume') groups.resume.push(e)
    else if (e.status_for_me === 'can_start') groups.can_start.push(e)
    else if (e.status_for_me === 'upcoming') groups.upcoming.push(e)
    else groups.closed_no.push(e)
  }

  return (
    <>
      <PageHeader title="Ujian Tersedia" subtitle="Seluruh ujian yang ditugaskan kepada Anda" icon={<CalendarDays className="h-5 w-5" />} />

      {query.loading ? (
        <TableSkeleton rows={4} cols={3} />
      ) : exams.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-6 w-6" />}
          title={meQuery.data && !meQuery.data.class_id ? 'Kelas Belum Ditentukan' : 'Belum ada ujian'}
          description={
            meQuery.data && !meQuery.data.class_id
              ? 'Akun Anda belum terhubung ke kelas. Hubungi admin untuk menetapkan kelas agar ujian dapat muncul.'
              : 'Ujian akan muncul di sini sesuai kelas dan jurusan Anda. Jika ujian sudah aktif tapi tidak muncul, pastikan admin telah menambahkan soal dan mengatur target kelas/jurusan.'
          }
        />
      ) : (
        <div className="space-y-8">
          <ExamGroup icon={<AlertCircle className="h-4 w-4" />} title="Lanjutkan Pengerjaan" tone="red" items={groups.resume} highlight />
          <ExamGroup icon={<PlayCircle className="h-4 w-4" />} title="Bisa Dikerjakan Sekarang" tone="green" items={groups.can_start} />
          <ExamGroup icon={<Hourglass className="h-4 w-4" />} title="Akan Datang" tone="sky" items={groups.upcoming} />
          <ExamGroup icon={<Ban className="h-4 w-4" />} title="Berakhir / Kesempatan Habis" items={groups.closed_no} muted />
        </div>
      )}
    </>
  )
}

type ExamItem = Awaited<ReturnType<typeof listAvailableExams>>[number]

function ExamGroup({
  title,
  icon,
  items,
  tone = 'slate',
  highlight,
  muted,
}: {
  title: string
  icon: React.ReactNode
  items: ExamItem[]
  tone?: 'red' | 'green' | 'sky' | 'slate'
  highlight?: boolean
  muted?: boolean
}) {
  if (items.length === 0) return null

  return (
    <section className="animate-fade-in">
      <div className={`mb-3 flex items-center gap-2 text-sm font-bold ${tone === 'red' ? 'text-rose-600' : tone === 'green' ? 'text-emerald-600' : tone === 'sky' ? 'text-sky-600' : 'text-slate-500'} ${muted ? 'opacity-60' : ''}`}>
        {icon} {title}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-400 dark:bg-slate-700 dark:text-slate-200">{items.length}</span>
      </div>
      <div className={`grid gap-4 sm:grid-cols-2 ${highlight ? 'sm:grid-cols-1 lg:grid-cols-2' : ''}`}>
        {items.map((exam) => (
          <Card key={exam.id} className={`transition-all hover:shadow-card-hover ${highlight ? 'border-rose-200 bg-gradient-to-br from-white to-rose-50/50' : ''} ${muted ? 'opacity-70' : ''}`}>
            <div className="flex h-full flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="line-clamp-2 text-[15px] leading-snug font-bold text-slate-900">{exam.title}</h3>
                <Badge tone={tone === 'red' ? 'red' : tone === 'green' ? 'green' : tone === 'sky' ? 'sky' : 'gray'}>
                  {AVAILABLE_EXAM_STATUS_LABELS[exam.status_for_me]}
                </Badge>
              </div>
              <p className="mt-1.5 text-xs font-medium text-primary-600">{exam.subject_name ?? '-'}</p>

              <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-2 text-xs">
                <Info label="Mulai" value={formatDateTime(exam.starts_at)} />
                <Info label="Berakhir" value={formatDateTime(exam.ends_at)} />
                <Info label="Durasi" value={`${exam.duration_minutes} menit`} />
                <Info label="Jumlah Soal" value={String(exam.total_questions)} />
                <Info label="Percobaan" value={`${exam.attempts_used}/${exam.max_attempts}`} />
                {exam.passing_grade > 0 && <Info label="KKM" value={String(exam.passing_grade)} />}
              </dl>

              {exam.best_score !== null && exam.status_for_me !== 'can_start' && (
                <p className="mt-3 inline-flex w-fit items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Nilai terbaik: {formatNumber(exam.best_score, 1)}
                </p>
              )}

              <div className="mt-auto pt-4">
                {(exam.status_for_me === 'can_start' || exam.status_for_me === 'resume') ? (
                  <Link to={`/student/exams/${exam.id}`} className="block">
                    <Button className="w-full" variant={exam.status_for_me === 'resume' ? 'danger' : 'primary'} icon={exam.status_for_me === 'resume' ? <AlertCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}>
                      {exam.status_for_me === 'resume' ? 'Lanjutkan Ujian' : 'Mulai Ujian'}
                    </Button>
                  </Link>
                ) : (
                  <Link to={`/student/exams/${exam.id}`} className="block">
                    <Button className="w-full" variant="outline" disabled={exam.status_for_me === 'no_attempts'}>
                      {exam.status_for_me === 'upcoming' ? 'Lihat Detail' : exam.status_for_me === 'closed' ? 'Sudah Berakhir' : 'Kesempatan Habis'}
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-slate-500">
      <Clock3 className="h-3 w-3 shrink-0 text-slate-300" />
      <span className="truncate"><span className="font-medium text-slate-700">{value}</span></span>
      <dt className="sr-only">{label}</dt>
    </div>
  )
}
