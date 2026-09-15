import { useState } from 'react'
import { PencilRuler, Save, Search, Clock3, CheckCircle2, GraduationCap, Filter, Sparkles } from 'lucide-react'
import { useAsync, useDebounce, useDocumentTitle } from '@/hooks/useAsync'
import { useToast } from '@/hooks/useToast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { listEssayQueue, getEssayDetail, gradeEssayFinal } from '@/services/grading.service'
import { listExams } from '@/services/exams.service'
import { useAuth } from '@/hooks/useAuth'

type QueueItem = Awaited<ReturnType<typeof listEssayQueue>>[number]

export default function GradingQueuePage() {
  useDocumentTitle('Penilaian Essay')
  const [examFilter, setExamFilter] = useState('')
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search)

  const examsQuery = useAsync(() => listExams({ pageSize: 200 }), [])
  const query = useAsync(() => listEssayQueue({ examId: examFilter || undefined, search: debounced || undefined }), [examFilter, debounced])

  const [activeItem, setActiveItem] = useState<QueueItem | null>(null)

  if (query.error) return <ErrorState message={String(query.error)} onRetry={query.reload} />

  const rows = query.data ?? []
  const pending = rows.filter((r) => r.status === 'pending')
  const graded = rows.filter((r) => r.status === 'graded')

  return (
    <>
      <PageHeader
        title="Penilaian Essay"
        subtitle="Review jawaban essay dan beri nilai final untuk siswa"
        icon={<PencilRuler className="h-5 w-5" />}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="relative overflow-hidden rounded-[20px] p-4 text-white shadow-sm" style={{ background: 'var(--app-gradient, linear-gradient(135deg, #0D868F, #2DD4BF))' }}>
          <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/15 blur-xl" />
          <div className="pointer-events-none absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '18px 18px' }} />
          <div className="relative">
            <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] text-white/80"><Clock3 className="h-3 w-3" /> MENUNGGU</p>
            <p className="mt-1 text-3xl font-black tracking-tight">{pending.length}</p>
            <p className="text-xs font-medium text-white/80">Jawaban perlu dinilai</p>
          </div>
        </div>
        <div className="rounded-[20px] border border-black/5 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] text-slate-400"><CheckCircle2 className="h-3 w-3" /> SELESAI</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-white">{graded.length}</p>
          <p className="text-xs text-slate-500">Sudah diberi nilai final</p>
        </div>
        <div className="rounded-[20px] border border-black/5 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] text-slate-400"><GraduationCap className="h-3 w-3" /> TOTAL ANTRIAN</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-white">{rows.length}</p>
          <p className="text-xs text-slate-500">Semua status</p>
        </div>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 p-4 dark:border-white/5 dark:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm dark:bg-white/10 dark:text-white"><Filter className="h-4 w-4" /></span>
            <div>
              <p className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Filter Penilaian</p>
              <p className="text-xs text-slate-500">Cari nama/NIS atau saring per ujian</p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="search" aria-label="Cari siswa" placeholder="Cari nama / NIS..." value={search} onChange={(e) => setSearch(e.target.value)} className="input-base pl-9" />
            </div>
            <Select
              className="w-full sm:w-64"
              placeholder="Semua Ujian"
              value={examFilter}
              onChange={(e) => setExamFilter(e.target.value)}
              options={(examsQuery.data?.rows ?? []).map((e) => ({ value: e.id, label: e.title }))}
            />
          </div>
        </div>

        {query.loading ? (
          <div className="flex justify-center py-14"><Spinner /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<PencilRuler className="h-6 w-6" />} title="Tidak ada essay untuk dinilai" description="Jawaban essay muncul di sini setelah siswa mengumpulkan ujian. Coba ubah filter atau kata kunci pencarian." />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {rows.map((r) => (
              <button key={r.answer_id} onClick={() => setActiveItem(r)} className="group flex w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-primary-50/60 dark:hover:bg-white/[0.04]">
                <span className="hidden h-10 w-1 shrink-0 rounded-full bg-primary-500/20 group-hover:bg-primary-500 sm:block" aria-hidden />
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 group-hover:bg-primary-500 group-hover:text-white dark:bg-white/10 dark:text-white">
                  <span className="text-xs font-black">{r.student_name.slice(0, 2).toUpperCase()}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                    {r.student_name}
                    <span className="ml-2 font-mono text-xs font-normal text-slate-400">NIS {r.student_nis ?? '-'}</span>
                  </p>
                  <p className="mt-1 line-clamp-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{r.question_text.replace(/<[^>]*>/g, '').slice(0, 140) || '—'}</p>
                </div>
                <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                  {r.status === 'graded' ? (
                    <Badge tone="green">Nilai: {Number(r.final_score).toLocaleString('id-ID')}</Badge>
                  ) : (
                    <Badge tone="amber" dot>Menunggu</Badge>
                  )}
                  <span className="font-mono text-[10px] tracking-wide text-slate-400 group-hover:text-primary-600 dark:group-hover:text-primary-300">Klik untuk nilai →</span>
                </div>
                <div className="sm:hidden">
                  {r.status === 'graded' ? <Badge tone="green">{Number(r.final_score)}</Badge> : <Badge tone="amber" dot>•</Badge>}
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {activeItem && (
        <GradingModal
          item={activeItem}
          onClose={() => setActiveItem(null)}
          onSaved={() => {
            setActiveItem(null)
            query.reload()
          }}
        />
      )}
    </>
  )
}

function GradingModal({ item, onClose, onSaved }: { item: QueueItem; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const { profile } = useAuth()
  const detailQuery = useAsync(() => getEssayDetail(item.attempt_id, item.question_id), [item])

  const [score, setScore] = useState<number | ''>(item.final_score !== null ? Number(item.final_score) : '')
  const [feedback, setFeedback] = useState(item.final_feedback ?? '')
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)

  const gradeWithAi = async () => {
    if (detailQuery.loading || !detailQuery.data) return
    setAiLoading(true)
    try {
      const { aiGradeEssay } = await import('@/services/ai.service')
      const result = await aiGradeEssay({
        questionText: detailQuery.data.questionText.replace(/<[^>]*>/g, ''),
        answerText: detailQuery.data.answerText,
        maxScore: 100,
      })
      setScore(result.score)
      setFeedback(result.feedback)
      toast.success('Saran nilai AI dimasukkan. Periksa sebelum menyimpan.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal meminta penilaian AI.')
    } finally {
      setAiLoading(false)
    }
  }

  if (detailQuery.loading || !detailQuery.data) {
    return (
      <Modal open onClose={onClose} title="Memuat..." size="lg">
        <div className="flex justify-center py-14"><Spinner /></div>
      </Modal>
    )
  }

  const detail = detailQuery.data

  const saveFinal = async () => {
    if (score === '' || Number(score) < 0 || Number(score) > 100) {
      toast.error(`Nilai harus antara 0 dan 100.`)
      return
    }
    setSaving(true)
    try {
      await gradeEssayFinal({
        attemptId: item.attempt_id,
        questionId: item.question_id,
        score: Number(score),
        feedback: feedback || null,
        role: profile?.role ?? 'teacher',
      })
      toast.success('Nilai final tersimpan.')
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan nilai.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Nilai Essay · ${item.student_name}`} size="xl">
      <div className="space-y-5 px-6 py-5">
        <div className="rounded-2xl border border-primary-100 bg-primary-50/50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
          <p className="font-mono text-[10px] tracking-[0.12em] text-primary-700 dark:text-primary-300">SOAL</p>
          <p className="mt-1.5 text-sm font-semibold leading-relaxed text-slate-900 dark:text-white">{detail.questionText.replace(/<[^>]*>/g, '')}</p>
        </div>

        <div>
          <p className="label-base flex items-center justify-between">
            Jawaban Siswa
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold tracking-wide text-slate-500 dark:bg-white/10 dark:text-slate-300">{detail.answerText.split(/\s+/).filter(Boolean).length} kata</span>
          </p>
          <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap scrollbar-thin dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200">{detail.answerText || '(kosong)'}</div>
        </div>

        <Input
          label="Nilai Essay (0-100)"
          type="number"
          step={0.5}
          min={0}
          max={100}
          value={score}
          onChange={(e) => setScore(e.target.value === '' ? '' : Number(e.target.value))}
          hint="Skala 0-100 per soal. Sistem otomatis membobot setara dengan soal lain."
          required
        />

        <Textarea label="Umpan Balik untuk Siswa" placeholder="Komentar singkat mengenai jawaban siswa..." value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:border-white/5 dark:bg-white/[0.03]">
        <Button variant="ghost" onClick={onClose}>Batal</Button>
        <Button variant="outline" onClick={() => void gradeWithAi()} loading={aiLoading} icon={<Sparkles className="h-4 w-4" />}>Nilai dengan AI</Button>
        <Button onClick={saveFinal} loading={saving} icon={<Save className="h-4 w-4" />} style={{ background: 'var(--app-gradient, var(--c-primary-600))' }} className="border-0 text-white hover:opacity-95">Simpan Nilai Final</Button>
      </div>
    </Modal>
  )
}
