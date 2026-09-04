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
  const debugQuery = useAsync(async () => {
    if ((query.data?.length ?? 1) !== 0) return null
    if (query.loading) return null
    try {
      const { supabase } = await import('@/services/client')
      const { data, error } = await supabase.rpc('student_available_exams_debug')
      if (error) return null
      return data as { student_id: string; class_id: string | null; dept_id: string | null; exams: { exam_id: string; title: string; allows: boolean; qtot: number; is_participant: boolean; is_removed: boolean; targets: { kind: string; target_id: string }[] | null }[] }
    } catch { return null }
  }, [query.data, query.loading])

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
        <div className="space-y-4">
          <EmptyState
            icon={<CalendarDays className="h-6 w-6" />}
            title={meQuery.data && !meQuery.data.class_id ? 'Kelas Belum Ditentukan' : 'Belum ada ujian'}
            description={
              meQuery.data && !meQuery.data.class_id
                ? 'Akun Anda belum terhubung ke kelas. Hubungi admin untuk menetapkan kelas agar ujian dapat muncul.'
                : 'Ujian akan muncul di sini sesuai kelas dan jurusan Anda. Jika ujian sudah aktif tapi tidak muncul, cek diagnosa di bawah.'
            }
            action={<Button size="sm" variant="outline" onClick={query.reload}>Muat Ulang</Button>}
          />
          <Card className="p-5 border-amber-200 bg-amber-50/50 dark:border-amber-800/40 dark:bg-amber-950/20">
            <h3 className="text-sm font-bold text-amber-800 dark:text-amber-300">Diagnosa Ujian Tidak Muncul</h3>
            <ul className="mt-2 list-disc pl-5 space-y-1 text-xs leading-relaxed text-amber-800 dark:text-amber-200/90">
              <li>Kelas Anda: <strong>{meQuery.data?.classes?.name ?? meQuery.data?.class_id ?? '— belum ada kelas —'}</strong> {meQuery.data?.class_id ? '' : '(minta admin isi di menu Siswa → Kelas)'}</li>
              <li>Admin harus: Status <strong>published</strong>, ada <strong>soal</strong>, ada <strong>target kelas/jurusan atau peserta</strong>, jadwal <strong>starts_at ≤ sekarang ≤ ends_at</strong> (WIB), siswa <strong>is_active</strong></li>
              <li>Jika admin pakai target jurusan, pastikan kelas Anda terhubung ke jurusan yang sama</li>
              <li>Jika ujian tanpa target/peserta sama sekali, setelah fix 00017 akan tampil untuk semua siswa aktif (fallback)</li>
              <li>Klik Muat Ulang setelah admin perbaiki</li>
            </ul>
            {debugQuery.data && debugQuery.data.exams?.length > 0 && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-white p-3 dark:border-amber-800/30 dark:bg-slate-900">
                <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Debug (20 ujian published terbaru):</p>
                <div className="mt-2 max-h-64 overflow-auto space-y-2">
                  {debugQuery.data.exams.map((d) => (
                    <div key={d.exam_id} className={`rounded-lg border px-3 py-2 text-xs ${d.allows ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/40 dark:bg-rose-950/30 dark:text-rose-300'}`}>
                      <p className="font-bold">{d.title} — {d.allows ? 'TERLIHAT' : 'TERSEMBUNYI'} · {d.qtot} soal</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed">allows:{String(d.allows)} · peserta:{String(d.is_participant)} · removed:{String(d.is_removed)} · targets:{d.targets ? d.targets.map((t) => `${t.kind}:${t.target_id.slice(0,8)}`).join(', ') : '-'}</p>
                      {!d.allows && d.qtot === 0 && <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">→ Ujian 0 soal, sekarang tetap tampil sebagai “Kesempatan Habis” setelah fix 00017. Admin wajib tambah soal.</p>}
                      {!d.allows && d.targets && d.targets.length > 0 && <p className="text-[11px]">→ Kelas/jurusan Anda tidak cocok target. Minta admin cek menu Ujian → Peserta → Target.</p>}
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Kirim screenshot ini ke admin. Info student_id:{debugQuery.data.student_id.slice(0,8)} class:{debugQuery.data.class_id?.slice(0,8) ?? '-'} dept:{debugQuery.data.dept_id?.slice(0,8) ?? '-'}</p>
              </div>
            )}
            <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">Butuh fix Supabase? Jalankan migrasi <code className="rounded bg-slate-100 px-1 dark:bg-slate-800 dark:text-slate-200">00015</code> &amp; <code className="rounded bg-slate-100 px-1 dark:bg-slate-800 dark:text-slate-200">00017</code> di Supabase SQL Editor (lihat instruksi di bawah).</p>
          </Card>
        </div>
      ) : (
        <div className="space-y-8">
          <ExamGroup icon={<AlertCircle className="h-4 w-4" />} title="Lanjutkan Pengerjaan" tone="red" items={groups.resume} highlight />
          <ExamGroup icon={<PlayCircle className="h-4 w-4" />} title="Bisa Dikerjakan Sekarang" tone="primary" items={groups.can_start} />
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
  tone?: 'red' | 'green' | 'sky' | 'slate' | 'primary'
  highlight?: boolean
  muted?: boolean
}) {
  if (items.length === 0) return null

  const headerTone =
    tone === 'red'
      ? 'text-rose-600 dark:text-rose-400'
      : tone === 'primary'
        ? 'text-primary-600 dark:text-primary-300'
        : tone === 'green'
          ? 'text-emerald-600 dark:text-emerald-400'
          : tone === 'sky'
            ? 'text-sky-600 dark:text-sky-400'
            : 'text-slate-500 dark:text-slate-400'

  const badgeTone: 'red' | 'green' | 'sky' | 'gray' | 'blue' =
    tone === 'red' ? 'red' : tone === 'primary' ? 'blue' : tone === 'green' ? 'green' : tone === 'sky' ? 'sky' : 'gray'

  const cardAccent =
    highlight
      ? 'border-rose-200 bg-gradient-to-br from-white to-rose-50/50 dark:border-rose-900/40 dark:from-slate-900 dark:to-rose-950/25 hover:border-rose-300 dark:hover:border-rose-800/60'
      : tone === 'primary'
        ? 'border-primary-200/70 bg-gradient-to-br from-white to-primary-50/40 dark:border-primary-900/40 dark:from-slate-900 dark:to-primary-950/20 hover:border-primary-300 dark:hover:border-primary-800/60 hover:shadow-card-hover'
        : muted
          ? 'opacity-70 dark:opacity-60'
          : 'hover:border-slate-200 dark:hover:border-slate-700'

  return (
    <section className="animate-fade-in">
      <div className={`mb-3 flex items-center gap-2 text-sm font-bold ${headerTone} ${muted ? 'opacity-60' : ''}`}>
        {icon} {title}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300 ring-1 ring-slate-200/60 dark:ring-slate-700">{items.length}</span>
      </div>
      <div className={`grid gap-4 sm:grid-cols-2 ${highlight ? 'sm:grid-cols-1 lg:grid-cols-2' : ''}`}>
        {items.map((exam) => (
          <Card key={exam.id} className={`group transition-all ${highlight ? 'hover:shadow-card-hover' : tone === 'primary' ? '' : 'hover:shadow-card-hover'} ${cardAccent}`}>
            <div className="flex h-full flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="line-clamp-2 text-[15px] leading-snug font-bold text-slate-900 dark:text-slate-100 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{exam.title}</h3>
                <Badge tone={badgeTone}>
                  {AVAILABLE_EXAM_STATUS_LABELS[exam.status_for_me]}
                </Badge>
              </div>
              <p className="mt-1.5 text-xs font-medium text-primary-600 dark:text-primary-300">{exam.subject_name ?? '-'}</p>

              <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-2 text-xs">
                <Info label="Mulai" value={formatDateTime(exam.starts_at)} />
                <Info label="Berakhir" value={formatDateTime(exam.ends_at)} />
                <Info label="Durasi" value={`${exam.duration_minutes} menit`} />
                <Info label="Jumlah Soal" value={String(exam.total_questions)} />
                <Info label="Percobaan" value={`${exam.attempts_used}/${exam.max_attempts}`} />
                {exam.passing_grade > 0 && <Info label="KKM" value={String(exam.passing_grade)} />}
              </dl>

              {exam.best_score !== null && exam.status_for_me !== 'can_start' && (
                <p className="mt-3 inline-flex w-fit items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 ring-1 ring-emerald-200/60 dark:ring-emerald-500/20">
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
    <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
      <Clock3 className="h-3 w-3 shrink-0 text-slate-300 dark:text-slate-500" />
      <span className="truncate"><span className="font-medium text-slate-700 dark:text-slate-200">{value}</span></span>
      <dt className="sr-only">{label}</dt>
    </div>
  )
}
