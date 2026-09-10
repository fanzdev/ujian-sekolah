import { useAsync, useDocumentTitle } from '@/hooks/useAsync'
import { PageHeader, StatCard } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback'
import { getStudentByProfile } from '@/services/academics.service'
import { getMyAttempts } from '@/services/attempts.service'
import { listAvailableExams } from '@/services/attempts.service'
import { fetchSchoolSettings } from '@/services/settings.service'
import { useAuth } from '@/hooks/useAuth'
import { formatDateTime } from '@/lib/datetime'
import { formatNumber } from '@/lib/utils'
import { resolveLogoUrl } from '@/lib/logo'
import { IdCard } from 'lucide-react'

export default function ExamCardPage() {
  useDocumentTitle('Kartu Ujian')
  const { profile } = useAuth()
  const query = useAsync(async () => {
    const [studentInfo, attempts, exams, school] = await Promise.all([
      profile ? getStudentByProfile(profile.id) : Promise.resolve(null),
      getMyAttempts(),
      listAvailableExams(),
      fetchSchoolSettings(),
    ])
    return { studentInfo, attempts, exams, school }
  }, [profile?.id])

  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />
  if (query.loading) return <TableSkeleton rows={4} cols={3} />

  const d = query.data
  const activeExams = (d?.exams ?? []).filter((e) => ['can_start', 'resume', 'upcoming'].includes(e.status_for_me))

  return (
    <>
      <PageHeader
        title="Kartu Ujian"
        subtitle="Identitas digital peserta ujian"
        icon={<IdCard className="h-5 w-5" />}
      />

      {!d?.studentInfo ? (
        <EmptyState title="Data siswa tidak ditemukan" description="Hubungi admin untuk memperbaiki data Anda." />
      ) : (
        <div className="mx-auto max-w-xl">
          <div id="print-area">
            <Card className="overflow-hidden animate-fade-in">
              <div className="flex items-center gap-4 bg-gradient-to-r from-primary-700 to-primary-900 px-6 py-5 text-white">
                <img src={resolveLogoUrl(d.school.logo_url)} alt="" className="h-12 w-12 rounded-xl bg-white/10 object-contain p-1" width={48} height={48} onError={(e)=>{ const t=e.currentTarget; const fb=resolveLogoUrl(null); if(t.src === fb || t.src.endsWith(fb)) return; t.onerror=null; t.src=fb }} />
                <div>
                  <p className="text-sm font-extrabold uppercase tracking-wide">{d.school.app_name}</p>
                  <p className="text-xs text-white/70">{d.school.school_name}{d.school.academic_year ? ` · T.A. ${d.school.academic_year}` : ''}</p>
                </div>
              </div>

              <CardBody className="space-y-5">
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
                  <Row label="Nama" value={d.studentInfo.profiles?.full_name ?? '-'} bold />
                  <Row label="NIS / NISN" value={`${d.studentInfo.nis ?? '-'} / ${d.studentInfo.nisn ?? '-'}`} />
                  <Row label="Username" value={`@${d.studentInfo.profiles?.username ?? '-'}`} />
                  <Row label="Kelas" value={d.studentInfo.classes?.name ?? '-'} />
                  <Row label="Jurusan" value={d.studentInfo.classes?.departments?.name ?? '-'} />
                </div>

                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 dark:bg-slate-800 dark:text-slate-200">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Ujian Terjadwal</p>
                  {activeExams.length === 0 ? (
                    <p className="text-xs text-slate-400">Tidak ada ujian terjadwal saat ini.</p>
                  ) : (
                    <ul className="space-y-1.5 text-xs text-slate-600">
                      {activeExams.map((e) => (
                        <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700">
                          <span className="font-semibold">{e.title}</span>
                          <span className="text-slate-400">{formatDateTime(e.starts_at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex items-end justify-between border-t border-slate-100 pt-4">
                  <p className="text-[10px] leading-relaxed text-slate-300">
                    Kartu ini bersifat digital. Bawa perangkat & kredensial
                    <br />
                    login saat ujian berlangsung.
                  </p>
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400">Kepala Sekolah</p>
                    <p className="mt-8 border-t border-slate-300 px-6 pt-1 text-xs font-semibold text-slate-700">{d.school.headmaster || '....................'}</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-4 print:hidden">
            <StatCard label="Total Ujian" value={String(d.attempts.length)} tone="blue" />
            <StatCard label="Selesai" value={String(d.attempts.filter((a) => a.status !== 'in_progress' && a.status !== 'cancelled').length)} tone="green" />
            <StatCard label="Pelanggaran" value={String(d.attempts.reduce((s, a) => s + a.violation_count, 0))} tone={d.attempts.some((a) => a.violation_count > 0) ? 'rose' : 'green'} />
          </div>

          <Card className="mt-6 print:hidden">
            <CardHeader title="Riwayat Ringkas" />
            <CardBody className="p-0">
              {(d.attempts ?? []).slice(0, 8).map((a) => {
                const result = a.results?.[0]
                return (
                  <div key={a.id} className="flex items-center justify-between gap-3 border-b border-slate-50 px-5 py-3 last:border-0">
                    <span className="min-w-0 truncate text-xs font-medium text-slate-600">{a.exams?.title}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Badge tone={a.status === 'in_progress' ? 'amber' : a.status === 'graded' ? 'green' : 'blue'}>{a.status.replace('_', ' ')}</Badge>
                      {result?.final_score != null && (
                        <strong className="text-xs text-slate-800">{formatNumber(Number(result.final_score), 1)}</strong>
                      )}
                    </span>
                  </div>
                )
              })}
              {d.attempts.length === 0 && <p className="px-5 py-6 text-center text-xs text-slate-400">Belum ada riwayat.</p>}
            </CardBody>
          </Card>
        </div>
      )}
    </>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <>
      <dt className="w-28 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`truncate ${bold ? 'text-base font-extrabold text-slate-900' : 'font-semibold text-slate-700'}`}>{value}</dd>
    </>
  )
}
