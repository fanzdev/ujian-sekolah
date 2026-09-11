import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom'
import { MonitorCheck, RefreshCw, ArrowLeft, UserMinus, UserPlus, Search, Clock, AlertTriangle, Shield, Eye } from 'lucide-react'
import { useAsync, useDocumentTitle } from '@/hooks/useAsync'
import { useToast } from '@/hooks/useToast'
import { useConfirm } from '@/hooks/useConfirm'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { SearchInput } from '@/components/ui/FormControls'
import { Tabs } from '@/components/ui/Tabs'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState, ErrorState, TableSkeleton, Spinner } from '@/components/ui/Feedback'
import { getExam, getParticipants, addParticipant, removeParticipant } from '@/services/exams.service'
import { supabase } from '@/services/client'
import { ATTEMPT_STATUS_LABELS } from '@/lib/constants'
import { formatTime } from '@/lib/datetime'
import { LiveCameraWall } from '@/components/exam/LiveCameraWall'
import { listSecurityEvents, calculateRiskScore, type SecurityEvent } from '@/services/security.service'

interface ParticipantRow {
  student_id: string
  is_removed: boolean
  students: {
    nis: string | null
    profiles: { full_name: string } | null
    classes: { name: string } | null
  } | null
  attempt?: {
    id: string
    status: string
    started_at: string
    submitted_at: string | null
    violation_count: number
    ip_address?: string | null
    user_agent?: string | null
    device_info?: Record<string, unknown> | null
    result?: { final_score: number | null } | null
  }
}

export default function MonitoringPage() {
  const params = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const role = location.pathname.split('/')[1] ?? 'admin'
  const examId = params.examId
  const [activeTab, setActiveTab] = useState('participants')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [tick, setTick] = useState(0)
  const [search, setSearch] = useState('')
  const toast = useToast()
  const confirmDialog = useConfirm()

  useDocumentTitle(examId ? 'Monitoring Ujian' : 'Monitoring')

  const examQuery = useAsync(() => (examId ? getExam(examId) : Promise.resolve(null)), [examId])

  const listQuery = useAsync(
    async (): Promise<ParticipantRow[]> => {
      if (!examId) return []
      const participants = await getParticipants(examId)
      const { data: attempts } = await supabase
        .from('exam_attempts')
        .select('id, status, started_at, submitted_at, violation_count, student_id, ip_address, user_agent, device_info, results:exam_results(final_score)')
        .eq('exam_id', examId)
      const attemptsByStudent: Record<string, ParticipantRow['attempt']> = {}
      for (const a of (attempts ?? []) as unknown as Array<Record<string, unknown>>) {
        const sid = String(a.student_id)
        const existing = attemptsByStudent[sid]
        if (!existing || a.status === 'in_progress') {
          attemptsByStudent[sid] = {
            id: String(a.id),
            status: String(a.status),
            started_at: String(a.started_at),
            submitted_at: (a.submitted_at as string) ?? null,
            violation_count: Number(a.violation_count ?? 0),
            ip_address: a.ip_address as string | null,
            user_agent: a.user_agent as string | null,
            device_info: a.device_info as Record<string, unknown> | null,
            result: (a.results as { final_score: number | null }[] | null)?.[0] ?? null,
          }
        } else if (existing && a.status !== 'in_progress' && new Date(String(a.started_at)) > new Date(existing.started_at)) {
          attemptsByStudent[sid] = {
            id: String(a.id),
            status: String(a.status),
            started_at: String(a.started_at),
            submitted_at: (a.submitted_at as string) ?? null,
            violation_count: Number(a.violation_count ?? 0),
            ip_address: a.ip_address as string | null,
            user_agent: a.user_agent as string | null,
            device_info: a.device_info as Record<string, unknown> | null,
            result: (a.results as { final_score: number | null }[] | null)?.[0] ?? null,
          }
        }
      }
      return (participants as unknown as ParticipantRow[]).map((p) => ({ ...p, attempt: attemptsByStudent[p.student_id] }))
    },
    [examId, tick],
  )

  const securityQuery = useAsync(async (): Promise<SecurityEvent[]> => {
    if (!examId) return []
    try {
      return await listSecurityEvents({ examId, limit: 200 })
    } catch {
      return []
    }
  }, [examId, tick])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = window.setInterval(() => setTick((t) => t + 1), 30000)
    return () => window.clearInterval(interval)
  }, [autoRefresh])

  useEffect(() => {
    if (!examId) return
    const ch = supabase
      .channel(`monitoring-${examId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_attempts', filter: `exam_id=eq.${examId}` }, () => setTick((t) => t + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_results', filter: `exam_id=eq.${examId}` }, () => setTick((t) => t + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'security_events', filter: `exam_id=eq.${examId}` }, () => setTick((t) => t + 1))
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [examId])

  if (listQuery.error) return <ErrorState message={String(listQuery.error)} onRetry={listQuery.reload} />

  const rows = listQuery.data ?? []
  const filteredRows = search
    ? rows.filter((r) => {
        const name = r.students?.profiles?.full_name?.toLowerCase() ?? ''
        const nis = r.students?.nis?.toLowerCase() ?? ''
        const q = search.toLowerCase()
        return name.includes(q) || nis.includes(q)
      })
    : rows

  const activeCount = rows.filter((r) => r.attempt?.status === 'in_progress').length
  const submittedCount = rows.filter((r) => r.attempt && r.attempt.status !== 'in_progress').length
  const totalViolations = rows.reduce((sum, r) => sum + (r.attempt?.violation_count ?? 0), 0)
  const securityEvents = securityQuery.data ?? []
  const riskByAttempt: Record<string, { score: number; level: string }> = {}
  for (const r of rows) {
    if (!r.attempt?.id) continue
    const evts = securityEvents.filter((e) => e.attempt_id === r.attempt!.id)
    const { score } = calculateRiskScore(evts)
    const extra = r.attempt.violation_count > 0 ? r.attempt.violation_count : 0
    riskByAttempt[r.attempt.id] = { score: score + extra, level: score + extra >= 10 ? 'HIGH' : score + extra >= 6 ? 'MEDIUM' : score + extra >= 3 ? 'LOW' : evts.length ? 'LOW' : 'NORMAL' }
  }
  const riskCounts = { NORMAL: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 }
  for (const v of Object.values(riskByAttempt)) {
    const lvl = v.level as keyof typeof riskCounts
    if (lvl in riskCounts) riskCounts[lvl]++
    else riskCounts.NORMAL++
  }
  const notStarted = rows.filter((r) => !r.attempt).length
  riskCounts.NORMAL += notStarted

  const allowOutside = (examQuery.data as unknown as { allow_outside_schedule?: boolean } | null)?.allow_outside_schedule ?? false

  const toggleAllowOutside = async () => {
    if (!examId) return
    const next = !allowOutside
    try {
      const { error } = await supabase.from('exams').update({ allow_outside_schedule: next } as unknown as Record<string, unknown>).eq('id', examId)
      if (error) throw error
      toast.success(next ? 'Siswa kini boleh menyelesaikan di luar jadwal.' : 'Batas jadwal diperketat kembali.')
      examQuery.reload()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('allow_outside_schedule')) {
        toast.error('Kolom allow_outside_schedule belum ada. Jalankan migrasi 00024_allow_outside_schedule.sql di Supabase SQL Editor, lalu coba lagi. Untuk sekarang gunakan Paksa Selesai manual.')
      } else {
        toast.error(msg || 'Gagal mengubah pengaturan.')
      }
    }
  }

  const handleForceSubmitAll = async () => {
    const active = rows.filter((r) => r.attempt?.status === 'in_progress' && !r.is_removed)
    if (active.length === 0) {
      toast.info('Tidak ada peserta yang sedang ujian.')
      return
    }
    const ok = await confirmDialog.confirm({
      title: `Paksa Selesai ${active.length} Peserta?`,
      message: `${active.length} ujian yang sedang berlangsung akan langsung dikumpulkan meskipun bukan waktunya. Jawaban yang sudah ada akan dinilai.`,
      danger: true,
      confirmText: 'Ya, Selesaikan Semua',
    })
    if (!ok) return
    let okCount = 0
    for (const r of active) {
      try {
        await supabase.rpc('submit_attempt', { p_attempt_id: r.attempt!.id })
        okCount++
      } catch { /* ignore per row */ }
    }
    toast.success(`${okCount}/${active.length} ujian berhasil dikumpulkan paksa.`)
    setTick((t) => t + 1)
  }

  const handleForceSubmit = async (attemptId: string, name: string) => {
    const ok = await confirmDialog.confirm({
      title: 'Paksa Selesai?',
      message: `Ujian ${name} akan langsung dikumpulkan meskipun bukan waktunya. Jawaban yang sudah ada akan dinilai.`,
      danger: true,
      confirmText: 'Ya, Kumpulkan',
    })
    if (!ok) return
    try {
      await supabase.rpc('submit_attempt', { p_attempt_id: attemptId })
      toast.success(`Ujian ${name} berhasil dikumpulkan.`)
      setTick((t) => t + 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengumpulkan.')
    }
  }

  return (
    <>
      <PageHeader
        title={examQuery.data?.title ?? 'Monitoring Ujian'}
        subtitle={
          examQuery.data
            ? `Peserta · ${formatTime(examQuery.data.starts_at)} – ${formatTime(examQuery.data.ends_at)}`
            : 'Daftar peserta & status pengerjaan'
        }
        icon={<MonitorCheck className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap gap-2">
            {!examId && (
              <Link to={`/${role}/exams`}>
                <Button variant="outline" size="sm" icon={<ArrowLeft className="h-4 w-4" />}>Pilih Ujian</Button>
              </Link>
            )}
            <Button variant="outline" size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={() => setTick((t) => t + 1)}>
              Refresh
            </Button>
            <Button
              variant={autoRefresh ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setAutoRefresh((a) => !a)}
            >
              Auto {autoRefresh ? 'ON' : 'OFF'} (30s)
            </Button>
            {examId && (
              <Button
                variant={allowOutside ? 'primary' : 'outline'}
                size="sm"
                onClick={toggleAllowOutside}
                title="Jika ON, siswa boleh memulai & mengumpulkan meskipun di luar jam / status Draf"
              >
                Luar Jadwal: {allowOutside ? 'ON' : 'OFF'}
              </Button>
            )}
            {examId && activeCount > 0 && (
              <Button variant="danger" size="sm" onClick={handleForceSubmitAll} icon={<AlertTriangle className="h-3 w-3" />}>
                Selesaikan Paksa Semua ({activeCount})
              </Button>
            )}
          </div>
        }
      />

      {examId && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-5">
            <StatBox label="Total Peserta" value={rows.filter((r) => !r.is_removed).length} />
            <StatBox label="Sedang Ujian" value={activeCount} tone="green" pulse={activeCount > 0} />
            <StatBox label="Selesai" value={submittedCount} tone="blue" />
            <StatBox label="Pelanggaran" value={totalViolations} tone={totalViolations > 0 ? 'red' : 'slate'} />
            <div className="col-span-2 lg:col-span-1 card p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400"><Shield className="h-3 w-3" /> Risk</p>
              <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-bold">
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">🟢 {riskCounts.NORMAL}</span>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">🟡 {riskCounts.LOW}</span>
                <span className="rounded-full bg-orange-50 px-2 py-0.5 text-orange-700">🟠 {riskCounts.MEDIUM}</span>
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700">🔴 {riskCounts.HIGH + riskCounts.CRITICAL}</span>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">{securityEvents.length} security events</p>
            </div>
          </div>

          <Tabs
            active={activeTab}
            onChange={setActiveTab}
            tabs={[
              { id: 'participants', label: 'Status Peserta', badge: rows.length },
              { id: 'security', label: 'Keamanan', badge: securityEvents.length },
              { id: 'camera', label: 'Kamera Live' },
              { id: 'manage', label: 'Kelola Peserta' },
            ]}
          />
        </>
      )}

      {!examId ? (
        <>
          <ExamPickerForMonitoring onPick={(id) => navigate(`/${role}/exams/${id}/participants`)} />
          <div className="mt-6">
            <LiveCameraWall />
          </div>
        </>
      ) : activeTab === 'participants' ? (
        <Card className="mt-5">
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div className="relative flex-1 max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                aria-label="Cari peserta"
                placeholder="Cari nama / NIS..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-base pl-9"
              />
            </div>
            <span className="text-xs text-slate-400">{filteredRows.length} dari {rows.length} peserta</span>
          </div>

          {listQuery.loading && rows.length === 0 ? (
            <TableSkeleton cols={7} />
          ) : filteredRows.length === 0 ? (
            <EmptyState
              icon={<UserPlus className="h-6 w-6" />}
              title={search ? 'Tidak ditemukan' : 'Belum ada peserta'}
              description={search ? 'Coba kata kunci lain.' : 'Tambahkan target kelas/jurusan pada editor ujian, atau kelola peserta manual.'}
              action={!search ? <Button size="sm" onClick={() => setActiveTab('manage')}>Kelola Peserta</Button> : undefined}
            />
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[960px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-800/50">
                    <th className="table-th">Peserta</th>
                    <th className="table-th">Kelas</th>
                    <th className="table-th">Status</th>
                    <th className="table-th">Mulai / Kumpul</th>
                    <th className="table-th text-center">Nilai</th>
                    <th className="table-th text-center">Pelanggaran</th>
                    <th className="table-th text-center">Risk</th>
                    <th className="table-th text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredRows.map((row) => {
                    const risk = row.attempt ? riskByAttempt[row.attempt.id] : null
                    return (
                    <tr key={row.student_id} className={`transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30 ${row.is_removed ? 'opacity-40' : ''}`}>
                      <td className="table-td">
                        <div className="flex items-center gap-3">
                          <Avatar name={row.students?.profiles?.full_name ?? '?'} size="xs" />
                          <div>
                            <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">{row.students?.profiles?.full_name ?? '-'}</p>
                            <p className="text-[11px] text-slate-400">NIS {row.students?.nis ?? '-'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="table-td whitespace-nowrap text-xs">{row.students?.classes?.name ?? '-'}</td>
                      <td className="table-td">
                        {row.is_removed ? (
                          <Badge tone="gray">Dikecualikan</Badge>
                        ) : !row.attempt ? (
                          <Badge>Belum Mulai</Badge>
                        ) : row.attempt.status === 'in_progress' ? (
                          <Badge tone="green" dot>Berlangsung</Badge>
                        ) : (
                          <Badge tone="blue">{ATTEMPT_STATUS_LABELS[row.attempt.status] ?? row.attempt.status}</Badge>
                        )}
                      </td>
                      <td className="table-td whitespace-nowrap text-xs text-slate-500">
                        {row.attempt ? (
                          <span className="flex items-center gap-1">
                            {row.attempt.status === 'in_progress' && <Clock className="h-3 w-3 text-emerald-500" />}
                            {formatTime(row.attempt.started_at)}
                            {row.attempt.submitted_at ? ` → ${formatTime(row.attempt.submitted_at)}` : ''}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="table-td text-center font-bold text-slate-800 dark:text-slate-100">
                        {row.attempt?.result?.final_score !== null && row.attempt?.result?.final_score !== undefined
                          ? Number(row.attempt.result.final_score).toLocaleString('id-ID')
                          : '-'}
                      </td>
                      <td className="table-td text-center">
                        {(row.attempt?.violation_count ?? 0) > 0 ? (
                          <Badge tone="red" dot>{row.attempt!.violation_count}</Badge>
                        ) : (
                          <span className="text-xs text-slate-300">-</span>
                        )}
                      </td>
                      <td className="table-td text-center">
                        {risk ? (
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${risk.level === 'HIGH' || risk.level === 'CRITICAL' ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300' : risk.level === 'MEDIUM' ? 'bg-orange-50 text-orange-700 dark:bg-orange-500/20' : risk.level === 'LOW' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                            {risk.level === 'HIGH' ? '🔴' : risk.level === 'MEDIUM' ? '🟠' : risk.level === 'LOW' ? '🟡' : '🟢'} {risk.score}
                          </span>
                        ) : <span className="text-xs text-slate-300">-</span>}
                      </td>
                      <td className="table-td text-center">
                        <div className="flex items-center justify-center gap-1">
                        {row.attempt?.status === 'in_progress' && !row.is_removed ? (
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => handleForceSubmit(row.attempt!.id, row.students?.profiles?.full_name ?? '')}
                            icon={<AlertTriangle className="h-3 w-3" />}
                          >
                            Selesai
                          </Button>
                        ) : null}
                        {row.attempt && <SecurityTimelineButton attemptId={row.attempt.id} />}
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : activeTab === 'security' ? (
        <SecurityTab examId={examId!} />
      ) : activeTab === 'camera' ? (
        <LiveCameraWall examId={examId!} />
      ) : (
        <ManageParticipants examId={examId!} onChanged={() => setTick((t) => t + 1)} />
      )}
    </>
  )
}

function SecurityTimelineButton({ attemptId }: { attemptId: string }) {
  const [open, setOpen] = useState(false)
  const q = useAsync(() => listSecurityEvents({ attemptId, limit: 100 }), [attemptId, open])
  return (
    <>
      <Button size="xs" variant="ghost" onClick={() => setOpen(true)} icon={<Eye className="h-3 w-3" />}>Log</Button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title="Timeline Keamanan" size="lg">
          <div className="max-h-[60vh] overflow-y-auto p-4">
            {q.loading ? <div className="flex justify-center py-8"><Spinner /></div> : (q.data ?? []).length === 0 ? <p className="py-8 text-center text-sm text-slate-400">Belum ada event keamanan.</p> : (
              <div className="space-y-2">
                {(q.data ?? []).map((e) => (
                  <div key={e.id} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-white/5 dark:bg-white/[0.03]">
                    <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${e.severity === 'CRITICAL' || e.severity === 'HIGH' ? 'bg-rose-500' : e.severity === 'MEDIUM' ? 'bg-orange-500' : e.severity === 'LOW' ? 'bg-amber-500' : 'bg-slate-300'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 dark:text-white">{e.event_type} <span className="ml-1 rounded-full bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:bg-white/10">{e.severity}</span></p>
                      <p className="truncate font-mono text-[11px] text-slate-400">{new Date(e.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} · {e.ip_address ?? '-'} · {e.device_id?.slice(0,12) ?? '-'}</p>
                      {Object.keys(e.metadata ?? {}).length > 0 && <p className="mt-1 break-words font-mono text-[11px] text-slate-500">{JSON.stringify(e.metadata).slice(0,200)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}

function SecurityTab({ examId }: { examId: string }) {
  const q = useAsync(() => listSecurityEvents({ examId, limit: 200 }), [examId])
  const events = q.data ?? []
  const byType: Record<string, number> = {}
  for (const e of events) byType[e.event_type] = (byType[e.event_type] ?? 0) + 1
  return (
    <Card className="mt-5">
      <div className="border-b border-slate-100 p-4 dark:border-white/5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-white"><Shield className="h-4 w-4 text-primary-600" /> Ringkasan Keamanan</h3>
        <p className="mt-1 text-xs text-slate-500">{events.length} event tercatat — gunakan log per peserta untuk detail timeline.</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Object.entries(byType).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([k,v]) => (
            <span key={k} className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[11px] font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">{k}: {v}</span>
          ))}
          {Object.keys(byType).length===0 && <span className="text-xs text-slate-400">Belum ada event.</span>}
        </div>
      </div>
      <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-50 dark:divide-white/5">
        {q.loading ? <div className="flex justify-center py-10"><Spinner /></div> : events.length===0 ? <p className="py-10 text-center text-sm text-slate-400">Belum ada aktivitas keamanan.</p> : events.slice(0,100).map((e) => (
          <div key={e.id} className="flex gap-3 px-4 py-3">
            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${e.severity==='HIGH'||e.severity==='CRITICAL'?'bg-rose-500':e.severity==='MEDIUM'?'bg-orange-500':'bg-amber-500'}`} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-800 dark:text-white">{e.event_type} <span className="font-normal text-slate-400">· {e.attempt_id?.slice(0,8) ?? '-'}</span></p>
              <p className="font-mono text-[11px] text-slate-400">{new Date(e.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} · {e.ip_address ?? '-'}</p>
            </div>
            <Badge tone={e.severity==='HIGH'||e.severity==='CRITICAL'?'red':e.severity==='MEDIUM'?'amber':'gray'}>{e.severity}</Badge>
          </div>
        ))}
      </div>
    </Card>
  )
}

function ExamPickerForMonitoring({ onPick }: { onPick: (id: string) => void }) {
  const query = useAsync(() => import('@/services/exams.service').then((m) => m.listExams({ pageSize: 100 })), [])
  if (query.loading) return <Card><div className="flex justify-center py-14"><Spinner /></div></Card>
  const exams = query.data?.rows ?? []
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {exams.map((e) => (
        <button key={e.id} onClick={() => onPick(e.id)} className="card p-4 text-left transition-all hover:shadow-card-hover hover:border-primary-200">
          <p className="line-clamp-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{e.title}</p>
          <p className="mt-1 text-xs text-slate-400">{new Date(e.starts_at).toLocaleDateString('id-ID')}</p>
        </button>
      ))}
      {exams.length === 0 && <p className="col-span-full py-10 text-center text-sm text-slate-400">Belum ada ujian.</p>}
    </div>
  )
}

function ManageParticipants({ examId, onChanged }: { examId: string; onChanged: () => void }) {
  const toast = useToast()
  const confirmDialog = useConfirm()
  const [modalOpen, setModalOpen] = useState(false)

  const handleRemove = async (studentId: string, name: string) => {
    const ok = await confirmDialog.confirm({
      title: 'Kecualikan Peserta?',
      message: `${name} tidak akan dapat mengerjakan ujian ini. Data dapat dipulihkan dengan menambahkan kembali.`,
      danger: true,
      confirmText: 'Kecualikan',
    })
    if (!ok) return
    try {
      await removeParticipant(examId, studentId)
      toast.success(`${name} dikecualikan.`)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal.')
    }
  }

  return (
    <Card className="mt-5">
      <div className="flex items-center justify-between p-4">
        <p className="text-sm text-slate-500">Kelola pengecualian peserta individual.</p>
        <Button size="sm" onClick={() => setModalOpen(true)} icon={<UserPlus className="h-4 w-4" />}>Tambah Siswa</Button>
      </div>
      <ParticipantsManager examId={examId} onRemove={handleRemove} onChanged={onChanged} modalOpen={modalOpen} onCloseModal={() => setModalOpen(false)} />
    </Card>
  )
}

function ParticipantsManager({
  examId,
  onRemove,
  onChanged,
  modalOpen,
  onCloseModal,
}: {
  examId: string
  onRemove: (studentId: string, name: string) => Promise<void>
  onChanged: () => void
  modalOpen: boolean
  onCloseModal: () => void
}) {
  const toast = useToast()
  const query = useAsync(async () => {
    const participants = await getParticipants(examId)
    return (participants as unknown as ParticipantRow[])
  }, [examId])

  return (
    <>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {(query.data ?? []).filter((r) => r.is_removed).length === 0 && (query.data ?? []).length === 0 ? (
          <EmptyState title="Tidak ada peserta" description="Pastikan ujian memiliki target kelas/jurusan." />
        ) : (
          (query.data ?? []).map((row) => (
            <div key={row.student_id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={row.students?.profiles?.full_name ?? '?'} size="xs" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{row.students?.profiles?.full_name}</p>
                  <p className="text-[11px] text-slate-400">{row.students?.classes?.name ?? '-'}</p>
                </div>
              </div>
              {row.is_removed ? (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await addParticipant(examId, row.student_id)
                      toast.success('Peserta ditambahkan kembali.')
                      onChanged()
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Gagal.')
                    }
                  }}
                >
                  Pulihkan
                </Button>
              ) : (
                <button
                  onClick={() => void onRemove(row.student_id, row.students?.profiles?.full_name ?? '')}
                  aria-label="Kecualikan peserta"
                  className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                >
                  <UserMinus className="h-4 w-4" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <AddStudentModal
        open={modalOpen}
        examId={examId}
        existingIds={(query.data ?? []).map((r) => r.student_id)}
        onClose={onCloseModal}
        onAdded={() => {
          onCloseModal()
          onChanged()
        }}
      />
    </>
  )
}

function AddStudentModal({
  open,
  examId,
  existingIds,
  onClose,
  onAdded,
}: {
  open: boolean
  examId: string
  existingIds: string[]
  onClose: () => void
  onAdded: () => void
}) {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState<string | null>(null)
  const query = useAsync(async () => {
    let builder = supabase
      .from('students')
      .select('id, nis, profiles(full_name), classes(name)')
      .order('created_at', { ascending: false })
      .limit(50)
    if (search) {
      builder = builder.or(`nis.ilike.%${search}%`)
    }
    const { data, error } = await builder
    if (error) throw error
    return (data as unknown as { id: string; nis: string | null; profiles: { full_name: string }[] | { full_name: string }; classes: { name: string }[] | { name: string } }[]) ?? []
  }, [search])

  return (
    <Modal open={open} onClose={onClose} title="Tambah Peserta Individual" size="md">
      <div className="space-y-3 px-6 py-5">
        <SearchInput placeholder="Cari NIS..." value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
        <div className="max-h-72 space-y-2 overflow-y-auto scrollbar-thin pr-1">
          {(query.data ?? []).filter((s) => !existingIds.includes(s.id)).slice(0, 30).map((s) => (
            <button
              key={s.id}
              disabled={adding === s.id}
              onClick={async () => {
                setAdding(s.id)
                try {
                  await addParticipant(examId, s.id)
                  toast.success('Peserta ditambahkan.')
                  onAdded()
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Gagal menambahkan.')
                } finally {
                  setAdding(null)
                }
              }}
              className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-2.5 text-left transition-colors hover:border-primary-300 hover:bg-primary-50/40 dark:border-slate-700 dark:hover:border-primary-600 dark:hover:bg-primary-500/10 dark:hover:bg-primary-500/15"
            >
              <span>
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">{Array.isArray(s.profiles) ? s.profiles[0]?.full_name : s.profiles?.full_name}</span>
                <span className="text-xs text-slate-400">NIS {s.nis ?? '-'} · {(Array.isArray(s.classes) ? s.classes[0]?.name : s.classes?.name) ?? '-'}</span>
              </span>
              {adding === s.id ? <Spinner className="h-4 w-4" /> : <UserPlus className="h-4 w-4 text-primary-500" />}
            </button>
          ))}
          {(query.data ?? []).filter((s) => !existingIds.includes(s.id)).length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">Tidak ada siswa yang cocok.</p>
          )}
        </div>
      </div>
    </Modal>
  )
}

function StatBox({ label, value, tone = 'slate', pulse }: { label: string; value: number; tone?: 'slate' | 'green' | 'blue' | 'red'; pulse?: boolean }) {
  return (
    <div className="card px-4 py-3.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-bold ${
        tone === 'green' ? 'text-emerald-600' : tone === 'blue' ? 'text-primary-600' : tone === 'red' ? 'text-rose-600' : 'text-slate-900 dark:text-slate-100'
      } ${pulse ? 'animate-pulse-soft' : ''}`}>{value}</p>
    </div>
  )
}
