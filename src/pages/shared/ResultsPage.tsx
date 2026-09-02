import { useEffect, useMemo, useState } from 'react'
import { ClipboardCheck, Download, Search } from 'lucide-react'
import { useAsync, useDebounce, useDocumentTitle } from '@/hooks/useAsync'
import { useToast } from '@/hooks/useToast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Input'
import { DataTable, Pagination } from '@/components/ui/DataTable'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback'
import { listExams } from '@/services/exams.service'
import { listResults } from '@/services/grading.service'
import { exportCsv, exportExcel, exportPdfTable, type ExportColumn } from '@/services/export.service'
import { supabase } from '@/services/client'
import { formatNumber } from '@/lib/utils'
import type { ExamResult as ExamResultRow } from '@/types/models'

export default function ResultsPage() {
  const [examFilter, setExamFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debounced = useDebounce(search)
  const toast = useToast()
  useDocumentTitle('Hasil Ujian')

  const examsQuery = useAsync(() => listExams({ pageSize: 200 }), [])
  const resultsQuery = useAsync(
    () => listResults({ examId: examFilter || undefined, search: debounced || undefined, page, pageSize: 20 }),
    [examFilter, debounced, page],
  )

  useEffect(() => {
    const ch = supabase
      .channel('results-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_results' }, () => resultsQuery.reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_attempts' }, () => resultsQuery.reload())
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stats = useMemo(() => {
    const rows = resultsQuery.data?.rows ?? []
    const scores = rows.map((r) => Number(r.final_score ?? r.objective_score)).filter((n) => !Number.isNaN(n))
    if (scores.length === 0) return null
    return {
      count: rows.length,
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
      max: Math.max(...scores),
      min: Math.min(...scores),
      passed: rows.filter((r) => r.passed === true).length,
    }
  }, [resultsQuery.data])

  if (resultsQuery.error) return <ErrorState message={resultsQuery.error} onRetry={resultsQuery.reload} />

  const rows = resultsQuery.data?.rows ?? []

  const exportRows = (): {
    rank: number
    name: string
    nis: string
    exam: string
    objective: number
    essay: string | number
    final: number
    correct: number
    wrong: number
    empty: number
    total_q: number
    violations: number
    status: string
  }[] =>
    rows.map((r, i) => ({
      rank: i + 1,
      name: r.attempts?.students?.profiles?.full_name ?? '-',
      nis: r.attempts?.students?.nis ?? '-',
      exam: r.exams?.title ?? '-',
      objective: Number(r.objective_score),
      essay: r.essay_score ?? '',
      final: r.final_score ?? Number(r.objective_score),
      correct: r.correct_count,
      wrong: r.wrong_count,
      empty: r.unanswered_count,
      total_q: r.total_questions,
      violations: r.violation_count,
      status: r.passed === true ? 'LULUS' : r.passed === false ? 'TIDAK LULUS' : '-',
    }))

  const columns: ExportColumn<{
    rank: number
    name: string
    nis: string
    exam: string
    objective: number
    essay: string | number
    final: number
    correct: number
    wrong: number
    empty: number
    total_q: number
    violations: number
    status: string
  }>[] = [
    { header: 'Rank', value: (r) => r.rank },
    { header: 'Nama', value: (r) => r.name },
    { header: 'NIS', value: (r) => r.nis },
    { header: 'Ujian', value: (r) => r.exam },
    { header: 'Objektif', value: (r) => r.objective },
    { header: 'Essay', value: (r) => r.essay },
    { header: 'Nilai Akhir', value: (r) => r.final },
    { header: 'Benar/Salah/Kosong', value: (r) => `${r.correct}/${r.wrong}/${r.empty}` },
    { header: 'Pelanggaran', value: (r) => r.violations },
    { header: 'Status', value: (r) => r.status },
  ]

  return (
    <>
      <PageHeader
        title="Hasil Ujian"
        subtitle="Nilai akhir seluruh peserta ujian"
        icon={<ClipboardCheck className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => exportCsv('hasil-ujian', exportRows(), columns)} disabled={rows.length === 0}>
              CSV
            </Button>
            <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" />} onClick={async () => { await exportExcel('hasil-ujian', 'Hasil Ujian', exportRows(), columns); toast.success('Excel diunduh.') }} disabled={rows.length === 0}>
              Excel
            </Button>
            <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" />} onClick={async () => { await exportPdfTable('hasil-ujian', 'Rekap Hasil Ujian', columns.map((c) => c.header), exportRows().map((r) => columns.map((c) => String(c.value(r))))); toast.success('PDF diunduh.') }} disabled={rows.length === 0}>
              PDF
            </Button>
          </div>
        }
      />

      {stats && (
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
          <MiniStat label="Peserta Dinilai" value={String(stats.count)} />
          <MiniStat label="Rata-rata" value={formatNumber(stats.avg, 1)} />
          <MiniStat label="Tertinggi" value={formatNumber(stats.max, 1)} tone="green" />
          <MiniStat label="Lulus (jika KKM)" value={`${stats.passed}`} tone="blue" />
        </div>
      )}

      <Card>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              aria-label="Cari siswa"
              placeholder="Cari nama / NIS..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="input-base pl-9"
            />
          </div>
          <Select
            className="w-full sm:w-64"
            placeholder="Semua Ujian"
            value={examFilter}
            onChange={(e) => { setExamFilter(e.target.value); setPage(1) }}
            options={(examsQuery.data?.rows ?? []).map((e) => ({ value: e.id, label: e.title }))}
          />
        </div>

        {resultsQuery.loading ? (
          <TableSkeleton cols={6} />
        ) : (
          <>
            <DataTable<ExamResultRow>
              rowKey={(r) => r.attempt_id}
              data={rows}
              emptyState={<EmptyState title="Belum ada hasil ujian" description="Hasil akan muncul setelah siswa mengumpulkan pekerjaan." />}
              columns={[
                {
                  key: 'rank',
                  header: '#',
                  render: (_r, i) => <span className="text-xs font-bold text-slate-400">{(page - 1) * 20 + i + 1}</span>,
                  className: 'w-10 text-center',
                },
                {
                  key: 'student',
                  header: 'Peserta',
                  render: (r) => (
                    <div>
                      <p className="font-semibold text-slate-800">{r.attempts?.students?.profiles?.full_name ?? '-'}</p>
                      <p className="text-xs text-slate-400">NIS {r.attempts?.students?.nis ?? '-'}</p>
                    </div>
                  ),
                },
                { key: 'exam', header: 'Ujian', render: (r) => <span className="line-clamp-1 max-w-[220px]">{r.exams?.title ?? '-'}</span> },
                { key: 'objective', header: 'Objektif', render: (r) => formatNumber(Number(r.objective_score), 1), className: 'text-center' },
                { key: 'essay', header: 'Essay', render: (r) => (r.essay_score === null ? <Badge tone="amber">Proses</Badge> : formatNumber(Number(r.essay_score), 1)), className: 'text-center' },
                { key: 'final', header: 'Akhir', render: (r) => <span className="font-bold text-slate-900">{r.final_score !== null ? formatNumber(Number(r.final_score), 1) : '-'}</span>, className: 'text-center' },
                {
                  key: 'passed',
                  header: 'Status',
                  render: (r) =>
                    r.passed === true ? <Badge tone="green">Lulus</Badge> : r.passed === false ? <Badge tone="red">Remedial</Badge> : <span className="text-xs text-slate-300">-</span>,
                  className: 'text-center',
                },
                {
                  key: 'violations',
                  header: 'Pelanggaran',
                  render: (r) => (r.violation_count > 0 ? <Badge tone="red" dot>{r.violation_count}</Badge> : <span className="text-slate-300">0</span>),
                  className: 'text-center',
                },
              ]}
            />
            <Pagination page={page} pageSize={20} total={resultsQuery.data?.total ?? 0} onPageChange={setPage} />
          </>
        )}
      </Card>
    </>
  )
}

function MiniStat({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'green' | 'blue' }) {
  return (
    <div className="card px-4 py-3.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone === 'green' ? 'text-emerald-600' : tone === 'blue' ? 'text-primary-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}
