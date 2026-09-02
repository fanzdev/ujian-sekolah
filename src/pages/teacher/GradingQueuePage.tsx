import { useState } from 'react'
import { PencilRuler, Sparkles, Save, Search } from 'lucide-react'
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
import { listEssayQueue, getEssayDetail, gradeEssayFinal, requestAiGrade } from '@/services/grading.service'
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
  const pending = rows.filter((r) => r.status === 'pending' || r.status === 'ai_graded')

  return (
    <>
      <PageHeader
        title="Penilaian Essay"
        subtitle={`${pending.length} jawaban menunggu penilaian final`}
        icon={<PencilRuler className="h-5 w-5" />}
      />

      <Card>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
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

        {query.loading ? (
          <div className="flex justify-center py-14"><Spinner /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<PencilRuler className="h-6 w-6" />} title="Tidak ada essay untuk dinilai" description="Jawaban essay muncul di sini setelah siswa mengumpulkan ujian." />
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((r) => (
              <button key={r.answer_id} onClick={() => setActiveItem(r)} className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-slate-800">
                    {r.student_name}
                    <span className="ml-2 font-normal text-slate-400">NIS {r.student_nis ?? '-'}</span>
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{r.question_text.replace(/<[^>]*>/g, '').slice(0, 120)}</p>
                </div>
                {r.status === 'graded' ? (
                  <Badge tone="green">Nilai: {Number(r.final_score).toLocaleString('id-ID')}/{r.max_points}</Badge>
                ) : r.status === 'ai_graded' ? (
                  <Badge tone="sky">AI: {r.ai_score !== null ? Number(r.ai_score).toLocaleString('id-ID') : '-'} · Perlu review</Badge>
                ) : (
                  <Badge tone="amber" dot>Menunggu</Badge>
                )}
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

  const [score, setScore] = useState<number | ''>(item.final_score !== null ? Number(item.final_score) : item.ai_score !== null ? Number(item.ai_score) : '')
  const [feedback, setFeedback] = useState(item.final_feedback ?? item.ai_feedback ?? '')
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)

  if (detailQuery.loading || !detailQuery.data) {
    return (
      <Modal open onClose={onClose} title="Memuat..." size="lg">
        <div className="flex justify-center py-14"><Spinner /></div>
      </Modal>
    )
  }

  const detail = detailQuery.data

  const runAi = async () => {
    setAiLoading(true)
    try {
      const result = await requestAiGrade(item.attempt_id, item.question_id)
      setScore(Number(result.score.toFixed(1)))
      setFeedback(result.feedback)
      toast.success(`AI menyarankan nilai ${result.score.toFixed(1)}. Review lalu simpan.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memanggil AI.')
    } finally {
      setAiLoading(false)
    }
  }

  const saveFinal = async () => {
    if (score === '' || Number(score) < 0 || Number(score) > item.max_points) {
      toast.error(`Nilai harus antara 0 dan ${item.max_points}.`)
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
        <div>
          <p className="label-base">Soal</p>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">{detail.questionText.replace(/<[^>]*>/g, '')}</div>
        </div>

        <div>
          <p className="label-base flex items-center justify-between">
            Jawaban Siswa
            <span className="text-[11px] font-normal normal-case text-slate-400">{detail.answerText.split(/\s+/).filter(Boolean).length} kata</span>
          </p>
          <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap scrollbar-thin">{detail.answerText || '(kosong)'}</div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={`Nilai Final * (maks. ${detail.maxPoints})`}
            type="number"
            step={0.5}
            min={0}
            max={detail.maxPoints}
            value={score}
            onChange={(e) => setScore(e.target.value === '' ? '' : Number(e.target.value))}
            required
          />
          <div className="flex items-end pb-1">
            <Button variant="outline" onClick={runAi} loading={aiLoading} icon={<Sparkles className="h-4 w-4" />} className="w-full">
              Saran Nilai dari AI
            </Button>
          </div>
        </div>

        <Textarea label="Umpan Balik untuk Siswa" placeholder="Komentar singkat mengenai jawaban siswa..." value={feedback} onChange={(e) => setFeedback(e.target.value)} />

        {item.status === 'ai_graded' && (
          <p className="rounded-lg bg-sky-50 px-4 py-2.5 text-xs text-sky-700">
            Nilai AI tersedia sebagai saran ({item.ai_score}). Anda bebas mengubah nilai final — nilai guru selalu yang dipakai.
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
        <Button variant="ghost" onClick={onClose}>Batal</Button>
        <Button onClick={saveFinal} loading={saving} icon={<Save className="h-4 w-4" />}>Simpan Nilai Final</Button>
      </div>
    </Modal>
  )
}
