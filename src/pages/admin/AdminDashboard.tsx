import { Link } from 'react-router-dom'
import {
  LayoutDashboard, GraduationCap, Users, School, BookOpen,
  PlayCircle, CalendarClock, ClipboardCheck, TrendingUp, ShieldAlert,
  ScrollText, ArrowRight, Activity,
} from 'lucide-react'
import { useAsync, useDocumentTitle } from '@/hooks/useAsync'
import { PageHeader, StatCard } from '@/components/ui/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { ErrorState, TableSkeleton } from '@/components/ui/Feedback'
import { AreaChart, BarChart, DonutChart, HBarList } from '@/components/charts'
import { supabase } from '@/services/client'
import { formatNumber } from '@/lib/utils'
import { relativeTime, formatDateTime as fmtDT } from '@/lib/datetime'
import { AUDIT_ACTION_LABELS, VIOLATION_TYPE_LABELS } from '@/lib/constants'

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
    const idx = 13 - diff
    if (diff >= 0 && diff <= 13 && idx >= 0 && idx <= 13) buckets[idx]++
  }
  return buckets
}

export default function AdminDashboard() {
  useDocumentTitle('Dashboard Admin')
  const query = useAsync(loadDashboard, [])

  if (query.error && !query.data) return <ErrorState message={query.error} onRetry={query.reload} />

  const d = query.data

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date())}
        icon={<LayoutDashboard className="h-5 w-5" />}
      />

      {!d ? (
        <TableSkeleton rows={6} cols={4} />
      ) : (
        <>
          {/* ---------- Statistik utama ---------- */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Total Siswa" value={d.students} icon={<GraduationCap className="h-5 w-5" />} tone="blue" hint={`${d.activeStudents} aktif`} />
            <StatCard label="Total Guru" value={d.teachers} icon={<Users className="h-5 w-5" />} tone="purple" />
            <StatCard label="Kelas / Jurusan" value={`${d.classes} / ${d.departments}`} icon={<School className="h-5 w-5" />} tone="amber" />
            <StatCard label="Mata Pelajaran" value={d.subjects} icon={<BookOpen className="h-5 w-5" />} tone="green" />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Ujian Aktif" value={<Link to="/admin/exams" className="hover:text-primary-600">{d.examsActive}</Link>} icon={<PlayCircle className="h-5 w-5 animate-pulse-soft" />} tone="green" />
            <StatCard label="Ujian Mendatang" value={d.examsUpcoming} icon={<CalendarClock className="h-5 w-5" />} tone="amber" />
            <StatCard label="Submission" value={d.submissions} icon={<ClipboardCheck className="h-5 w-5" />} tone="blue" hint={`${d.inProgress} sedang berlangsung`} />
            <StatCard label="Rata-rata Nilai" value={formatNumber(d.avgScore, 1)} icon={<TrendingUp className="h-5 w-5" />} tone="rose" hint={`Daya serap ${formatNumber(d.passRate, 0)}%`} />
          </div>

          {/* ---------- Grafik analitik ---------- */}
          <section className="mt-8">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-400">
              <Activity className="h-4 w-4" /> Analitik Sistem · 14 Hari Terakhir
            </h2>

            <div className="grid gap-3 sm:gap-5 sm:grid-cols-2 xl:grid-cols-3">
              <ChartAreaTrend data={d.attemptTrend} total={d.submissions} />

              <BarChartCard
                title="Distribusi Nilai"
                subtitle="Sebaran skor seluruh peserta"
                data={d.scoreBuckets}
                colorClass="from-primary-500 to-primary-400"
              />

              <DonutCard statuses={{ active: d.examsActive, upcoming: d.examsUpcoming, draft: d.examsDraft, done: d.examsDone }} />
            </div>

            <div className="mt-3 grid gap-3 sm:mt-5 sm:gap-5 sm:grid-cols-2 xl:grid-cols-3">
              <HBarCard title="Rata-rata Nilai per Kelas" items={d.classAverages} suffix="" colorClass="bg-emerald-500" />

              <BarChartCard
                title="Aktivitas Pengguna"
                subtitle="Jumlah aksi tercatat per hari"
                data={d.auditTrend}
                colorClass="from-violet-500 to-violet-400"
              />

              <div className="space-y-3 sm:space-y-5">
                <Card>
                  <CardHeader
                    title="Pelanggaran Terbaru"
                    action={
                      <Link to="/admin/violation-logs" className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700">
                        Semua <ArrowRight className="h-3 w-3" />
                      </Link>
                    }
                  />
                  {d.recentViolations.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-slate-400 sm:px-5">Tidak ada pelanggaran tercatat. Bagus!</p>
                  ) : (
                    <ul className="divide-y divide-slate-50 dark:divide-slate-800">
                      {d.recentViolations.map((v) => (
                        <li key={v.id} className="flex items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium text-slate-700 dark:text-slate-200">{v.students?.profiles?.full_name ?? '-'}</span>
                            <span className="text-[11px] text-slate-400">{VIOLATION_TYPE_LABELS[v.violation_type] ?? v.violation_type}</span>
                          </span>
                          <Badge tone={v.severity === 'critical' ? 'red' : v.severity === 'serious' ? 'amber' : 'gray'}>{v.severity}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <div className="grid grid-cols-2 gap-2 sm:gap-4">
                  <QuickLink to="/admin/import-export" icon={<ScrollText className="h-4 w-4" />} label="Import Data" />
                  <QuickLink to="/admin/settings" icon={<ShieldAlert className="h-4 w-4" />} label="Pengaturan" />
                </div>
              </div>
            </div>
          </section>

          {/* ---------- Feed & ujian berjalan ---------- */}
          <div className="mt-6 grid gap-3 sm:mt-8 sm:gap-5 lg:grid-cols-3">
            <Card className="min-w-0 lg:col-span-2">
              <CardHeader
                title="Aktivitas Terbaru"
                subtitle="Jejak audit seluruh sistem"
                action={
                  <Link to="/admin/audit-logs" className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700">
                    Lihat Semua <ArrowRight className="h-3 w-3" />
                  </Link>
                }
              />
              <ul className="divide-y divide-slate-50 dark:divide-slate-800">
                {d.recentActivity.length === 0 && (
                  <li className="px-4 py-10 text-center text-sm text-slate-400 sm:px-5">Belum ada aktivitas.</li>
                )}
                {d.recentActivity.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400 dark:bg-slate-800">
                      <Activity className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-slate-700 dark:text-slate-200">
                        <strong className="font-semibold">{a.profiles?.full_name ?? 'Sistem'}</strong>
                        {' · '}
                        {AUDIT_ACTION_LABELS[a.action] ?? a.action}
                      </p>
                      <p className="text-[11px] text-slate-300 dark:text-slate-500">{relativeTime(a.created_at)}</p>
                    </div>
                    <Badge tone="gray">{a.actor_role === 'admin' ? 'Admin' : a.actor_role === 'teacher' ? 'Guru' : a.actor_role === 'student' ? 'Siswa' : '-'}</Badge>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="min-w-0">
              <CardHeader title="Status Ujian Berjalan" />
              {d.runningExams.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-400 sm:px-5">Tidak ada ujian berlangsung saat ini.</p>
              ) : (
                <ul className="divide-y divide-slate-50 dark:divide-slate-800">
                  {d.runningExams.map((e) => (
                    <li key={e.id}>
                      <Link to={`/admin/exams/${e.id}/participants`} className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-emerald-50/40 sm:px-5 dark:hover:bg-emerald-500/5">
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">{e.title}</span>
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Berakhir {fmtDT(e.ends_at)}</span>
                        </span>
                        <Badge tone="green" dot>AKTIF</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  )
}

/* ---------------- Chart wrapper cards ---------------- */

function ChartAreaTrend({ data, total }: { data: { label: string; value: number }[]; total: number }) {
  return (
    <div className="card min-w-0 p-4 animate-fade-in sm:p-5">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Tren Pengerjaan Ujian</h3>
          <p className="mt-0.5 text-xs text-slate-400">Attempt dimulai per hari</p>
        </div>
        <Badge tone="blue">{total} total</Badge>
      </div>
      <AreaChart points={data} height={185} />
    </div>
  )
}

function BarChartCard({
  title,
  subtitle,
  data,
  colorClass,
}: {
  title: string
  subtitle: string
  data: { label: string; value: number }[]
  colorClass: string
}) {
  return (
    <div className="card min-w-0 p-4 animate-fade-in sm:p-5">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
        <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
      </div>
      <BarChart data={data} colorClass={colorClass} height={165} />
    </div>
  )
}

function DonutCard({ statuses }: { statuses: { active: number; upcoming: number; draft: number; done: number } }) {
  return (
    <div className="card min-w-0 p-4 animate-fade-in sm:p-5">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Komposisi Status Ujian</h3>
        <p className="mt-0.5 text-xs text-slate-400">Seluruh ujian terdaftar</p>
      </div>
      <DonutChart
        centerTop={String(statuses.active + statuses.upcoming + statuses.draft + statuses.done)}
        centerBottom="Ujian"
        segments={[
          { label: 'Aktif', value: statuses.active, color: '#10b981' },
          { label: 'Mendatang', value: statuses.upcoming, color: '#f59e0b' },
          { label: 'Draf', value: statuses.draft, color: '#94a3b8' },
          { label: 'Selesai', value: statuses.done, color: '#2563eb' },
        ]}
      />
    </div>
  )
}

function HBarCard({
  title,
  items,
  suffix,
  colorClass,
}: {
  title: string
  items: { label: string; value: number; hint?: string }[]
  suffix: string
  colorClass: string
}) {
  return (
    <div className="card min-w-0 p-4 animate-fade-in sm:p-5">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
        <p className="mt-0.5 text-xs text-slate-400">Top 5 · berdasarkan hasil terkumpul</p>
      </div>
      <HBarList items={items} suffix={suffix} colorClass={colorClass} />
    </div>
  )
}

/* ---------------- Data loader ---------------- */

async function loadDashboard() {
  const count = async (table: string, filters?: Record<string, unknown>): Promise<number> => {
    let q = supabase.from(table).select('id', { count: 'exact', head: true })
    for (const [k, v] of Object.entries(filters ?? {})) {
      q = q.eq(k, v as never)
    }
    const { count: c } = await q
    return c ?? 0
  }

  const since14 = new Date(Date.now() - 13 * 86400000).toISOString()

  const nowIso = new Date().toISOString()
  const upcomingCount = supabase
    .from('exams')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
    .gt('starts_at', nowIso)
    .then(({ count }) => count ?? 0)

  const [
    students, activeStudents, teachers, classes, departments, subjects,
    examsActive, examsDraft, examsDone, examsUpcoming,
  ] = await Promise.all([
    count('students'),
    count('students', { is_active: true }),
    count('teachers'),
    count('classes'),
    count('departments'),
    count('subjects'),
    count('exams', { status: 'published' }),
    count('exams', { status: 'draft' }),
    count('exams', { status: 'completed' }),
    upcomingCount,
  ])

  const [{ count: inProgress }, submissionsAgg] = await Promise.all([
    supabase.from('exam_attempts').select('id', { count: 'exact', head: true }).eq('status', 'in_progress'),
    supabase.from('exam_attempts').select('status', { count: 'exact' }).in('status', ['submitted', 'auto_submitted', 'graded']),
  ])

  const [{ data: attemptRows }, { data: resultRows }, { data: auditRows }] = await Promise.all([
    supabase.from('exam_attempts').select('started_at').gte('started_at', since14).limit(3000),
    supabase
      .from('exam_results')
      .select('objective_score, final_score, passed, students(classes(name))')
      .order('submitted_at', { ascending: false })
      .limit(800),
    supabase.from('audit_logs').select('created_at').gte('created_at', since14).limit(2000),
  ])

  const results = (resultRows ?? []) as unknown as {
    objective_score: number
    final_score: number | null
    passed: boolean | null
    students?: { classes?: { name?: string } | null } | null
  }[]

  const scores = results.map((r) => Number(r.final_score ?? r.objective_score)).filter((n) => !Number.isNaN(n))
  const passedCount = results.filter((r) => r.passed === true).length

  // distribusi nilai 5 bucket
  const scoreBuckets = [
    { label: '0–20', value: scores.filter((s) => s < 20).length },
    { label: '20–40', value: scores.filter((s) => s >= 20 && s < 40).length },
    { label: '40–60', value: scores.filter((s) => s >= 40 && s < 60).length },
    { label: '60–80', value: scores.filter((s) => s >= 60 && s < 80).length },
    { label: '80–100', value: scores.filter((s) => s >= 80).length },
  ]

  // rata-rata per kelas
  const classAgg: Record<string, { sum: number; n: number }> = {}
  for (const r of results) {
    const cls = r.students?.classes?.name
    if (!cls) continue
    const v = Number(r.final_score ?? r.objective_score)
    if (Number.isNaN(v)) continue
    ;(classAgg[cls] ||= { sum: 0, n: 0 })
    classAgg[cls].sum += v
    classAgg[cls].n++
  }
  const classAverages = Object.entries(classAgg)
    .map(([label, { sum, n }]) => ({ label, value: Math.round((sum / n) * 10) / 10, hint: `${n} siswa` }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)

  const [{ data: activity }, { data: violations }, { data: running }] = await Promise.all([
    supabase.from('audit_logs').select('id, action, actor_role, created_at, profiles(full_name)').order('created_at', { ascending: false }).limit(8),
    supabase.from('exam_violations').select('id, violation_type, severity, created_at, students(profiles(full_name))').order('created_at', { ascending: false }).limit(5),
    supabase.from('exams').select('id, title, ends_at').eq('status', 'published').gte('ends_at', new Date().toISOString()).lte('starts_at', new Date().toISOString()),
  ])

  return {
    students, activeStudents, teachers, classes, departments, subjects,
    examsActive,
    examsUpcoming,
    examsDraft, examsDone,
    submissions: (submissionsAgg as unknown as { count?: number } | null)?.count ?? 0,
    inProgress: inProgress ?? 0,
    avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    passRate: scores.length > 0 ? (passedCount / scores.length) * 100 : 0,
    attemptTrend: zipTrend(bucketByDay(((attemptRows ?? []) as { started_at: string }[]).map((r) => r.started_at))),
    auditTrend: zipTrend(bucketByDay(((auditRows ?? []) as { created_at: string }[]).map((r) => r.created_at))),
    scoreBuckets,
    classAverages,
    recentActivity: ((activity ?? []) as unknown) as DashboardActivity[],
    recentViolations: ((violations ?? []) as unknown) as DashboardViolation[],
    runningExams: (running ?? []) as { id: string; title: string; ends_at: string }[],
  }

  function zipTrend(buckets: number[]) {
    return DAY_LABELS.map((label, i) => ({ label, value: buckets[i] }))
  }
}

interface DashboardActivity {
  id: string
  action: string
  actor_role: string | null
  created_at: string
  profiles?: { full_name: string } | null
}

interface DashboardViolation {
  id: string
  violation_type: string
  severity: string
  created_at: string
  students?: { profiles?: { full_name: string } | null } | null
}

function QuickLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="card flex min-w-0 items-center gap-2 p-3 text-[13px] font-semibold text-slate-700 transition-all hover:border-primary-200 hover:text-primary-700 hover:shadow-card-hover dark:text-slate-200 dark:hover:border-primary-700 sm:gap-3 sm:p-4 sm:text-sm">
      <span className="shrink-0 text-primary-500">{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  )
}
