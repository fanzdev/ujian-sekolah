import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardCheck, Eye, Clock3, Trophy } from 'lucide-react'
import { useAsync, useDocumentTitle } from '@/hooks/useAsync'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/Tabs'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, ErrorState, Spinner, TableSkeleton } from '@/components/ui/Feedback'
import { getMyAttempts } from '@/services/attempts.service'
import { formatDateTime, formatDuration } from '@/lib/datetime'
import { formatNumber } from '@/lib/utils'
import AttemptReview from '@/features/exam/AttemptReview'
import { ClassRanking } from '@/components/exam/ClassRanking'

export default function HistoryPage() {
  const [tab, setTab] = useState('all')
  const [reviewAttemptId, setReviewAttemptId] = useState<string | null>(null)
  const [rankingExam, setRankingExam] = useState<{ id: string; title: string } | null>(null)
  useDocumentTitle('Riwayat & Nilai')

  const query = useAsync(() => getMyAttempts(), [])

  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />
  if (query.loading) return <TableSkeleton rows={5} cols={4} />

  const visibleRows = (query.data ?? []).filter((a) => {
    if (a.status === 'in_progress') return true
    return a.status === 'submitted' || a.status === 'auto_submitted' || a.status === 'graded'
  })
  const rows = visibleRows
  const filtered = tab === 'all' ? rows : rows.filter((a) => a.results?.some((r) => r.final_score !== null))

  return (
    <>
      <PageHeader
        title="Riwayat & Nilai Ujian"
        subtitle="Seluruh attempt dan hasil yang diizinkan ditampilkan"
        icon={<ClipboardCheck className="h-5 w-5" />}
      />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'all', label: 'Semua', badge: rows.length },
          { id: 'graded', label: 'Sudah Bernilai', badge: rows.filter((r) => r.results?.some((x) => x.final_score !== null)).length },
        ]}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-6 w-6" />}
          title="Belum ada riwayat"
          description="Setelah Anda mengerjakan ujian, hasilnya akan muncul di sini."
          action={
            <Link to="/student/exams">
              <Button size="sm">Lihat Ujian Tersedia</Button>
            </Link>
          }
        />
      ) : (
        <div className="mt-5 space-y-3">
          {filtered.map((a) => {
            const result = a.results?.[0]
            return (
              <Card key={a.id} className="transition-all hover:shadow-card-hover">
                <CardBody className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                      a.status === 'in_progress' ? 'bg-amber-50 text-amber-500' : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    <ClipboardCheck className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-800">{a.exams?.title ?? '-'}</p>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                      <span>Mulai {formatDateTime(a.started_at)}</span>
                      {a.submitted_at && <span>· Kumpul {formatDateTime(a.submitted_at)}</span>}
                      {result?.duration_seconds != null && (
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-3 w-3" />
                          {formatDuration(result.duration_seconds)}
                        </span>
                      )}
                      {a.violation_count > 0 && <span className="font-semibold text-rose-500">{a.violation_count} pelanggaran</span>}
                    </p>
                  </div>

                  {a.status === 'in_progress' ? (
                    <Link to={`/exam/${a.id}`}>
                      <Button size="sm" variant="danger">Lanjutkan</Button>
                    </Link>
                  ) : (a.exams as unknown as { show_result_to_student?: boolean } | null)?.show_result_to_student === false ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="gray">Nilai disembunyikan</Badge>
                      {a.exams && (
                        <Button size="xs" variant="outline" onClick={() => setReviewAttemptId(a.id)} icon={<Eye className="h-3.5 w-3.5" />}>
                          Review
                        </Button>
                      )}
                    </div>
                  ) : result && (result.final_score !== null || result.correct_count > 0 || result.total_questions > 0) ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {result.final_score !== null ? (
                        <>
                          <Badge tone={result.passed === true ? 'green' : result.passed === false ? 'red' : 'blue'} className="!px-3 !py-1 !text-sm">
                            {formatNumber(Number(result.final_score), 1)}
                          </Badge>
                          {result.passed !== null && <Badge tone={result.passed ? 'green' : 'red'}>{result.passed ? 'Lulus' : 'Remedial'}</Badge>}
                        </>
                      ) : (
                        <Badge tone="amber">Menunggu penilaian essay</Badge>
                      )}
                      <Button size="xs" variant="outline" onClick={() => setRankingExam({ id: a.exam_id, title: a.exams?.title ?? 'Ujian' })} icon={<Trophy className="h-3.5 w-3.5" />}>
                        Peringkat Kelas
                      </Button>
                      {a.exams && (
                        <Button size="xs" variant="outline" onClick={() => setReviewAttemptId(a.id)} icon={<Eye className="h-3.5 w-3.5" />}>
                          Review
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>Dikumpulkan</Badge>
                      <Button size="xs" variant="outline" onClick={() => setRankingExam({ id: a.exam_id, title: a.exams?.title ?? 'Ujian' })} icon={<Trophy className="h-3.5 w-3.5" />}>
                        Peringkat Kelas
                      </Button>
                    </div>
                  )}
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}

      {reviewAttemptId && (
        <Modal open onClose={() => setReviewAttemptId(null)} title="Review Jawaban" size="xl">
          <AttemptReviewLoader attemptId={reviewAttemptId} onClose={() => setReviewAttemptId(null)} />
        </Modal>
      )}

      {rankingExam && (
        <Modal open onClose={() => setRankingExam(null)} title={`Peringkat Kelas — ${rankingExam.title}`} size="lg">
          <div className="max-h-[70vh] overflow-y-auto px-4 py-4 scrollbar-thin sm:px-6">
            <ClassRanking examId={rankingExam.id} examTitle={rankingExam.title} />
          </div>
        </Modal>
      )}
    </>
  )
}

function AttemptReviewLoader({ attemptId, onClose }: { attemptId: string; onClose: () => void }) {
  const query = useAsync(() => import('@/services/attempts.service').then((m) => m.getAttemptPayload(attemptId)), [attemptId])

  if (query.loading)
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  if (query.error || !query.data)
    return <p className="px-6 py-10 text-center text-sm text-slate-400">{query.error ?? 'Data tidak tersedia.'}</p>

  return (
    <div className="max-h-[70vh] overflow-y-auto scrollbar-thin">
      <AttemptReview payload={query.data} onClose={onClose} />
    </div>
  )
}
