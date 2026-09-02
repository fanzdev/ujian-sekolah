import { useMemo, useState } from 'react'
import { ScrollText, ShieldAlert, Download } from 'lucide-react'
import { useAsync, useDebounce, useDocumentTitle } from '@/hooks/useAsync'
import { useToast } from '@/hooks/useToast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Input'
import { SearchInput } from '@/components/ui/FormControls'
import { DataTable, Pagination } from '@/components/ui/DataTable'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback'
import { listAuditLogs } from '@/services/audit.service'
import { listViolations } from '@/services/violations.service'
import { exportCsv } from '@/services/export.service'
import { formatDateTime } from '@/lib/datetime'
import { AUDIT_ACTION_LABELS, VIOLATION_TYPE_LABELS } from '@/lib/constants'

export function AuditLogsPage() {
  const [actionFilter, setActionFilter] = useState('')
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search)
  const [page, setPage] = useState(1)
  const toast = useToast()
  useDocumentTitle('Audit Log')

  const query = useAsync(
    () => listAuditLogs({ action: actionFilter || undefined, page, pageSize: 25 }),
    [actionFilter, page],
  )

  const filteredRows = useMemo(() => {
    const rows = query.data?.rows ?? []
    if (!debounced) return rows
    const s = debounced.toLowerCase()
    return rows.filter(
      (r) =>
        (r.resource ?? '').toLowerCase().includes(s) ||
        (r.resource_id ?? '').toLowerCase().includes(s) ||
        (r.profiles?.full_name ?? '').toLowerCase().includes(s),
    )
  }, [query.data, debounced])

  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />

  return (
    <>
      <PageHeader
        title="Audit Log"
        subtitle="Jejak aktivitas seluruh pengguna sistem"
        icon={<ScrollText className="h-5 w-5" />}
        actions={
          <Button
            variant="outline"
            size="sm"
            icon={<Download className="h-4 w-4" />}
            disabled={(query.data?.rows.length ?? 0) === 0}
            onClick={() => {
              exportCsv(
                `audit-log-${new Date().toISOString().slice(0, 10)}`,
                query.data?.rows ?? [],
                [
                  { header: 'Waktu', value: (r) => formatDateTime(r.created_at) },
                  { header: 'Aktor', value: (r) => r.profiles?.full_name ?? '-' },
                  { header: 'Role', value: (r) => r.actor_role ?? '-' },
                  { header: 'Aksi', value: (r) => r.action },
                  { header: 'Resource', value: (r) => `${r.resource ?? ''} ${r.resource_id ?? ''}`.trim() },
                ],
              )
              toast.success('CSV diunduh.')
            }}
          >
            Export CSV
          </Button>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <SearchInput placeholder="Cari resource / id..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select
            className="w-full sm:w-56"
            placeholder="Semua Aksi"
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1) }}
            options={Object.entries(AUDIT_ACTION_LABELS).map(([v, l]) => ({ value: v, label: l }))}
          />
        </div>
        {query.loading ? (
          <TableSkeleton cols={5} />
        ) : (
          <>
            <DataTable
              rowKey={(a) => a.id}
              data={filteredRows}
              emptyState={<EmptyState title="Belum ada aktivitas tercatat." />}
              columns={[
                { key: 'time', header: 'Waktu', render: (a) => <span className="whitespace-nowrap text-xs">{formatDateTime(a.created_at)}</span> },
                {
                  key: 'actor',
                  header: 'Aktor',
                  render: (a) => (
                    <div className="whitespace-nowrap">
                      <p className="text-[13px] font-semibold text-slate-800">{a.profiles?.full_name ?? 'Sistem'}</p>
                      <Badge tone={a.actor_role === 'admin' ? 'purple' : a.actor_role === 'teacher' ? 'sky' : 'green'}>{a.actor_role === 'admin' ? 'Admin' : a.actor_role === 'teacher' ? 'Guru' : a.actor_role === 'student' ? 'Siswa' : '-'}</Badge>
                    </div>
                  ),
                },
                { key: 'action', header: 'Aksi', render: (a) => <Badge tone="blue">{AUDIT_ACTION_LABELS[a.action] ?? a.action}</Badge> },
                {
                  key: 'resource',
                  header: 'Resource',
                  render: (a) => (
                    <span className="font-mono text-[11px] text-slate-400">
                      {a.resource ?? '-'}
                      {a.resource_id ? ` · ${a.resource_id.slice(0, 12)}…` : ''}
                    </span>
                  ),
                },
                {
                  key: 'meta',
                  header: 'Metadata',
                  render: (a) => {
                    const keys = Object.keys(a.metadata ?? {})
                    if (keys.length === 0) return <span className="text-slate-300">-</span>
                    return (
                      <span className="line-clamp-1 max-w-[220px] font-mono text-[11px] text-slate-400" title={JSON.stringify(a.metadata)}>
                        {JSON.stringify(a.metadata).slice(0, 80)}
                      </span>
                    )
                  },
                },
              ]}
            />
            <Pagination page={page} pageSize={25} total={query.data?.total ?? 0} onPageChange={setPage} />
          </>
        )}
      </Card>
    </>
  )
}

export function ViolationsPage() {
  const [examFilter, setExamFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [page, setPage] = useState(1)
  useDocumentTitle('Log Pelanggaran')
  const toast = useToast()

  const examsQuery = useAsync(() => import('@/services/exams.service').then((m) => m.listExams({ pageSize: 200 })), [])
  const query = useAsync(
    () => listViolations({ examId: examFilter || undefined, severity: severityFilter || undefined, page, pageSize: 25 }),
    [examFilter, severityFilter, page],
  )

  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />

  return (
    <>
      <PageHeader
        title="Log Pelanggaran Ujian"
        subtitle="Deteksi tab-switch, keluar fokus, dan indikasi kecurangan lainnya"
        icon={<ShieldAlert className="h-5 w-5" />}
        actions={
          <Button
            variant="outline"
            size="sm"
            icon={<Download className="h-4 w-4" />}
            disabled={(query.data?.rows.length ?? 0) === 0}
            onClick={() => {
              exportCsv('pelanggaran-ujian', query.data?.rows ?? [], [
                { header: 'Waktu', value: (v) => formatDateTime(v.created_at) },
                { header: 'Siswa', value: (v) => v.students?.profiles?.full_name ?? '-' },
                { header: 'Ujian', value: (v) => v.exams?.title ?? '-' },
                { header: 'Jenis', value: (v) => VIOLATION_TYPE_LABELS[v.violation_type] ?? v.violation_type },
                { header: 'Severity', value: (v) => v.severity },
              ])
              toast.success('CSV diunduh.')
            }}
          >
            Export CSV
          </Button>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <Select
            className="w-full sm:w-64"
            placeholder="Semua Ujian"
            value={examFilter}
            onChange={(e) => { setExamFilter(e.target.value); setPage(1) }}
            options={(examsQuery.data?.rows ?? []).map((e) => ({ value: e.id, label: e.title }))}
          />
          <Select
            className="w-full sm:w-44"
            placeholder="Semua Severity"
            value={severityFilter}
            onChange={(e) => { setSeverityFilter(e.target.value); setPage(1) }}
            options={[
              { value: 'warning', label: 'Warning' },
              { value: 'serious', label: 'Serious' },
              { value: 'critical', label: 'Critical' },
            ]}
          />
        </div>
        {query.loading ? (
          <TableSkeleton cols={5} />
        ) : (
          <>
            <DataTable
              rowKey={(v) => v.id}
              data={query.data?.rows ?? []}
              emptyState={<EmptyState icon={<ShieldAlert className="h-6 w-6" />} title="Tidak ada pelanggaran" description="Semua peserta mengerjakan dengan tertib." />}
              columns={[
                { key: 'time', header: 'Waktu', render: (v) => <span className="whitespace-nowrap text-xs">{formatDateTime(v.created_at)}</span> },
                {
                  key: 'student',
                  header: 'Siswa',
                  render: (v) => (
                    <div>
                      <p className="text-[13px] font-semibold text-slate-800">{v.students?.profiles?.full_name ?? '-'}</p>
                      <p className="text-[11px] text-slate-400">NIS {v.students?.nis ?? '-'}</p>
                    </div>
                  ),
                },
                { key: 'exam', header: 'Ujian', render: (v) => <span className="line-clamp-1 max-w-[200px] text-xs">{v.exams?.title ?? '-'}</span> },
                { key: 'type', header: 'Jenis', render: (v) => VIOLATION_TYPE_LABELS[v.violation_type] ?? v.violation_type },
                {
                  key: 'severity',
                  header: 'Severity',
                  render: (v) => (
                    <Badge tone={v.severity === 'critical' ? 'red' : v.severity === 'serious' ? 'amber' : 'gray'} dot>
                      {v.severity}
                    </Badge>
                  ),
                },
              ]}
            />
            <Pagination page={page} pageSize={25} total={query.data?.total ?? 0} onPageChange={setPage} />
          </>
        )}
      </Card>
    </>
  )
}
