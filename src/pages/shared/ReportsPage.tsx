import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Download, TrendingUp, TrendingDown, FileText } from 'lucide-react'
import { useAsync, useDocumentTitle } from '@/hooks/useAsync'
import { useToast } from '@/hooks/useToast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { listExams } from '@/services/exams.service'
import { supabase } from '@/services/client'
import { exportPdfTable } from '@/services/export.service'
import { buildExamRecap, type ExamRecap } from '@/services/local-assist.service'
import { formatNumber } from '@/lib/utils'

interface ResultJoin {
  attempt_id: string
  final_score: number | null
  objective_score: number
  passed: boolean | null
  attempts?: {
    students?: { profiles?: { full_name: string }; nis?: string } | null
  } | null
}

export default function ReportsPage() {
  const [examId, setExamId] = useState('')
  const [recap, setRecap] = useState<ExamRecap | null>(null)
  useDocumentTitle('Laporan')
  const toast = useToast()

  useEffect(() => {
    setRecap(null)
  }, [examId])

  const runRecap = () => {
    const data = report.data
    if (!data) return
    try {
      const result = buildExamRecap({
        examTitle: data.examTitle,
        scores: data.rows.map((r) => Number(r.final_score ?? r.objective_score ?? 0)),
        passingGrade: data.passingGrade,
        distribution: data.distribution,
        lowQuestions: data.questionStats,
      })
      setRecap(result)
      toast.success('Rekap otomatis dibuat tanpa perlu internet atau API key.')
    } catch {
      toast.error('Gagal membuat rekap otomatis.')
    }
  }

  const examsQuery = useAsync(() => listExams({ pageSize: 200 }), [])

  useEffect(() => {
    if (!examId && examsQuery.data?.rows.length) setExamId(examsQuery.data.rows[0].id)
  }, [examsQuery.data, examId])

  const report = useAsync(async () => {
    if (!examId) return null
    const [, { data: results }, { data: exam }] = await Promise.all([
      supabase.from('exam_questions').select('question_id', { count: 'exact', head: true }).eq('exam_id', examId),
      supabase
        .from('exam_results')
        .select('attempt_id, final_score, objective_score, passed, attempts:exam_attempts!inner(students!inner(profiles!inner(full_name), nis))')
        .eq('exam_id', examId),
      supabase.from('exams').select('title, passing_grade').eq('id', examId).single(),
    ])

    const rows = (results ?? []) as unknown as ResultJoin[]
    const scores = rows.map((r) => Number(r.final_score ?? r.objective_score)).filter((n) => !Number.isNaN(n))
    scores.sort((a, b) => b - a)

    const distribution = [0, 1, 2, 3, 4].map((bucket) => {
      const min = bucket * 20
      const max = bucket === 4 ? 100.01 : (bucket + 1) * 20
      return {
        label: `${min}-${Math.min(100, Math.round(max - 0.01))}`,
        count: scores.filter((s) => s >= min && s < max).length,
      }
    })

    // Per-question analysis from answers of submitted attempts of this exam
    const questionStats = await analyzeQuestions(examId)

    return {
      examTitle: (exam?.title as string) ?? '',
      passingGrade: Number((exam?.passing_grade as number) ?? 0),
      rows,
      scores,
      distribution,
      questionStats,
    }
  }, [examId])

  const stats = useMemo(() => {
    if (!report.data || report.data.scores.length === 0) return null
    const s = report.data.scores
    return {
      n: s.length,
      avg: s.reduce((a, b) => a + b, 0) / s.length,
      median: s[Math.floor(s.length / 2)] ?? 0,
      max: s[0],
      min: s[s.length - 1],
      passedRate:
        report.data.passingGrade > 0
          ? (report.data.rows.filter((r) => r.passed === true).length / s.length) * 100
          : null,
    }
  }, [report.data])

  useEffect(() => {
    if (!examId) return
    const ch = supabase
      .channel(`reports-${examId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_results', filter: `exam_id=eq.${examId}` }, () => report.reload())
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId])

  if (report.error) return <ErrorState message={String(report.error)} onRetry={report.reload} />

  return (
    <>
      <PageHeader
        title="Laporan & Analisis"
        subtitle="Statistik nilai dan analisis butir soal"
        icon={<BarChart3 className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<FileText className="h-4 w-4" />}
            disabled={!stats}
            onClick={runRecap}
          >
            Rekap Otomatis
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<Download className="h-4 w-4" />}
            disabled={!stats}
            onClick={() => {
              if (!stats || !report.data) return
              void exportPdfTable(
                `laporan-${report.data.examTitle.toLowerCase().replace(/\s+/g, '-')}`,
                `Laporan Ujian: ${report.data.examTitle}`,
                ['Nama', 'NIS', 'Nilai Akhir', 'Status'],
                report.data.rows.map((r) => [
                  r.attempts?.students?.profiles?.full_name ?? '-',
                  r.attempts?.students?.nis ?? '-',
                  formatNumber(Number(r.final_score ?? r.objective_score), 1),
                  r.passed === true ? 'LULUS' : r.passed === false ? 'REMEDIAL' : 'BELUM DIPUBLIKASI',
                ]),
                'p',
              )
              toast.success('PDF laporan diunduh.')
            }}
          >
            Unduh PDF
          </Button>
          </div>
        }
      />

      {recap && (
        <Card className="mb-5 border-primary-100 dark:border-primary-500/20">
          <CardHeader title="Ringkasan Otomatis" subtitle={`Rata-rata ${formatNumber(recap.overallScore, 1)} · ${stats?.n ?? 0} peserta · Tanpa API key`} />
          <CardBody className="space-y-3">
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{recap.summary}</p>
            {recap.strengths.length > 0 && (
              <div>
                <p className="text-xs font-bold text-emerald-600">Kekuatan</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-500 dark:text-slate-400">
                  {recap.strengths.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
            )}
            {recap.concerns.length > 0 && (
              <div>
                <p className="text-xs font-bold text-rose-500">Perlu perhatian</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-500 dark:text-slate-400">
                  {recap.concerns.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
            )}
            {recap.recommendations.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300">Rekomendasi</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-500 dark:text-slate-400">
                  {recap.recommendations.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <Card className="mb-5">
        <div className="p-4">
          <Select
            label="Pilih Ujian"
            value={examId}
            onChange={(e) => setExamId(e.target.value)}
            options={(examsQuery.data?.rows ?? []).map((e) => ({ value: e.id, label: e.title }))}
            placeholder={examsQuery.loading ? 'Memuat...' : 'Belum ada ujian'}
          />
        </div>
      </Card>

      {!examId || !report.data ? (
        <Card><div className="flex justify-center py-14"><Spinner /></div></Card>
      ) : stats ? (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
              <MetricBox label="Peserta" value={String(stats.n)} />
              <MetricBox label="Rata-rata" value={formatNumber(stats.avg, 1)} />
              <MetricBox label="Median" value={formatNumber(stats.median, 1)} />
              <MetricBox
                label={report.data.passingGrade > 0 ? 'Daya Serap' : 'Tertinggi'}
                value={report.data.passingGrade > 0 && stats.passedRate !== null ? `${formatNumber(stats.passedRate, 0)}%` : formatNumber(stats.max, 1)}
                tone="green"
              />
            </div>

            <Card>
              <CardHeader title="Distribusi Nilai" subtitle="Sebaran peserta per rentang skor" />
              <CardBody>
                <DistributionChart data={report.data.distribution} total={stats.n} />
              </CardBody>
            </Card>

            <QuestionAnalysis stats={report.data.questionStats} />
          </div>

          <Card className="h-fit">
            <CardHeader title="Peringkat Tertinggi" subtitle={`Top 10 · ${report.data.examTitle}`} />
            <CardBody className="p-0">
              <ol className="divide-y divide-slate-50">
                {[...report.data.rows]
                  .sort((a, b) => Number(b.final_score ?? b.objective_score) - Number(a.final_score ?? a.objective_score))
                  .slice(0, 10)
                  .map((r, i) => (
                    <li key={r.attempt_id} className="flex items-center gap-3 px-5 py-3">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-200 text-slate-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-50 text-slate-400'
                      }`}>
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-800">{r.attempts?.students?.profiles?.full_name ?? '-'}</span>
                        <span className="text-xs text-slate-400">{r.attempts?.students?.nis ?? ''}</span>
                      </span>
                      <Badge tone={i === 0 ? 'green' : 'gray'}>{formatNumber(Number(r.final_score ?? r.objective_score), 1)}</Badge>
                    </li>
                  ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      ) : (
        <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="Belum ada data hasil" description="Pilih ujian yang sudah memiliki peserta yang mengumpulkan jawaban." />
      )}
    </>
  )
}

async function analyzeQuestions(examId: string): Promise<QuestionStat[]> {
  const { data: links } = await supabase
    .from('exam_questions')
    .select('question_id, points, questions(text, type)')
    .eq('exam_id', examId)
  const links_ = (links ?? []) as unknown as { question_id: string; points: number; questions: { text: string; type: string } }[]

  if (links_.length === 0) return []

  const { data: attempts } = await supabase.from('exam_attempts').select('id').eq('exam_id', examId).in('status', ['submitted', 'auto_submitted', 'graded'])
  const attemptIds = ((attempts ?? []) as { id: string }[]).map((a) => a.id)
  if (attemptIds.length === 0) return []

  const { data: answers } = await supabase
    .from('answers')
    .select('question_id')
    .in('attempt_id', attemptIds)

  const answeredCount: Record<string, number> = {}
  for (const a of answers ?? []) {
    answeredCount[a.question_id] = (answeredCount[a.question_id] ?? 0) + 1
  }

  return links_
    .map((l) => ({
      text: l.questions?.text ?? '(tanpa teks)',
      type: l.questions?.type ?? '',
      points: Number(l.points ?? 1),
      answered: answeredCount[l.question_id] ?? 0,
      attemptedBy: attemptIds.length,
    }))
    .sort((a, b) => a.answered / (a.attemptedBy || 1) - b.answered / (b.attemptedBy || 1))
}

interface QuestionStat {
  text: string
  type: string
  points: number
  answered: number
  attemptedBy: number
}

function QuestionAnalysis({ stats }: { stats: QuestionStat[] }) {
  if (stats.length === 0) return null
  return (
    <Card>
      <CardHeader title="Analitik Butir Soal" subtitle="Soal dengan tingkat kelulusan jawaban terendah (perlu ditinjau ulang)" />
      <CardBody className="space-y-3">
        {stats.slice(0, 8).map((q, i) => {
          const pct = q.attemptedBy > 0 ? (q.answered / q.attemptedBy) * 100 : 0
          return (
            <div key={i} className="rounded-xl border border-slate-100 p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="line-clamp-2 text-[13px] leading-snug text-slate-700">{q.text.replace(/<[^>]*>/g, '').slice(0, 160)}</p>
                <Badge tone={pct >= 70 ? 'green' : pct >= 40 ? 'amber' : 'red'}>{formatNumber(pct, 0)}% terjawab</Badge>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700 dark:text-slate-200">
                <div
                  className={`h-full rounded-full transition-all ${pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-400' : 'bg-rose-400'}`}
                  style={{ width: `${Math.max(2, pct)}%` }}
                />
              </div>
            </div>
          )
        })}
        <p className="flex items-center gap-1.5 pt-1 text-xs text-slate-300">
          <TrendingUp className="h-3.5 w-3.5" /> Persentase dihitung dari jumlah siswa yang menjawab soal tersebut.
          <TrendingDown className="ml-2 h-3.5 w-3.5" /> Soal paling sulit tampil paling atas.
        </p>
      </CardBody>
    </Card>
  )
}

function DistributionChart({ data, total }: { data: { label: string; count: number }[]; total: number }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <div>
      <div className="flex h-44 items-end gap-2 sm:gap-3">
        {data.map((d) => (
          <div key={d.label} className="group flex flex-1 flex-col items-center gap-2">
            <span className="text-xs font-bold text-slate-500 opacity-0 transition-opacity group-hover:opacity-100">{d.count}</span>
            <div
              className="w-full rounded-t-lg bg-gradient-to-t from-primary-500 to-primary-400 transition-all hover:from-primary-600 hover:to-primary-500"
              style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? 6 : 3 }}
              role="img"
              aria-label={`${d.count} siswa pada rentang ${d.label}`}
            />
            <span className="whitespace-nowrap text-[10px] font-medium text-slate-400 sm:text-xs">{d.label}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-slate-300">Total {total} peserta</p>
    </div>
  )
}

function MetricBox({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'green' }) {
  return (
    <div className="card p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone === 'green' ? 'text-emerald-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}
