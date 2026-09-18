import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays, PlayCircle, ClipboardCheck, IdCard, Clock3,
  AlertCircle, Hourglass, TrendingUp, ShieldAlert, Award, Target, BookOpen,
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

  const d = query.data
  const inProgressAttempts = (d?.attempts ?? []).filter((a) => a.status === 'in_progress' && (a.exams as unknown as { status?: string } | null)?.status === 'published')
  const [showIncompletePopup, setShowIncompletePopup] = useState(false)
  useEffect(() => {
    if (inProgressAttempts.length > 0) {
      const timer = window.setTimeout(() => setShowIncompletePopup(true), 600)
      return () => window.clearTimeout(timer)
    } else {
      setShowIncompletePopup(false)
    }
  }, [inProgressAttempts.length])

  useEffect(() => {
    if (!showIncompletePopup) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowIncompletePopup(false)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [showIncompletePopup])

  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />

  const canStart = (d?.exams ?? []).filter((e) => e.status_for_me === 'can_start' || e.status_for_me === 'resume')
  const upcoming = (d?.exams ?? []).filter((e) => e.status_for_me === 'upcoming')
  const doneAttempts = (d?.attempts ?? []).filter((a) => a.status !== 'in_progress' && a.status !== 'cancelled')
  const scorableAttempts = doneAttempts.filter((a) => (a.exams as unknown as { show_result_to_student?: boolean } | null)?.show_result_to_student !== false)

  const scoreTrend = [...scorableAttempts]
    .reverse()
    .map((a, i) => ({
      label: `U${i + 1}`,
      value: a.results?.[0]?.final_score !== null && a.results?.[0]?.final_score !== undefined
        ? Math.round(Number(a.results![0].final_score) * 10) / 10
        : 0,
    }))
    .slice(-10)

  let correct = 0
  let wrong = 0
  let empty = 0
  for (const a of scorableAttempts) {
    const r = a.results?.[0]
    if (!r) continue
    correct += r.correct_count ?? 0
    wrong += r.wrong_count ?? 0
    empty += r.unanswered_count ?? 0
  }
  const totalAnswered = correct + wrong + empty
  const accuracy = totalAnswered > 0 ? Math.round((correct / totalAnswered) * 100) : 0

  const durations = doneAttempts
    .filter((a) => a.results?.[0]?.duration_seconds != null)
    .slice(0, 5)
    .map((a, i) => ({
      label: (a.exams?.title ?? `Ujian`).split(' ').slice(0, 2).join(' ') || `#${i + 1}`,
      value: Math.max(1, Math.round((a.results![0].duration_seconds ?? 0) / 60)),
      hint: fmtDT(a.submitted_at),
    }))
    .reverse()

  const lastScore = scorableAttempts.find(
    (a) => a.results?.[0]?.final_score !== null && a.results?.[0]?.final_score !== undefined,
  )
  const avgScore = scorableAttempts.length > 0 ? scorableAttempts.reduce((sum, a) => sum + Number(a.results?.[0]?.final_score ?? 0), 0) / scorableAttempts.length : 0
  const todayLabel = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date())

  return (
    <>
      <PageHeader
        title={`Halo${profile ? `, ${profile.full_name}` : ''}`}
        subtitle={
          d?.studentInfo
            ? `${d.studentInfo.classes?.name ?? 'Tanpa kelas'}${d.studentInfo.nis ? ` · NIS ${d.studentInfo.nis}` : ''} · ${todayLabel}`
            : todayLabel
        }
        icon={<IdCard className="h-5 w-5" />}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Dapat Dikerjakan" value={canStart.length} icon={<PlayCircle className="h-5 w-5" />} tone="green" hint={canStart.some((e) => e.status_for_me === 'resume') ? 'Ada yang belum selesai' : 'Siap dikerjakan'} />
        <StatCard label="Akan Datang" value={upcoming.length} icon={<Hourglass className="h-5 w-5" />} tone="amber" hint="Terjadwal" />
        <StatCard label="Selesai" value={doneAttempts.length} icon={<ClipboardCheck className="h-5 w-5" />} tone="blue" hint="Terkumpul" />
        <StatCard label="Nilai Terakhir" value={lastScore ? formatNumber(Number(lastScore.results![0].final_score), 1) : '-'} icon={<TrendingUp className="h-5 w-5" />} tone="purple" hint="Skala 0-100" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Rata-rata Nilai" value={avgScore ? formatNumber(avgScore, 1) : '-'} icon={<Award className="h-5 w-5" />} tone="amber" hint={`${scorableAttempts.length} ujian dinilai`} />
        <StatCard label="Ketepatan Jawaban" value={`${accuracy}%`} icon={<Target className="h-5 w-5" />} tone={accuracy >= 70 ? 'green' : accuracy >= 50 ? 'amber' : 'rose'} hint={`${correct} benar dari ${totalAnswered}`} />
        <StatCard label="Soal Terjawab" value={totalAnswered} icon={<BookOpen className="h-5 w-5" />} tone="blue" hint={`${d?.exams.length ?? 0} ujian tersedia`} />
        <StatCard label="Perlu Perhatian" value={inProgressAttempts.length} icon={<AlertCircle className="h-5 w-5" />} tone={inProgressAttempts.length > 0 ? 'rose' : 'green'} hint={inProgressAttempts.length > 0 ? 'Selesaikan segera' : 'Tidak ada'} />
      </div>

      {(scoreTrend.length > 0 || totalAnswered > 0) && (
        <section className="mt-6 sm:mt-8">
          <h2 className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400 sm:mb-4">
            Ringkasan Belajar
          </h2>
          <div className="grid gap-3 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="card min-w-0 p-4 sm:p-5 sm:lg:col-span-2">
              <div className="mb-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Perkembangan Nilai</h3>
                <p className="mt-0.5 text-xs text-slate-400">Nilai akhir per ujian, skala 0-100</p>
              </div>
              <AreaChart points={scoreTrend.length > 0 ? scoreTrend : [{ label: '-', value: 0 }]} height={185} yMinZero={false} />
            </div>
            <div className="card min-w-0 p-4 sm:p-5">
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
                  Kerjakan ujian pertama Anda untuk melihat ringkasan.
                </p>
              )}
            </div>
          </div>
          {durations.length > 0 && (
            <div className="card mt-3 min-w-0 p-4 sm:mt-5 sm:p-5">
              <div className="mb-3 flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-slate-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Durasi Pengerjaan Terakhir</h3>
              </div>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3">
                {durations.map((x, i) => (
                  <li key={i} className="rounded-xl bg-slate-50 px-3 py-3 text-center dark:bg-slate-800/50">
                    <p className="truncate text-xs font-medium text-slate-400">{x.label}</p>
                    <p className="mt-1 text-lg font-bold tabular-nums text-slate-900 dark:text-white">{x.value}<span className="text-xs font-semibold text-slate-400"> mnt</span></p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <div className="mt-6 grid gap-3 sm:mt-8 sm:gap-5 lg:grid-cols-3">
        <div className="space-y-3 sm:space-y-5 lg:col-span-2">
          <Card className="min-w-0">
            <CardHeader
              title="Ujian untuk Anda"
              subtitle="Sesuai kelas dan penugasan guru"
              action={
                <div className="flex items-center gap-2">
                  <Link to="/student/card" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-primary-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                    <IdCard className="h-3.5 w-3.5" /> Kartu
                  </Link>
                  <Link to="/student/exams" className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700">Semua <CalendarDays className="h-3 w-3" /></Link>
                </div>
              }
            />
            {!d ? (
              <TableSkeleton rows={3} cols={3} />
            ) : canStart.length === 0 && upcoming.length === 0 ? (
              <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="Tidak ada ujian aktif" description="Ujian baru akan muncul di sini ketika guru menugaskannya ke kelas Anda." />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {[...canStart, ...upcoming].slice(0, 5).map((exam) => (
                  <li key={exam.id}>
                    <Link to={`/student/exams/${exam.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                        exam.status_for_me === 'resume' ? 'bg-rose-50 text-rose-500'
                          : exam.status_for_me === 'can_start' ? 'bg-emerald-50 text-emerald-500'
                            : 'bg-slate-100 text-slate-500'
                      }`}>
                        {exam.status_for_me === 'resume' ? <AlertCircle className="h-5 w-5" /> : exam.status_for_me === 'can_start' ? <PlayCircle className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{exam.title}</span>
                        <span className="block truncate text-xs text-slate-400">{fmtDT(exam.starts_at)}</span>
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
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {(d?.attempts ?? []).slice(0, 5).map((a) => {
                const result = a.results?.[0]
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-700 dark:text-slate-200">{a.exams?.title ?? '-'}</span>
                      <span className="text-xs text-slate-400">{fmtDT(a.submitted_at ?? a.started_at)}</span>
                    </span>
                    {a.status === 'in_progress' ? (
                      <Badge tone="amber">Berlangsung</Badge>
                    ) : (a.exams as unknown as { show_result_to_student?: boolean } | null)?.show_result_to_student === false ? (
                      <Badge tone="gray">Disembunyikan</Badge>
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

      {showIncompletePopup && inProgressAttempts.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Ujian belum selesai">
          <div className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm" aria-hidden onClick={() => setShowIncompletePopup(false)} />
          <div className="relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
                  <ShieldAlert className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-sm font-bold leading-tight text-slate-900 dark:text-white">Ujian Belum Selesai</h2>
                  <p className="text-xs text-slate-400">{inProgressAttempts.length} ujian perlu diselesaikan</p>
                </div>
              </div>
              <button onClick={() => setShowIncompletePopup(false)} aria-label="Tutup" className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="overflow-y-auto">
              <div className="space-y-4 px-6 py-5">
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 dark:border-amber-800/30 dark:bg-amber-500/10">
                  <p className="flex items-center gap-2 text-sm font-bold text-amber-800 dark:text-amber-200">
                    <Clock3 className="h-4 w-4" /> Selesaikan sebelum batas waktu
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-amber-700 dark:text-amber-200/80">
                    Waktu tetap berjalan. Jika habis, jawaban otomatis dikumpulkan.
                  </p>
                </div>

                <div className="space-y-2.5">
                  {inProgressAttempts.slice(0, 3).map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 dark:border-slate-700 dark:bg-slate-800/40">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold leading-tight text-slate-800 dark:text-slate-100">{a.exams?.title ?? 'Ujian'}</p>
                        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-400"><Clock3 className="h-3 w-3 shrink-0" /> Mulai {fmtDT(a.started_at)}</p>
                      </div>
                      <Link to={`/exam/${a.id}`} className="shrink-0" onClick={() => setShowIncompletePopup(false)}>
                        <Button size="sm" variant="primary" className="shadow-sm" icon={<PlayCircle className="h-4 w-4" />}>Lanjutkan</Button>
                      </Link>
                    </div>
                  ))}
                  {inProgressAttempts.length > 3 && (
                    <p className="text-center text-xs font-medium text-slate-400">+{inProgressAttempts.length - 3} ujian lainnya</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2.5 border-t border-slate-100 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-800/50 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setShowIncompletePopup(false)} className="w-full sm:w-auto order-2 sm:order-1">Nanti</Button>
              <Link to="/student/exams" onClick={() => setShowIncompletePopup(false)} className="w-full sm:w-auto order-1 sm:order-2">
                <Button variant="primary" className="w-full sm:w-auto shadow-sm">Lihat Semua Ujian</Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
