import { useEffect, useMemo, useState } from 'react'
import { Trophy, ImageDown, Search, Medal } from 'lucide-react'
import { useAsync, useDebounce, useDocumentTitle } from '@/hooks/useAsync'
import { useToast } from '@/hooks/useToast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Input'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback'
import { listExams } from '@/services/exams.service'
import { listClasses } from '@/services/academics.service'
import { getExamClassRanking, type ClassRankingRow } from '@/services/attempts.service'
import { downloadTop3Image } from '@/services/ranking-image.service'
import { formatNumber } from '@/lib/utils'
import { friendlyError } from '@/lib/errors'

export default function RankingPage() {
  useDocumentTitle('Peringkat Siswa')
  const toast = useToast()
  const [examId, setExamId] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [search, setSearch] = useState('')
  const [downloading, setDownloading] = useState(false)
  const debounced = useDebounce(search)

  const examsQuery = useAsync(() => listExams({ pageSize: 200 }), [])
  const classesQuery = useAsync(() => listClasses(), [])

  const activeExamId = examId || examsQuery.data?.rows[0]?.id || ''
  useEffect(() => {
    if (!examId && examsQuery.data?.rows.length) {
      setExamId(examsQuery.data.rows[0].id)
    }
  }, [examId, examsQuery.data])

  const rankingQuery = useAsync(
    async () => {
      if (!activeExamId) return [] as ClassRankingRow[]
      return getExamClassRanking(activeExamId)
    },
    [activeExamId],
  )

  const filtered = useMemo(() => {
    let rows = rankingQuery.data ?? []
    if (classFilter) {
      const cls = (classesQuery.data ?? []).find((c) => c.id === classFilter)
      if (cls) rows = rows.filter((r) => (r.class_name ?? '') === cls.name)
    }
    if (debounced.trim()) {
      const s = debounced.trim().toLowerCase()
      rows = rows.filter(
        (r) =>
          r.student_name.toLowerCase().includes(s) ||
          (r.nis ?? '').toLowerCase().includes(s),
      )
    }
    const sorted = [...rows].sort((a, b) => Number(b.final_score ?? 0) - Number(a.final_score ?? 0))
    return sorted.map((r, i) => ({ ...r, rank: i + 1 }))
  }, [rankingQuery.data, classFilter, classesQuery.data, debounced])

  const stats = useMemo(() => {
    if (filtered.length === 0) return null
    const scores = filtered.map((r) => Number(r.final_score ?? 0))
    return {
      count: filtered.length,
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
      max: Math.max(...scores),
    }
  }, [filtered])

  if (examsQuery.error) return <ErrorState message={String(examsQuery.error)} onRetry={examsQuery.reload} />
  if (rankingQuery.error) return <ErrorState message={String(rankingQuery.error)} onRetry={rankingQuery.reload} />

  const activeExam = (examsQuery.data?.rows ?? []).find((e) => e.id === activeExamId)
  const activeClassLabel = classFilter
    ? ((classesQuery.data ?? []).find((c) => c.id === classFilter)?.name ?? 'Semua Kelas')
    : 'Semua Kelas'

  const handleDownloadImage = async () => {
    if (filtered.length === 0 || downloading) return
    setDownloading(true)
    try {
      await downloadTop3Image({
        examTitle: activeExam?.title ?? 'Peringkat Ujian',
        classLabel: activeClassLabel,
        rows: filtered,
      })
      toast.success('Gambar Peringkat Telah Diunduh.')
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Peringkat Siswa"
        subtitle={activeExam ? `${activeExam.title} · skala nilai 0-100` : 'Pilih ujian untuk melihat peringkat'}
        icon={<Trophy className="h-5 w-5" />}
        actions={
          <Button size="sm" icon={<ImageDown className="h-4 w-4" />} disabled={filtered.length === 0} loading={downloading} onClick={() => void handleDownloadImage()}>
            Unduh Sebagai Gambar
          </Button>
        }
      />

      {stats && (
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="card px-4 py-3.5">
            <p className="text-xs font-semibold text-slate-500">Peserta</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-white">{stats.count}</p>
          </div>
          <div className="card px-4 py-3.5">
            <p className="text-xs font-semibold text-slate-500">Rata-rata</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-white">{formatNumber(stats.avg, 1)}</p>
          </div>
          <div className="card px-4 py-3.5">
            <p className="text-xs font-semibold text-slate-500">Tertinggi</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-emerald-600">{formatNumber(stats.max, 1)}</p>
          </div>
        </div>
      )}

      <Card>
        <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-3 sm:gap-2">
          <Select
            label="Mata Pelajaran"
            value={activeExamId}
            onChange={(e) => setExamId(e.target.value)}
            options={(examsQuery.data?.rows ?? []).map((e) => ({ value: e.id, label: e.title }))}
          />
          <Select
            label="Kelas"
            placeholder="Semua Kelas"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            options={(classesQuery.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
          <div className="w-full">
            <label htmlFor="ranking-search" className="label-base">Cari</label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="ranking-search"
                type="search"
                aria-label="Cari siswa"
                placeholder="Cari nama / NIS..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-base pl-9"
              />
            </div>
          </div>
        </div>

        {rankingQuery.loading ? (
          <TableSkeleton cols={5} />
        ) : (
          <DataTable<ClassRankingRow>
            rowKey={(r) => r.student_id}
            data={filtered}
            emptyState={<EmptyState icon={<Medal className="h-6 w-6" />} title="Belum ada peringkat" description="Pilih ujian lain atau pastikan siswa sudah mengumpulkan jawaban." />}
            columns={[
              {
                key: 'rank',
                header: 'Peringkat',
                render: (r) => (
                  <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold tabular-nums ${r.rank === 1 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : r.rank === 2 ? 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-200' : r.rank === 3 ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' : 'text-slate-400'}`}>
                    {r.rank}
                  </span>
                ),
                className: 'w-20 text-center',
              },
              {
                key: 'student',
                header: 'Siswa',
                render: (r) => (
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{r.student_name}</p>
                    <p className="text-xs text-slate-400">NIS {r.nis ?? '-'} · {r.class_name ?? 'Tanpa kelas'}</p>
                  </div>
                ),
              },
              {
                key: 'score',
                header: 'Nilai',
                render: (r) => <span className="font-bold tabular-nums text-slate-900 dark:text-white">{r.final_score !== null ? formatNumber(Number(r.final_score), 1) : '-'}</span>,
                className: 'text-center',
              },
              {
                key: 'detail',
                header: 'Benar / Salah / Kosong',
                render: (r) => <span className="text-xs tabular-nums text-slate-500">{r.correct_count}/{r.wrong_count}/{r.unanswered_count}</span>,
                className: 'text-center',
              },
              {
                key: 'status',
                header: 'Status',
                render: (r) => (r.passed === true ? <Badge tone="green">Lulus</Badge> : r.passed === false ? <Badge tone="red">Remedial</Badge> : <span className="text-xs text-slate-300">-</span>),
                className: 'text-center',
              },
            ]}
          />
        )}
      </Card>
      <p className="mt-3 text-xs leading-relaxed text-slate-400">
        Peringkat dihitung otomatis dari nilai akhir skala 0-100. Gunakan filter kelas untuk peringkat per kelas atau biarkan Semua Kelas untuk peringkat gabungan. Tombol Unduh Gambar menyimpan desain Top 3 (4:5, HD) sesuai warna tema dan logo sekolah.
      </p>
    </>
  )
}
