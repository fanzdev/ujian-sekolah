import { Link } from 'react-router-dom'
import {
  CalendarDays, PlayCircle, ClipboardCheck, IdCard, Clock3,
  CheckCircle2, AlertCircle, Hourglass, TrendingUp,
} from 'lucide-react'
import { useAsync, useDocumentTitle } from '@/hooks/useAsync'
import { useAuth } from '@/hooks/useAuth'
import { PageHeader, StatCard } from '@/components/ui/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback'
import { AreaChart, DonutChart } from '@/components/charts'
import { getStudentByProfile } from '@/services/academics.service'
import { listAvailableExams, getMyAttempts } from '@/services/attempts.service'
import { formatNumber } from '@/lib/utils'
import { formatDateTime as fmtDT } from '@/lib/datetime'
import { AVAILABLE_EXAM_STATUS_LABELS } from '@/lib/constants'

export default function StudentDashboard() {
  useDocumentTitle('Beranda Siswa')
  const { profile } = useAuth()
  const query = useAsync(
    async () => {
      const [studentInfo, exams, attempts] = await Promise.all([
        profile ? getStudentByProfile(profile.id) : Promise.resolve(null),
        listAvailableExams(),
        getMyAttempts(),
      ])
      return { studentInfo, exams, attempts }
    },
    [profile?.id],
  )

  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />
  const d = query.data

  const canStart = (d?.exams ?? []).filter((e) => e.status_for_me === 'can_start' || e.status_for_me === 'resume')
  const upcoming = (d?.exams ?? []).filter((e) => e.status_for_me === 'upcoming')
  const doneAttempts = (d?.attempts ?? []).filter((a) => a.status !== 'in_progress' && a.status !== 'cancelled')

  // ---- grafik perkembangan nilai (kronologis) ----
  const scoreTrend = [...doneAttempts]
    .reverse()
    .map((a, i) => ({
      label: `U${i + 1}`,
      value: a.results?.[0]?.final_score !== null && a.results?.[0]?.final_score !== undefined
        ? Math.round(Number(a.results![0].final_score) * 10) / 10
        : 0,
    }))
    .slice(-10)

  // ---- kualitas jawaban agregat ----
  let correct = 0
  let wrong = 0
  let empty = 0
  for (const a of doneAttempts) {
    const r = a.results?.[0]
    if (!r) continue
    correct += r.correct_count ?? 0
    wrong += r.wrong_count ?? 0
    empty += r.unanswered_count ?? 0
  }
  const totalAnswered = correct + wrong + empty

  // ---- durasi pengerjaan (menit) 5 terakhir ----
  const durations = doneAttempts
    .filter((a) => a.results?.[0]?.duration_seconds != null)
    .slice(0, 5)
    .map((a, i) => ({
      label: (a.exams?.title ?? `Ujian`).split(' ').slice(0, 2).join(' ') || `#${i + 1}`,
      value: Math.max(1, Math.round((a.results![0].duration_seconds ?? 0) / 60)),
      hint: fmtDT(a.submitted_at),
    }))
    .reverse()

  const lastScore = doneAttempts.find(
    (a) => a.results?.[0]?.final_score !== null && a.results?.[0]?.final_score !== undefined,
  )

  return (
    <>
      <PageHeader
        title={`Halo${profile ? `, ${profile.full_name.split(' ')[0]}` : ''}`}
        subtitle={
          d?.studentInfo
            ? `${d.studentInfo.classes?.name ?? 'Tanpa kelas'}${d.studentInfo.nis ? ` · NIS ${d.studentInfo.nis}` : ''}`
            : 'Satu akun untuk semua ujian Anda'
        }
        icon={<IdCard className="h-5 w-5" />}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Bisa Dikerjakan" value={canStart.length} icon={<PlayCircle className="h-5 w-5" />} tone="green" hint={canStart.some((e) => e.status_for_me === 'resume') ? 'Ada yang belum selesai!' : undefined} />
        <StatCard label="Akan Datang" value={upcoming.length} icon={<Hourglass className="h-5 w-5" />} tone="amber" />
        <StatCard label="Sudah Dikerjakan" value={doneAttempts.length} icon={<ClipboardCheck className="h-5 w-5" />} tone="blue" />
        <StatCard label="Nilai Terakhir" value={lastScore ? formatNumber(Number(lastScore.results![0].final_score), 1) : '-'} icon={<TrendingUp className="h-5 w-5" />} tone="purple" />
      </div>

      {/* ---------- Grafik ---------- */}
      {(scoreTrend.length > 0 || totalAnswered > 0) && (
        <section className="mt-6 sm:mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-400 sm:mb-4">
            <TrendingUp className="h-4 w-4" /> Statistik Pribadi
          </h2>

          <div className="grid gap-3 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="card min-w-0 p-4 animate-fade-in sm:p-5 sm:lg:col-span-2">
              <div className="mb-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Perkembangan Nilai</h3>
                <p className="mt-0.5 text-xs text-slate-400">Nilai akhir per ujian yang sudah dikumpulkan</p>
              </div>
              <AreaChart points={scoreTrend.length > 0 ? scoreTrend : [{ label: '-', value: 0 }]} height={185} yMinZero={false} />
            </div>

            <div className="card min-w-0 p-4 animate-fade-in sm:p-5">
              <div className="mb-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Kualitas Jawaban</h3>
                <p className="mt-0.5 text-xs text-slate-400">Akumulasi seluruh soal objektif</p>
              </div>
              {totalAnswered > 0 ? (
                <DonutChart
                  centerTop={`${totalAnswered > 0 ? Math.round((correct / totalAnswered) * 100) : 0}%`}
                  centerBottom="ketepatan"
                  segments={[
                    { label: 'Benar', value: correct, color: '#10b981' },
                    { label: 'Salah', value: wrong, color: '#f43f5e' },
                    { label: 'Kosong', value: empty, color: '#94a3b8' },
                  ]}
                />
              ) : (
                <p className="py-12 text-center text-xs text-slate-300 dark:text-slate-600">
                  Kerjakan ujian pertama Anda untuk melihat statistik.
                </p>
              )}
            </div>
          </div>

          {durations.length > 0 && (
            <div className="card mt-3 min-w-0 p-4 animate-fade-in sm:mt-5 sm:p-5">
              <div className="mb-3 flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-slate-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Durasi Pengerjaan Terakhir</h3>
              </div>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3">
                {durations.map((x, i) => (
                  <li key={i} className="rounded-xl bg-slate-50 px-3 py-3 text-center dark:bg-slate-800/50">
                    <p className="truncate text-[11px] font-medium text-slate-400">{x.label}</p>
                    <p className="mt-1 text-lg font-extrabold tabular-nums text-slate-900 dark:text-white">{x.value}<span className="text-xs font-semibold text-slate-400"> mnt</span></p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ---------- List ujian & riwayat ---------- */}
      <div className="mt-6 grid gap-3 sm:mt-8 sm:gap-5 lg:grid-cols-3">
        <div className="space-y-3 sm:space-y-5 lg:col-span-2">
          <Card className="min-w-0">
            <CardHeader
              title="Ujian untuk Anda"
              subtitle="Daftar ujian sesuai kelas & jurusan"
              action={
                <div className="flex items-center gap-2">
                  <Link to="/student/card" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-primary-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-primary-400 sm:text-xs">
                    <IdCard className="h-3.5 w-3.5" /> Cetak
                  </Link>
                  <Link to="/student/exams" className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700">Semua <CalendarDays className="h-3 w-3" /></Link>
                </div>
              }
            />
            {!d ? (
              <TableSkeleton rows={3} cols={3} />
            ) : canStart.length === 0 && upcoming.length === 0 ? (
              <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="Tidak ada ujian aktif" description="Ujian baru akan muncul di sini ketika guru menugaskannya ke kelas/jurusan Anda." />
            ) : (
              <ul className="divide-y divide-slate-50 dark:divide-slate-800">
                {[...canStart, ...upcoming].slice(0, 5).map((exam) => (
                  <li key={exam.id}>
                    <Link to={`/student/exams/${exam.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                        exam.status_for_me === 'resume' ? 'bg-rose-50 text-rose-500 animate-pulse-soft'
                          : exam.status_for_me === 'can_start' ? 'bg-emerald-50 text-emerald-500'
                            : 'bg-sky-50 text-sky-500'
                      }`}>
                        {exam.status_for_me === 'resume' ? <AlertCircle className="h-5 w-5" /> : exam.status_for_me === 'can_start' ? <PlayCircle className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{exam.title}</span>
                        <span className="block truncate text-xs text-slate-400">{exam.subject_name ?? '-'} · {fmtDT(exam.starts_at)}</span>
                      </span>
                      <Badge tone={exam.status_for_me === 'resume' ? 'red' : exam.status_for_me === 'can_start' ? 'green' : 'sky'}>
                        {AVAILABLE_EXAM_STATUS_LABELS[exam.status_for_me]}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

          <Card className="h-fit">
          <CardHeader title="Riwayat Terakhir" action={<Link to="/student/history" className="text-xs font-semibold text-primary-600 hover:text-primary-700">Detail</Link>} />
          {(d?.attempts ?? []).length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-400">Belum ada riwayat ujian.</p>
          ) : (
            <ul className="divide-y divide-slate-50 dark:divide-slate-800">
              {(d?.attempts ?? []).slice(0, 5).map((a) => {
                const result = a.results?.[0]
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-slate-700 dark:text-slate-200">{a.exams?.title ?? '-'}</span>
                      <span className="text-[11px] text-slate-400">{fmtDT(a.submitted_at ?? a.started_at)}</span>
                    </span>
                    {a.status === 'in_progress' ? (
                      <Badge tone="amber">Berlangsung</Badge>
                    ) : result?.final_score !== null && result?.final_score !== undefined ? (
                      <Badge tone={result.passed === true ? 'green' : result.passed === false ? 'red' : 'blue'}>
                        {formatNumber(Number(result.final_score), 1)}
                      </Badge>
                    ) : (
                      <Badge>Proses</Badge>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      {(d?.attempts ?? []).some((a) => a.status === 'in_progress') && (
        <div className="fixed inset-x-0 bottom-[100px] z-30 border-t border-amber-200 bg-amber-50 p-3 text-center safe-bottom dark:border-amber-500/30 dark:bg-amber-500/10 lg:bottom-0">
          <p className="mb-2 flex items-center justify-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300 sm:text-sm">
            <CheckCircle2 className="hidden h-4 w-4" />
            Ada ujian yang belum dikumpulkan. Selesaikan sebelum deadline!
          </p>
          <Link to="/student/exams">
            <Button size="sm">Lihat Ujian Berlangsung</Button>
          </Link>
        </div>
      )}
    </>
  )
}
