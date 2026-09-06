import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays, PlayCircle, ClipboardCheck, IdCard, Clock3,
  AlertCircle, Hourglass, TrendingUp, ShieldAlert, Flame, Zap, Check, Sparkles,
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
import { useToast } from '@/hooks/useToast'

function getWibTodayYmd(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function loadStreak(profileId: string): { count: number; lastDate: string | null; longest: number } {
  try {
    const raw = localStorage.getItem(`streak-${profileId}`)
    if (raw) {
      const parsed = JSON.parse(raw) as { count?: number; lastDate?: string | null; longest?: number }
      return { count: Number(parsed.count) || 0, lastDate: parsed.lastDate ?? null, longest: Number(parsed.longest) || 0 }
    }
  } catch { /* ignore */ }
  return { count: 0, lastDate: null, longest: 0 }
}

function saveStreak(profileId: string, data: { count: number; lastDate: string | null; longest: number }) {
  try {
    localStorage.setItem(`streak-${profileId}`, JSON.stringify(data))
  } catch { /* ignore */ }
}

function StreakCard({ profileId }: { profileId: string }) {
  const toast = useToast()
  const [count, setCount] = useState(() => loadStreak(profileId).count)
  const [lastDate, setLastDate] = useState<string | null>(() => loadStreak(profileId).lastDate)
  const [longest, setLongest] = useState(() => loadStreak(profileId).longest)
  const today = getWibTodayYmd()
  const yesterday = (() => {
    const d = new Date(`${today}T00:00:00+07:00`)
    d.setDate(d.getDate() - 1)
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  })()
  const alreadyClaimed = lastDate === today
  const streakBroken = lastDate !== null && lastDate !== today && lastDate !== yesterday

  const handleClaim = () => {
    if (alreadyClaimed) return
    let nextCount: number
    if (lastDate === yesterday) nextCount = count + 1
    else if (lastDate === today) nextCount = count
    else if (count === 0 || streakBroken) nextCount = 1
    else nextCount = count + 1
    const nextLongest = Math.max(longest, nextCount)
    const next = { count: nextCount, lastDate: today, longest: nextLongest }
    saveStreak(profileId, next)
    setCount(nextCount)
    setLastDate(today)
    setLongest(nextLongest)
    toast.success(nextCount === 1 && streakBroken ? 'Streak dimulai kembali! 🔥' : nextCount === 1 ? 'Streak dimulai! 🔥' : `Streak ${nextCount} hari! 🔥`)
  }

  const weekDots = (() => {
    const dots: { date: string; label: string; active: boolean; isToday: boolean }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(`${today}T00:00:00+07:00`)
      d.setDate(d.getDate() - i)
      const ymd = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
      const label = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short' }).format(d).slice(0, 2)
      const isToday = ymd === today
      let active = false
      if (alreadyClaimed) {
        if (count > 0) {
          const last = new Date(`${today}T00:00:00+07:00`)
          for (let k = 0; k < count && k < 7; k++) {
            const c = new Date(last)
            c.setDate(last.getDate() - k)
            const cy = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(c)
            if (cy === ymd) active = true
          }
        }
      } else {
        if (count > 0 && lastDate === yesterday) {
          const last = new Date(`${yesterday}T00:00:00+07:00`)
          for (let k = 0; k < count && k < 7; k++) {
            const c = new Date(last)
            c.setDate(last.getDate() - k)
            const cy = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(c)
            if (cy === ymd) active = true
          }
        }
      }
      dots.push({ date: ymd, label, active, isToday })
    }
    return dots
  })()

  return (
    <div className="relative overflow-hidden rounded-[20px] border border-white/15 shadow-xl" style={{ background: 'var(--app-gradient, linear-gradient(135deg, #f97316 0%, #ef4444 50%, #ec4899 100%))' }}>
      <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" aria-hidden />
      <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-white/5 blur-xl" aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.07] via-transparent to-black/10" aria-hidden />
      <div className="relative px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex gap-3.5 sm:gap-4">
          <div className="relative shrink-0">
            <div className="flex h-[56px] w-[56px] items-center justify-center rounded-[18px] bg-white shadow-[0_8px_20px_-8px_rgba(0,0,0,0.35)] ring-1 ring-white/20 sm:h-[52px] sm:w-[52px]">
              <Flame className={`h-7 w-7 ${alreadyClaimed ? 'text-orange-500 animate-pulse' : 'text-orange-500'}`} />
            </div>
            {alreadyClaimed && (
              <span className="absolute -top-1 -left-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md ring-2 ring-white">
                <Check className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="text-[15px] font-extrabold tracking-tight text-white sm:text-[16px]">Streak Api</h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-extrabold leading-none text-orange-600 shadow-sm">
                <Flame className="h-3 w-3" /> {count} hari
              </span>
              {alreadyClaimed ? (
                <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-1 text-[10px] font-bold leading-none text-white shadow-sm">
                  <Check className="h-3 w-3" /> Aktif hari ini
                </span>
              ) : (
                <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 text-[10px] font-bold leading-none text-white backdrop-blur">
                  <Sparkles className="h-3 w-3" /> Harian
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[12px] font-medium leading-snug text-white sm:text-[12.5px] sm:leading-snug">
              {alreadyClaimed ? (
                <span className="text-white">Sudah aktif hari ini · <span className="font-bold">streak {count} hari</span> terjaga 🔥</span>
              ) : streakBroken && count > 0 ? (
                <span className="text-white/95">Streak terputus di <span className="font-bold">{count} hari</span> · mulai lagi sekarang!</span>
              ) : count === 0 ? (
                <span className="text-white/95">Mulai streak harianmu — nyalakan tiap hari tanpa putus ✨</span>
              ) : (
                <span className="text-white/95">Lanjutkan <span className="font-bold">streak {count} hari</span> · klaim hari ini biar makin panjang!</span>
              )}
            </p>
          </div>
          <button
            onClick={handleClaim}
            disabled={alreadyClaimed}
            className={`hidden shrink-0 items-center justify-center gap-1.5 rounded-xl px-5 py-3 text-sm font-extrabold shadow-[0_8px_20px_-8px_rgba(0,0,0,0.35)] transition-all active:scale-[0.98] sm:inline-flex ${alreadyClaimed ? 'bg-white/15 text-white/60 cursor-not-allowed backdrop-blur' : 'bg-white text-orange-600 hover:bg-white hover:shadow-xl hover:-translate-y-0.5'}`}
          >
            {alreadyClaimed ? 'Sudah Aktif ✓' : <><Zap className="h-4 w-4" /> Nyalakan Hari Ini</>}
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between gap-1.5 rounded-2xl bg-white/10 p-2.5 backdrop-blur-md ring-1 ring-white/10 sm:mt-4 sm:p-3">
          {weekDots.map((d) => (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <span className={`text-[10px] font-semibold leading-none ${d.isToday ? 'text-white' : 'text-white/60'}`}>{d.label}</span>
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shadow-sm transition-all sm:h-9 sm:w-9 ${
                  d.active
                    ? 'bg-white text-orange-600 shadow-md scale-105 ring-2 ring-white/30'
                    : d.isToday
                      ? 'bg-white/20 text-white ring-1 ring-white/30 backdrop-blur'
                      : 'bg-white/10 text-white/50 ring-1 ring-white/5'
                }`}
              >
                {d.active ? <Flame className="h-4 w-4" /> : <span className="text-[11px]">•</span>}
              </span>
            </div>
          ))}
        </div>

        <button
          onClick={handleClaim}
          disabled={alreadyClaimed}
          className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-extrabold shadow-lg transition-all active:scale-[0.98] sm:hidden ${alreadyClaimed ? 'bg-white/15 text-white/70 backdrop-blur ring-1 ring-white/15' : 'bg-white text-orange-600 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.35)]'}`}
        >
          {alreadyClaimed ? (
            <>
              <Check className="h-4 w-4" /> Sudah Aktif Hari Ini
            </>
          ) : (
            <>
              <Zap className="h-4 w-4" /> Nyalakan Streak Hari Ini
            </>
          )}
        </button>
        {!alreadyClaimed && (
          <p className="mt-2 text-center text-[10px] font-medium leading-none text-white/70 sm:hidden">Klaim tiap hari · jangan sampai putus 🔥</p>
        )}
      </div>
    </div>
  )
}

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

  // ---- grafik perkembangan nilai (kronologis) ----
  const scoreTrend = [...scorableAttempts]
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
  for (const a of scorableAttempts) {
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

  const lastScore = scorableAttempts.find(
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

      {profile && (
        <div className="mb-4 sm:mb-5">
          <StreakCard profileId={profile.id} />
        </div>
      )}

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
                  <Link to="/student/card" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-primary-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-primary-400 sm:text-xs dark:hover:bg-slate-800 dark:hover:text-primary-300">
                    <IdCard className="h-3.5 w-3.5" /> Cetak
                  </Link>
                  <Link to="/student/exams" className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 dark:hover:text-primary-300">Semua <CalendarDays className="h-3 w-3" /></Link>
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
                    <Link to={`/student/exams/${exam.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40 dark:bg-slate-800 dark:text-slate-200">
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
          <CardHeader title="Riwayat Terakhir" action={<Link to="/student/history" className="text-xs font-semibold text-primary-600 hover:text-primary-700 dark:hover:text-primary-300">Detail</Link>} />
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
          <div className="relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-scale-in dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
                  <ShieldAlert className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-sm font-bold leading-tight text-slate-900 dark:text-white">Ujian Belum Selesai</h2>
                  <p className="text-xs text-slate-400">{inProgressAttempts.length} ujian aktif perlu diselesaikan</p>
                </div>
              </div>
              <button onClick={() => setShowIncompletePopup(false)} aria-label="Tutup" className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="overflow-y-auto scrollbar-thin">
              <div className="space-y-4 px-6 py-5">
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 dark:border-amber-800/30 dark:bg-amber-500/10">
                  <p className="flex items-center gap-2 text-sm font-bold text-amber-800 dark:text-amber-200">
                    <Clock3 className="h-4 w-4" /> Selesaikan sebelum deadline
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-amber-700/90 dark:text-amber-200/80">
                    Timer tetap berjalan dan pelanggaran tetap tercatat. Jika waktu habis, jawaban otomatis dikumpulkan.
                  </p>
                </div>

                <div className="space-y-2.5">
                  {inProgressAttempts.slice(0, 3).map((a) => (
                    <div key={a.id} className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3.5 transition-colors hover:border-primary-200 hover:bg-white dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-slate-600 dark:hover:bg-slate-800">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold leading-tight text-slate-800 dark:text-slate-100 group-hover:text-primary-700 dark:group-hover:text-white">{a.exams?.title ?? 'Ujian'}</p>
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
            <div className="flex flex-col gap-2.5 border-t border-slate-100 bg-slate-50/80 px-6 py-4 dark:border-slate-800 dark:bg-slate-800/50 sm:flex-row sm:justify-end">
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
