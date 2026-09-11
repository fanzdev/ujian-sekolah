import { Link } from 'react-router-dom'
import {
  LayoutDashboard, FileText, PlayCircle, CalendarClock, Users,
  PencilRuler, TrendingUp, ArrowRight, Database, FileQuestion, Shield, Award,
} from 'lucide-react'
import { useAsync, useDocumentTitle } from '@/hooks/useAsync'
import { useAuth } from '@/hooks/useAuth'
import { PageHeader, StatCard } from '@/components/ui/PageHeader'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { ErrorState, TableSkeleton } from '@/components/ui/Feedback'
import { AreaChart, BarChart, DonutChart, HBarList } from '@/components/charts'
import { listExams } from '@/services/exams.service'
import { listEssayQueue } from '@/services/grading.service'
import { supabase } from '@/services/client'
import { formatDateTime } from '@/lib/datetime'
import { formatNumber as fmtNum } from '@/lib/utils'

const DAY_LABELS = Array.from({ length: 14 }, (_, i) => {
  const d = new Date()
  d.setDate(d.getDate() - (13 - i))
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
})

function bucketByDay(isoDates: string[]): number[] {
  const buckets = new Array(14).fill(0)
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - 13)
  for (const iso of isoDates) {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) continue
    const diff = Math.floor((start.getTime() - new Date(d).setHours(0, 0, 0, 0)) / -86400000)
    if (diff < 0 || diff > 13) continue
    buckets[13 - diff]++
  }
  return buckets
}

export default function TeacherDashboard() {
  useDocumentTitle('Dashboard Guru')
  const { profile } = useAuth()
  const query = useAsync(loadTeacherStats, [])

  if (query.error && !query.data) return <ErrorState message={query.error} onRetry={query.reload} />
  const d = query.data

  return (
    <>
      <PageHeader
        title={`Assalamu'alaikum${profile ? `, ${profile.full_name.split(' ')[0]}` : ''}`}
        subtitle={new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date())}
        icon={<LayoutDashboard className="h-5 w-5" />}
      />

      {!d ? (
        <TableSkeleton rows={5} cols={4} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Ujian Saya" value={<Link to="/teacher/exams" className="hover:text-primary-600 dark:hover:text-primary-300">{d.totalExams}</Link>} icon={<FileText className="h-5 w-5" />} tone="blue" />
            <StatCard label="Sedang Aktif" value={d.activeExams} icon={<PlayCircle className="h-5 w-5 animate-pulse-soft" />} tone="green" hint={`${d.upcomingExams} mendatang`} />
            <StatCard label="Total Peserta" value={d.participants} icon={<Users className="h-5 w-5" />} tone="purple" hint={`${d.submissions} submission`} />
            <StatCard label="Bank Soal" value={d.banks} icon={<Database className="h-5 w-5" />} tone="blue" hint={`${d.questions} soal`} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Essay Belum Dinilai" value={<Link to="/teacher/grading" className="hover:text-primary-600 dark:hover:text-primary-300">{d.pendingEssays}</Link>} icon={<PencilRuler className="h-5 w-5" />} tone={d.pendingEssays > 0 ? 'rose' : 'green'} />
            <StatCard label="Sudah Dinilai" value={d.essayGraded} icon={<Award className="h-5 w-5" />} tone="green" />
            <StatCard label="Rata-rata Nilai" value={fmtNum(d.avgScore, 1)} icon={<TrendingUp className="h-5 w-5" />} tone="amber" hint={`${d.resultCount} hasil`} />
            <StatCard label="Pelanggaran" value={d.violations} icon={<Shield className="h-5 w-5" />} tone={d.violations > 0 ? 'rose' : 'green'} hint={d.violations ? 'perlu perhatian' : 'aman'} />
          </div>

          <section className="mt-6 sm:mt-8">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-400 sm:mb-4">
              <TrendingUp className="h-4 w-4" /> Analitik Mengajar · 14 Hari Terakhir
            </h2>
            <div className="grid gap-3 sm:gap-5 sm:grid-cols-2 xl:grid-cols-3">
              <div className="card min-w-0 p-4 animate-fade-in sm:p-5 sm:xl:col-span-2">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Tren Pengerjaan Ujian</h3>
                    <p className="mt-0.5 text-xs text-slate-400">Attempt siswa per hari (semua ujian Anda)</p>
                  </div>
                  <Badge tone="blue">{d.submissions} submission</Badge>
                </div>
                <AreaChart points={d.attemptTrend} height={190} />
              </div>
              <div className="card min-w-0 p-4 animate-fade-in sm:p-5">
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Status Penilaian Essay</h3>
                  <p className="mt-0.5 text-xs text-slate-400">Progress kelengkapan nilai</p>
                </div>
                <DonutChart
                  centerTop={`${d.essayGraded}/${d.essayGraded + d.pendingEssays}`}
                  centerBottom="ternilai"
                  segments={[
                    { label: 'Sudah dinilai', value: d.essayGraded, color: '#10b981' },
                    { label: 'Belum dinilai', value: d.pendingEssays, color: '#f59e0b' },
                  ]}
                />
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:mt-5 sm:gap-5 sm:grid-cols-2 xl:grid-cols-3">
              <div className="card min-w-0 p-4 animate-fade-in sm:p-5">
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Distribusi Nilai</h3>
                  <p className="mt-0.5 text-xs text-slate-400">{d.scores.length} hasil terkumpul</p>
                </div>
                {d.scoreBuckets.length > 0 ? (
                  <BarChart data={d.scoreBuckets} height={165} />
                ) : (
                  <p className="py-10 text-center text-xs text-slate-300 dark:text-slate-600">Belum ada hasil.</p>
                )}
              </div>
              <div className="card min-w-0 p-4 animate-fade-in sm:p-5 sm:xl:col-span-2">
                <div className="mb-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Tingkat Partisipasi per Ujian</h3>
                    <p className="mt-0.5 text-xs text-slate-400">Persentase peserta yang sudah mengumpulkan</p>
                  </div>
                  <Link to="/teacher/exams" className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 dark:hover:text-primary-300">
                    Kelola <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
                {d.participation.length > 0 ? (
                  <HBarList items={d.participation} suffix="%" colorClass="bg-sky-500" />
                ) : (
                  <p className="py-10 text-center text-xs text-slate-300 dark:text-slate-600">Belum ada ujian dengan peserta.</p>
                )}
              </div>
            </div>
          </section>

          <section className="mt-6 sm:mt-8">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-400 sm:mb-4">
              <FileQuestion className="h-4 w-4" /> Kesehatan Soal & Keamanan
            </h2>
            <div className="grid gap-3 sm:gap-5 sm:grid-cols-2 xl:grid-cols-3">
              <div className="card min-w-0 p-4 animate-fade-in sm:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Bank & Soal Anda</h3>
                    <p className="mt-0.5 text-xs text-slate-400">{d.banks} bank · {d.questions} soal</p>
                  </div>
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-500/15"><Database className="h-4 w-4" /></span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2.5 dark:bg-emerald-500/10">
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Soal Pilihan Ganda</span>
                    <span className="text-sm font-black text-emerald-700">{d.qByType.multiple_choice ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2.5 dark:bg-amber-500/10">
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Essay / Isian</span>
                    <span className="text-sm font-black text-amber-700">{(d.qByType.essay ?? 0) + (d.qByType.short_answer ?? 0)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-white/5">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Rata-rata per bank</span>
                    <span className="text-sm font-black text-slate-900 dark:text-white">{d.avgPerBank}</span>
                  </div>
                </div>
              </div>
              <div className="card min-w-0 p-4 animate-fade-in sm:p-5">
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Keamanan Ujian</h3>
                  <p className="mt-0.5 text-xs text-slate-400">Pelanggaran & risk di ujian Anda</p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Total pelanggaran</span>
                    <span className={`text-sm font-black ${d.violations ? 'text-rose-600' : 'text-emerald-600'}`}>{d.violations}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                    <div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.min(100, d.violations * 8)}%`, opacity: d.violations ? 1 : 0.1 }} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2 text-center">
                    <div className="rounded-xl bg-slate-50 py-2 dark:bg-white/5">
                      <p className="text-[11px] text-slate-400">Low</p>
                      <p className="text-sm font-bold text-amber-600">{d.riskLow}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 py-2 dark:bg-white/5">
                      <p className="text-[11px] text-slate-400">Medium</p>
                      <p className="text-sm font-bold text-orange-600">{d.riskMedium}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 py-2 dark:bg-white/5">
                      <p className="text-[11px] text-slate-400">High</p>
                      <p className="text-sm font-bold text-rose-600">{d.riskHigh}</p>
                    </div>
                  </div>
                  <Link to="/teacher/exams" className="mt-2 flex items-center justify-center gap-1 rounded-xl bg-primary-600 px-3 py-2 text-xs font-bold text-white hover:bg-primary-700">
                    <Shield className="h-3.5 w-3.5" /> Monitoring
                  </Link>
                </div>
              </div>
              <div className="card min-w-0 p-4 animate-fade-in sm:p-5">
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Aksi Cepat</h3>
                  <p className="mt-0.5 text-xs text-slate-400">Kelola dengan satu klik</p>
                </div>
                <div className="space-y-2.5">
                  <QuickAction to="/teacher/question-banks" icon={<PencilRuler className="h-4 w-4" />} label="Kelola Bank Soal" />
                  <QuickAction to="/teacher/exams" icon={<CalendarClock className="h-4 w-4" />} label="Buat / Atur Ujian" />
                  <QuickAction to="/teacher/grading" icon={<FileQuestion className="h-4 w-4" />} label={`Penilaian Essay ${d.pendingEssays ? `• ${d.pendingEssays}` : ''}`} />
                </div>
              </div>
            </div>
          </section>

          <div className="mt-6 grid gap-3 sm:mt-8 sm:gap-5 lg:grid-cols-3">
            <Card className="min-w-0 lg:col-span-2">
              <CardHeader
                title="Ujian Saya Terbaru"
                action={<Link to="/teacher/exams" className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 dark:hover:text-primary-300">Semua Ujian <ArrowRight className="h-3 w-3" /></Link>}
              />
              {d.recentExams.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-slate-400 sm:px-5">
                  Belum ada ujian. Mulai dengan membuat ujian dari bank soal Anda.
                </p>
              ) : (
                <ul className="divide-y divide-slate-50 dark:divide-slate-800">
                  {d.recentExams.map((e) => {
                    const now = Date.now()
                    const ongoing = e.status === 'published' && now >= new Date(e.starts_at).getTime() && now <= new Date(e.ends_at).getTime()
                    return (
                      <li key={e.id}>
                        <Link to={`/teacher/exams/${e.id}/participants`} className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50 sm:px-5 dark:hover:bg-slate-800/40 dark:bg-slate-800 dark:text-slate-200">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{e.title}</span>
                            <span className="text-[11px] text-slate-400">{formatDateTime(e.starts_at)}</span>
                          </span>
                          {ongoing ? (
                            <Badge tone="green" dot>AKTIF</Badge>
                          ) : now < new Date(e.starts_at).getTime() ? (
                            <Badge tone="sky">MENDATANG</Badge>
                          ) : (
                            <Badge>SELESAI</Badge>
                          )}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>

            <div className="space-y-5">
              <Card>
                <CardHeader title="Ringkasan Nilai" />
                <CardBody>
                  <div className="flex items-baseline gap-2">
                    <p className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">{fmtNum(d.avgScore, 1)}</p>
                    <TrendingUp className="h-5 w-5 text-emerald-500" />
                  </div>
                  <p className="mt-1 text-xs text-slate-400">rata-rata dari {d.resultCount} hasil terkumpul</p>
                  {d.avgScore > 0 && (
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-emerald-500" style={{ width: `${Math.min(100, d.avgScore)}%` }} />
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  )
}

async function loadTeacherStats() {
  const exams = await listExams({ pageSize: 100 })
  const examIds = exams.rows.map((e) => e.id)

  let participants = 0
  let submissions = 0
  let pendingEssays = 0
  let essayGraded = 0
  const scores: number[] = []
  const attemptDates: string[] = []
  const perExamSub: Record<string, number> = {}

  const banksQ = await supabase.from('question_banks').select('id', { count: 'exact', head: true })
  const banks = banksQ.count ?? 0
  const questionsQ = await supabase.from('questions').select('id, type').limit(2000)
  const questions = (questionsQ.data ?? []) as unknown as { type: string }[]
  const qByType: Record<string, number> = {}
  for (const q of questions) qByType[q.type] = (qByType[q.type] ?? 0) + 1
  const avgPerBank = banks ? Math.round((questions.length / banks) * 10) / 10 : 0

  let secQ: unknown[] = []
  try {
    const { data } = await supabase.from('security_events').select('event_type').limit(200)
    secQ = data ?? []
  } catch { secQ = [] }
  const riskLow = (secQ as unknown as { event_type: string }[]).filter(e => ['TAB_SWITCH','PAGE_BLUR'].includes(e.event_type)).length
  const riskMedium = (secQ as unknown as { event_type: string }[]).filter(e => e.event_type === 'FULLSCREEN_EXIT').length
  const riskHigh = (secQ as unknown as { event_type: string }[]).filter(e => ['MULTIPLE_DEVICE','DEVICE_CHANGE'].includes(e.event_type)).length
  let violations = 0
  try {
    const { count } = await supabase.from('exam_violations').select('id', { count: 'exact', head: true })
    violations = count ?? 0
  } catch { violations = 0 }

  if (examIds.length > 0) {
    const [{ count: pCount }, attemptsRes] = await Promise.all([
      supabase.from('exam_participants').select('student_id', { count: 'exact', head: true }).in('exam_id', examIds),
      supabase
        .from('exam_attempts')
        .select('id, status, started_at, exam_id, results(final_score)')
        .in('exam_id', examIds)
        .gte('started_at', new Date(Date.now() - 27 * 86400000).toISOString())
        .limit(2000),
    ])
    participants = pCount ?? 0

    const attempts = (attemptsRes.data ?? []) as unknown as {
      id: string; status: string; started_at: string; exam_id: string;
      results?: { final_score: number | null }[] | null
    }[]

    for (const a of attempts) {
      attemptDates.push(a.started_at)
      perExamSub[a.exam_id] = (perExamSub[a.exam_id] ?? 0) + 1
      if (a.status !== 'in_progress') submissions++
      const score = a.results?.[0]?.final_score
      if (score !== null && score !== undefined) scores.push(Number(score))
    }

    if (submissions > 0) {
      const queue = await listEssayQueue({})
      for (const r of queue) {
        if (!attemptIdsHas(attempts, r.attempt_id)) continue
        if (r.status === 'graded') essayGraded++
        else pendingEssays++
      }
    }
  }

  const perExamTotal: Record<string, number> = {}
  if (examIds.length > 0) {
    const { data: parts } = await supabase
      .from('exam_participants')
      .select('exam_id')
      .in('exam_id', examIds)
      .eq('is_removed', false)
      .limit(5000)
    for (const p of (parts ?? []) as { exam_id: string }[]) {
      perExamTotal[p.exam_id] = (perExamTotal[p.exam_id] ?? 0) + 1
    }
  }

  const participation = exams.rows
    .map((e) => {
      const total = perExamTotal[e.id] ?? 0
      const sub = perExamSub[e.id] ?? 0
      return {
        label: e.title.slice(0, 34),
        value: total > 0 ? Math.round((sub / total) * 100) : 0,
        hint: `${sub}/${total}`,
      }
    })
    .filter((x) => x.value > 0 || x.hint !== '0/0')
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  const scoreBuckets = [
    { label: '0–20', value: scores.filter((s) => s < 20).length },
    { label: '20–40', value: scores.filter((s) => s >= 20 && s < 40).length },
    { label: '40–60', value: scores.filter((s) => s >= 40 && s < 60).length },
    { label: '60–80', value: scores.filter((s) => s >= 60 && s < 80).length },
    { label: '80–100', value: scores.filter((s) => s >= 80).length },
  ].filter((b) => b.value > 0)

  const trendVals = bucketByDay(attemptDates)

  return {
    totalExams: exams.total,
    activeExams: exams.rows.filter((e) => e.status === 'published' && Date.now() >= new Date(e.starts_at).getTime() && Date.now() <= new Date(e.ends_at).getTime()).length,
    upcomingExams: exams.rows.filter((e) => Date.now() < new Date(e.starts_at).getTime() && e.status !== 'completed').length,
    participants,
    submissions,
    pendingEssays,
    essayGraded,
    banks,
    questions: questions.length,
    qByType,
    avgPerBank,
    violations,
    riskLow, riskMedium, riskHigh,
    avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    resultCount: scores.length,
    scores,
    recentExams: exams.rows.slice(0, 6),
    attemptTrend: DAY_LABELS.map((label, i) => ({ label, value: trendVals[i] })),
    scoreBuckets,
    participation,
  }
}

function attemptIdsHas(attempts: { id: string }[], id: string): boolean {
  return attempts.some((a) => a.id === id)
}

function QuickAction({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="card flex items-center gap-3 p-4 text-sm font-semibold text-slate-700 transition-all hover:border-primary-200 hover:text-primary-700 hover:shadow-card-hover dark:text-slate-200 dark:hover:border-primary-700 dark:hover:text-primary-300">
      <span className="text-primary-500">{icon}</span>
      {label}
      <ArrowRight className="ml-auto h-4 w-4 text-slate-300" />
    </Link>
  )
}
