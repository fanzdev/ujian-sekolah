import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Eye, TriangleAlert } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner, EmptyState } from '@/components/ui/Feedback'
import { RichContent } from '@/components/ui/RichTextEditor'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { getExam } from '@/services/exams.service'
import { getQuestionsByIds } from '@/services/questions.service'
import { QUESTION_TYPE_LABELS } from '@/lib/constants'
import type { AnswerValue, Question } from '@/types/models'

interface PreviewOption {
  id: string
  text: string
  mediaUrl: string | null
}

interface PreviewItem {
  id: string
  type: Question['type']
  text: string
  mediaUrl: string | null
  mediaType: Question['media_type']
  difficulty: Question['difficulty']
  options: PreviewOption[]
  pairs: { left: string; right: string }[]
}

function toPreviewItem(q: Question): PreviewItem {
  const options: PreviewOption[] = (q.question_options ?? []).map((o, idx) => ({
    id: o.id || `${q.id}-opt-${idx}`,
    text: o.option_text,
    mediaUrl: o.media_url ?? null,
  }))
  return {
    id: q.id,
    type: q.type,
    text: q.text,
    mediaUrl: q.media_url,
    mediaType: q.media_type,
    difficulty: q.difficulty,
    options,
    pairs: (q.matching_pairs ?? []).map((p) => ({ left: p.left_text, right: p.right_text })),
  }
}

export function ExamPreviewModal({
  open,
  onClose,
  examId,
  orderedQuestionIds,
}: {
  open: boolean
  onClose: () => void
  examId: string | null
  orderedQuestionIds: string[]
}) {
  const { profile, loading: authLoading } = useAuth()
  const toast = useToast()
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({})
  const idsKey = orderedQuestionIds.join('|')

  useEffect(() => {
    if (open) {
      setIndex(0)
      setAnswers({})
    }
  }, [open, examId, idsKey])

  const query = useAsync(async () => {
    if (!open || !examId) return null
    const [exam, questions] = await Promise.all([getExam(examId), getQuestionsByIds(orderedQuestionIds)])
    const byId = new Map(questions.map((q) => [q.id, q]))
    const ordered = orderedQuestionIds.map((id) => byId.get(id)).filter((q): q is Question => Boolean(q))
    return { exam, items: ordered.map(toPreviewItem) }
  }, [open, examId, idsKey])

  const items = useMemo(() => query.data?.items ?? [], [query.data])
  const exam = query.data?.exam ?? null

  useEffect(() => {
    if (open && query.error) toast.error(String(query.error))
  }, [open, query.error, toast])

  const role = profile?.role ?? ''
  const forbidden = !authLoading && role !== '' && role !== 'admin' && role !== 'teacher'

  const current = items[index]
  const setAnswer = (id: string, value: AnswerValue) => setAnswers((prev) => ({ ...prev, [id]: value }))
  const answeredCount = items.filter((it) => {
    const v = answers[it.id]
    return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)
  }).length

  return (
    <Modal open={open} onClose={onClose} title="Preview sebagai Siswa" size="xl">
      <div className="space-y-4 px-4 py-5 sm:px-6">
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p><span className="font-bold">Mode pratinjau, bukan ujian sebenarnya.</span> Jawaban yang Anda isi di sini tidak disimpan, tidak dinilai, dan tidak memengaruhi statistik, kuota, maupun status publikasi ujian.</p>
        </div>

        {authLoading || query.loading ? (
          <div className="flex justify-center py-14"><Spinner /></div>
        ) : forbidden ? (
          <EmptyState icon={<Eye className="h-6 w-6" />} title="Akses ditolak" description="Pratinjau hanya untuk guru dan admin." />
        ) : !exam || items.length === 0 ? (
          <EmptyState icon={<Eye className="h-6 w-6" />} title="Belum ada soal untuk dipratinjau" description="Tambahkan soal ke ujian terlebih dahulu, lalu buka pratinjau lagi." />
        ) : (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex flex-wrap items-center gap-2">
                <Eye className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">{exam.title}</h2>
              </div>
              {exam.instructions && <div className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{exam.instructions}</div>}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <Badge tone="blue">{items.length} soal</Badge>
                <Badge tone="gray">Durasi {exam.duration_minutes} menit</Badge>
                <Badge tone="green">{answeredCount} diisi (lokal)</Badge>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-5 md:grid-cols-8">
              {items.map((it, i) => {
                const v = answers[it.id]
                const filled = v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)
                return (
                  <button
                    key={it.id}
                    onClick={() => setIndex(i)}
                    aria-label={`Ke soal ${i + 1}`}
                    className={`rounded-lg border px-2 py-2 text-xs font-bold transition-colors ${i === index ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300' : filled ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'}`}
                  >
                    {i + 1}
                  </button>
                )
              })}
            </div>

            {current && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">Soal {index + 1} dari {items.length}</span>
                  <Badge tone="blue">{QUESTION_TYPE_LABELS[current.type]}</Badge>
                </div>
                {current.mediaUrl && (
                  <div className="mt-3">
                    {current.mediaType === 'audio' ? (
                      <audio controls src={current.mediaUrl} className="w-full" />
                    ) : current.mediaType === 'video' ? (
                      <video controls src={current.mediaUrl} className="max-h-64 w-full rounded-xl" />
                    ) : (
                      <img src={current.mediaUrl} alt="Media soal" className="max-h-64 rounded-xl border border-slate-200 object-contain dark:border-slate-700" />
                    )}
                  </div>
                )}
                <div className="mt-3"><RichContent html={current.text} /></div>
                <div className="mt-4"><PreviewAnswerInput item={current} value={answers[current.id] ?? null} onChange={(v) => setAnswer(current.id, v)} /></div>
                <div className="mt-5 flex items-center justify-between gap-2">
                  <Button variant="outline" size="sm" icon={<ChevronLeft className="h-4 w-4" />} disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>Sebelumnya</Button>
                  <Button variant="outline" size="sm" icon={<ChevronRight className="h-4 w-4" />} disabled={index >= items.length - 1} onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}>Selanjutnya</Button>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="ghost" onClick={onClose}>Tutup Pratinjau</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

function PreviewAnswerInput({ item, value, onChange }: { item: PreviewItem; value: AnswerValue; onChange: (v: AnswerValue) => void }) {
  if (item.type === 'multiple_choice') {
    const selected = typeof value === 'string' ? value : ''
    return (
      <div role="radiogroup" aria-label="Pilihan jawaban" className="space-y-2">
        {item.options.map((o, i) => (
          <button
            key={o.id}
            role="radio"
            aria-checked={selected === o.id}
            onClick={() => onChange(o.id)}
            className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm transition-colors ${selected === o.id ? 'border-primary-500 bg-primary-50 font-semibold text-primary-800 dark:bg-primary-500/10 dark:text-primary-200' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold dark:bg-slate-700">{String.fromCharCode(65 + i)}</span>
            <span className="flex-1">{o.text}</span>
          </button>
        ))}
      </div>
    )
  }
  if (item.type === 'multiple_response') {
    const selected = Array.isArray(value) ? (value as string[]) : []
    return (
      <div className="space-y-2">
        {item.options.map((o, i) => {
          const checked = selected.includes(o.id)
          return (
            <button
              key={o.id}
              role="checkbox"
              aria-checked={checked}
              onClick={() => onChange(checked ? selected.filter((s) => s !== o.id) : [...selected, o.id])}
              className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm transition-colors ${checked ? 'border-primary-500 bg-primary-50 font-semibold text-primary-800 dark:bg-primary-500/10 dark:text-primary-200' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-slate-300 text-xs font-bold dark:border-slate-600">{checked ? '✓' : ''}</span>
              <span className="flex-1"><span className="mr-2 font-bold">{String.fromCharCode(65 + i)}.</span>{o.text}</span>
            </button>
          )
        })}
        <p className="text-xs text-slate-400">Boleh pilih lebih dari satu jawaban.</p>
      </div>
    )
  }
  if (item.type === 'true_false') {
    const selected = typeof value === 'boolean' ? value : null
    return (
      <div className="grid grid-cols-2 gap-2">
        {([true, false] as const).map((v) => (
          <button
            key={String(v)}
            onClick={() => onChange(v)}
            aria-pressed={selected === v}
            className={`rounded-xl border-2 px-4 py-3 text-sm font-bold transition-colors ${selected === v ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'}`}
          >
            {v ? 'BENAR' : 'SALAH'}
          </button>
        ))}
      </div>
    )
  }
  if (item.type === 'matching') {
    const mapped = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, number>
    const rights = item.pairs.map((p) => p.right)
    return (
      <div className="space-y-2">
        {item.pairs.map((p, i) => (
          <div key={i} className="flex flex-col gap-1.5 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center dark:border-slate-700">
            <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">{p.left}</span>
            <select
              aria-label={`Pasangan untuk ${p.left}`}
              value={mapped[String(i)] ?? ''}
              onChange={(e) => onChange({ ...mapped, [String(i)]: Number(e.target.value) })}
              className="input-base sm:w-56"
            >
              <option value="">Pilih pasangan…</option>
              {rights.map((r, ri) => (
                <option key={ri} value={ri}>{r}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    )
  }
  if (item.type === 'short_answer') {
    return (
      <input
        aria-label="Jawaban singkat"
        placeholder="Ketik jawaban singkat…"
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        className="input-base"
      />
    )
  }
  const text = typeof value === 'string' ? value : ''
  const words = text.split(/\s+/).filter(Boolean).length
  return (
    <div>
      <textarea
        aria-label="Jawaban essay"
        rows={6}
        placeholder="Tulis jawaban essay…"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        className="input-base"
      />
      <p className="mt-1 text-right text-xs text-slate-400">{words} kata</p>
    </div>
  )
}
