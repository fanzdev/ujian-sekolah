import { Link } from 'react-router-dom'
import {
  LayoutDashboard, GraduationCap, Users, School, Database,
  PlayCircle, CalendarClock, ClipboardCheck, ShieldAlert,
  ScrollText, ArrowRight, Activity, Shield, FileQuestion, BarChart3,
} from 'lucide-react'
import { useAsync, useDocumentTitle } from '@/hooks/useAsync'
import { PageHeader, StatCard } from '@/components/ui/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { ErrorState, TableSkeleton } from '@/components/ui/Feedback'
import { AreaChart, BarChart, DonutChart, HBarList } from '@/components/charts'
import { supabase } from '@/services/client'
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
          <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Total Siswa" value={d.students} icon={<GraduationCap className="h-5 w-5" />} tone="blue" hint={`${d.activeStudents} aktif • ${d.students - d.activeStudents} nonaktif`} />
            <StatCard label="Total Guru" value={d.teachers} icon={<Users className="h-5 w-5" />} tone="purple" hint={`${d.teachers} pengajar terdaftar`} />
            <StatCard label="Kelas / Jurusan" value={`${d.classes} / ${d.departments}`} icon={<School className="h-5 w-5" />} tone="amber" hint={`${d.classes} kelas • ${d.departments} jurusan`} />
            <StatCard label="Bank Soal" value={d.banks} icon={<Database className="h-5 w-5" />} tone="blue" hint={`${d.questions} soal • ${d.banksActive} aktif`} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Ujian Aktif" value={<Link to="/admin/exams" className="hover:text-primary-600 dark:hover:text-primary-300">{d.examsActive}</Link>} icon={<PlayCircle className="h-5 w-5 animate-pulse-soft" />} tone="green" hint={d.examsActive ? 'Berlangsung sekarang' : 'Tidak ada'} />
            <StatCard label="Ujian Mendatang" value={d.examsUpcoming} icon={<CalendarClock className="h-5 w-5" />} tone="amber" hint={d.examsUpcoming ? 'Terjadwal' : 'Kosong'} />
            <StatCard label="Submission" value={d.submissions} icon={<ClipboardCheck className="h-5 w-5" />} tone="blue" hint={`${d.inProgress} berlangsung • ${d.submissions} total`} />
            <StatCard label="Pelanggaran" value={d.violations} icon={<ShieldAlert className="h-5 w-5" />} tone={d.violations > 0 ? 'rose' : 'green'} hint={d.riskHigh > 0 ? `${d.riskHigh} high risk` : d.violations ? `${d.violations} total` : 'Aman terkendali'} />
          </div>

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
                      <Link to="/admin/violation-logs" className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 dark:hover:text-primary-300">
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

          <section className="mt-8">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-400">
              <FileQuestion className="h-4 w-4" /> Kesehatan Soal
            </h2>
            <div className="grid gap-3 sm:gap-5 sm:grid-cols-2 xl:grid-cols-3">
              <div className="card min-w-0 p-4 animate-fade-in sm:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Sebaran Tipe Soal</h3>
                    <p className="mt-0.5 text-xs text-slate-400">{d.questions} total soal</p>
                  </div>
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-500/15"><FileQuestion className="h-4 w-4" /></span>
                </div>
                <DonutChart
                  centerTop={String(d.questions)}
                  centerBottom="soal"
                  segments={[
                    { label: 'Pilihan Ganda', value: d.qByType.multiple_choice ?? 0, color: 'rgb(var(--c-primary-600))' },
                    { label: 'Essay', value: d.qByType.essay ?? 0, color: '#f59e0b' },
                    { label: 'Isian', value: (d.qByType.short_answer ?? 0) + (d.qByType.true_false ?? 0), color: '#10b981' },
                    { label: 'Lainnya', value: (d.qByType.matching ?? 0) + (d.qByType.multiple_response ?? 0), color: '#94a3b8' },
                  ]}
                />
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-slate-50 px-2 py-2 dark:bg-white/5">
                    <p className="text-[11px] font-medium text-slate-400">Mudah</p>
                    <p className="text-sm font-bold text-emerald-600">{d.qByDifficulty.easy ?? 0}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-2 py-2 dark:bg-white/5">
                    <p className="text-[11px] font-medium text-slate-400">Sedang</p>
                    <p className="text-sm font-bold text-amber-600">{d.qByDifficulty.medium ?? 0}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-2 py-2 dark:bg-white/5">
                    <p className="text-[11px] font-medium text-slate-400">Sulit</p>
                    <p className="text-sm font-bold text-rose-600">{d.qByDifficulty.hard ?? 0}</p>
                  </div>
                </div>
              </div>

              <BarChartCard
                title="Soal per Bank"
                subtitle="Top 5 bank dengan soal terbanyak"
                data={d.qPerBank}
                colorClass="from-sky-500 to-sky-400"
              />

              <div className="card min-w-0 p-4 animate-fade-in sm:p-5">
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Kualitas Bank</h3>
                  <p className="mt-0.5 text-xs text-slate-400">Rasio soal terpakai vs idle</p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 dark:bg-emerald-500/10">
                    <div>
                      <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Bank Aktif</p>
                      <p className="text-[11px] text-emerald-600/70 dark:text-emerald-300/70">{d.banksActive} dipublikasi</p>
                    </div>
                    <p className="text-xl font-black text-emerald-600">{d.banksActive}</p>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3 dark:bg-amber-500/10">
                    <div>
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Bank Draf</p>
                      <p className="text-[11px] text-amber-600/70 dark:text-amber-300/70">Perlu review</p>
                    </div>
                    <p className="text-xl font-black text-amber-600">{d.banksDraft}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-white/5 dark:bg-white/[0.03]">
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Rata-rata soal per bank</p>
                    <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{d.avgQuestionsPerBank}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, d.avgQuestionsPerBank * 8)}%`, background: 'var(--app-gradient, rgb(var(--c-primary-600)))' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-400">
              <Shield className="h-4 w-4" /> Keamanan Ujian
            </h2>
            <div className="grid gap-3 sm:gap-5 sm:grid-cols-2 xl:grid-cols-3">
              <div className="card min-w-0 p-4 animate-fade-in sm:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Sebaran Risk Score</h3>
                    <p className="mt-0.5 text-xs text-slate-400">Berdasarkan security_events</p>
                  </div>
                  <Badge tone={d.riskHigh > 0 ? 'red' : 'green'}>{d.totalSecurityEvents} events</Badge>
                </div>
                <div className="space-y-2.5">
                  {[
                    { label: 'Normal', value: d.riskNormal, color: 'bg-emerald-500', dot: '🟢' },
                    { label: 'Low', value: d.riskLow, color: 'bg-amber-500', dot: '🟡' },
                    { label: 'Medium', value: d.riskMedium, color: 'bg-orange-500', dot: '🟠' },
                    { label: 'High', value: d.riskHigh, color: 'bg-rose-500', dot: '🔴' },
                  ].map((r) => (
                    <div key={r.label} className="flex items-center gap-3">
                      <span className="w-16 text-xs font-medium text-slate-500">{r.dot} {r.label}</span>
                      <div className="flex-1">
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                          <div className={`h-full rounded-full ${r.color}`} style={{ width: `${d.totalSecurityEvents ? Math.round((r.value / Math.max(1, d.totalSecurityEvents)) * 100) : 0}%`, opacity: r.value ? 1 : 0.15 }} />
                        </div>
                      </div>
                      <span className="w-8 text-right text-xs font-bold text-slate-700 dark:text-slate-200">{r.value}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500 dark:bg-white/5 dark:text-slate-400">
                  <BarChart3 className="h-3.5 w-3.5 shrink-0" /> Pelanggaran auto dihitung: tab +1, fullscreen +1, copy +1, IP +2, device +3, multi +5
                </p>
              </div>

              <BarChartCard
                title="Top Pelanggaran"
                subtitle="Jenis violation terbanyak"
                data={d.topViolations}
                colorClass="from-rose-500 to-orange-400"
              />

              <div className="card min-w-0 p-4 animate-fade-in sm:p-5">
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Event Keamanan Terbaru</h3>
                  <p className="mt-0.5 text-xs text-slate-400">Timeline 5 terakhir</p>
                </div>
                {d.recentSecurity.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-400">Belum ada event — sistem aman.</p>
                ) : (
                  <ul className="space-y-2">
                    {d.recentSecurity.map((e) => (
                      <li key={e.id} className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-white/5 dark:bg-white/[0.03]">
                        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${e.severity === 'HIGH' || e.severity === 'CRITICAL' ? 'bg-rose-500' : e.severity === 'MEDIUM' ? 'bg-orange-500' : 'bg-amber-500'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-slate-800 dark:text-white">{e.event_type}</p>
                          <p className="truncate font-mono text-[11px] text-slate-400">{new Date(e.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}</p>
                        </div>
                        <Badge tone={e.severity === 'HIGH' ? 'red' : e.severity === 'MEDIUM' ? 'amber' : 'gray'}>{e.severity}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
                <Link to="/admin/violation-logs" className="mt-3 flex items-center justify-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900">
                  Lihat Monitoring <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </section>

          <div className="mt-6 grid gap-3 sm:mt-8 sm:gap-5 lg:grid-cols-3">
            <Card className="min-w-0 lg:col-span-2">
              <CardHeader
                title="Aktivitas Terbaru"
                subtitle="Jejak audit seluruh sistem"
                action={
                  <Link to="/admin/audit-logs" className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 dark:hover:text-primary-300">
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
                      <Link to={`/admin/exams/${e.id}/participants`} className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-emerald-50/40 sm:px-5 dark:hover:bg-emerald-500/5 dark:hover:bg-emerald-500/10">
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
    students, activeStudents, teachers, classes, departments,
    examsActive, examsDraft, examsDone, examsUpcoming,
  ] = await Promise.all([
    count('students'),
    count('students', { is_active: true }),
    count('teachers'),
    count('classes'),
    count('departments'),
    count('exams', { status: 'published' }),
    count('exams', { status: 'draft' }),
    count('exams', { status: 'completed' }),
    upcomingCount,
  ])

  const banksQ = await supabase.from('question_banks').select('id, status', { count: 'exact' })
  const banks = banksQ.count ?? 0
  const banksActive = (banksQ.data ?? []).filter((b: { status: string }) => b.status === 'published').length
  const banksDraft = (banksQ.data ?? []).filter((b: { status: string }) => b.status === 'draft').length
  const qCount = await supabase.from('questions').select('id', { count: 'exact', head: true }).then((r) => r.count ?? 0)
  const qByTypeRaw = await supabase.from('questions').select('type').limit(2000).then((r) => r.data ?? [])
  const qByType: Record<string, number> = {}
  for (const r of qByTypeRaw as unknown as { type: string }[]) qByType[r.type] = (qByType[r.type] ?? 0) + 1
  const qByDiffRaw = await supabase.from('questions').select('difficulty').limit(2000).then((r) => r.data ?? [])
  const qByDifficulty: Record<string, number> = {}
  for (const r of qByDiffRaw as unknown as { difficulty: string }[]) qByDifficulty[r.difficulty] = (qByDifficulty[r.difficulty] ?? 0) + 1
  const perBankRaw = await supabase.from('questions').select('bank_id').limit(2000).then((r) => r.data ?? [])
  const perBankMap: Record<string, number> = {}
  for (const r of perBankRaw as unknown as { bank_id: string }[]) perBankMap[r.bank_id] = (perBankMap[r.bank_id] ?? 0) + 1
  const qPerBank = Object.entries(perBankMap).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([bid, v]) => ({ label: bid.slice(0,8), value: v }))
  const avgQuestionsPerBank = banks > 0 ? Math.round((qCount / banks) * 10) / 10 : 0

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
  const scoreBuckets = [
    { label: '0–20', value: scores.filter((s) => s < 20).length },
    { label: '20–40', value: scores.filter((s) => s >= 20 && s < 40).length },
    { label: '40–60', value: scores.filter((s) => s >= 40 && s < 60).length },
    { label: '60–80', value: scores.filter((s) => s >= 60 && s < 80).length },
    { label: '80–100', value: scores.filter((s) => s >= 80).length },
  ]
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

  let secEvents: unknown[] = []
  try {
    const { data } = await supabase.from('security_events').select('id, event_type, severity, created_at').limit(200)
    secEvents = data ?? []
  } catch { secEvents = [] }
  const bySeverity: Record<string, number> = {}
  for (const e of secEvents as unknown as { severity: string }[]) bySeverity[e.severity] = (bySeverity[e.severity] ?? 0) + 1
  const totalSecurityEvents = (secEvents as unknown[]).length
  const riskLow = (secEvents as unknown as { event_type: string }[]).filter(e => ['TAB_SWITCH','PAGE_BLUR'].includes(e.event_type)).length
  const riskMedium = (secEvents as unknown as { event_type: string }[]).filter(e => e.event_type === 'FULLSCREEN_EXIT').length
  const riskHigh = (secEvents as unknown as { event_type: string }[]).filter(e => ['MULTIPLE_DEVICE','DEVICE_CHANGE'].includes(e.event_type)).length
  const riskNormal = Math.max(0, totalSecurityEvents - riskLow - riskMedium - riskHigh)
  let topViolationsRaw: unknown[] = []
  try {
    const { data } = await supabase.from('exam_violations').select('violation_type').limit(500)
    topViolationsRaw = data ?? []
  } catch { topViolationsRaw = [] }
  const topMap: Record<string, number> = {}
  for (const v of topViolationsRaw as unknown as { violation_type: string }[]) topMap[v.violation_type] = (topMap[v.violation_type] ?? 0) + 1
  const topViolations = Object.entries(topMap).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([label, value]) => ({ label, value }))

  const [{ data: activity }, { data: violations }, { data: running }] = await Promise.all([
    supabase.from('audit_logs').select('id, action, actor_role, created_at, profiles(full_name)').order('created_at', { ascending: false }).limit(8),
    supabase.from('exam_violations').select('id, violation_type, severity, created_at, students(profiles(full_name))').order('created_at', { ascending: false }).limit(5),
    supabase.from('exams').select('id, title, ends_at').eq('status', 'published').gte('ends_at', new Date().toISOString()).lte('starts_at', new Date().toISOString()),
  ])

  return {
    students, activeStudents, teachers, classes, departments,
    banks, banksActive, banksDraft, questions: qCount, qByType, qByDifficulty, qPerBank, avgQuestionsPerBank,
    examsActive, examsUpcoming, examsDraft, examsDone,
    submissions: (submissionsAgg as unknown as { count?: number } | null)?.count ?? 0,
    inProgress: inProgress ?? 0,
    violations: (topViolationsRaw as unknown[]).length,
    totalSecurityEvents, riskLow, riskMedium, riskHigh, riskNormal,
    topViolations: topViolations.length ? topViolations : [{ label: 'Tidak ada', value: 0 }],
    recentSecurity: (secEvents as unknown as { id: string; event_type: string; severity: string; created_at: string }[]).slice(0,5),
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
    <Link to={to} className="card flex min-w-0 items-center gap-2 p-3 text-[13px] font-semibold text-slate-700 transition-all hover:border-primary-200 hover:text-primary-700 hover:shadow-card-hover dark:text-slate-200 dark:hover:border-primary-700 sm:gap-3 sm:p-4 sm:text-sm dark:hover:text-primary-300">
      <span className="shrink-0 text-primary-500">{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  )
}
