import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/hooks/useToast'
import { aiGenerateQuestions, type AiGeneratedQuestion, type AiQuestionType, type AiDifficulty } from '@/services/ai.service'
import { QUESTION_TYPE_LABELS, DIFFICULTY_LABELS } from '@/lib/constants'

const TYPE_OPTIONS: { value: AiQuestionType | 'mixed'; label: string }[] = [
  { value: 'mixed', label: 'Campuran' },
  { value: 'multiple_choice', label: QUESTION_TYPE_LABELS.multiple_choice },
  { value: 'true_false', label: QUESTION_TYPE_LABELS.true_false },
  { value: 'short_answer', label: QUESTION_TYPE_LABELS.short_answer },
  { value: 'essay', label: QUESTION_TYPE_LABELS.essay },
]

const DIFF_OPTIONS: { value: AiDifficulty | 'mixed'; label: string }[] = [
  { value: 'mixed', label: 'Campuran' },
  { value: 'easy', label: DIFFICULTY_LABELS.easy },
  { value: 'medium', label: DIFFICULTY_LABELS.medium },
  { value: 'hard', label: DIFFICULTY_LABELS.hard },
]

export function AiGenerateModal({
  onClose,
  onGenerated,
}: {
  onClose: () => void
  onGenerated: (questions: AiGeneratedQuestion[]) => void
}) {
  const toast = useToast()
  const [topic, setTopic] = useState('')
  const [count, setCount] = useState(5)
  const [type, setType] = useState<AiQuestionType | 'mixed'>('mixed')
  const [difficulty, setDifficulty] = useState<AiDifficulty | 'mixed'>('mixed')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<AiGeneratedQuestion[] | null>(null)

  const run = async () => {
    if (topic.trim().length < 3) {
      toast.error('Topik minimal 3 karakter.')
      return
    }
    setLoading(true)
    setPreview(null)
    try {
      const result = await aiGenerateQuestions({ topic: topic.trim(), count, type, difficulty })
      if (result.length === 0) {
        toast.error('AI tidak menghasilkan soal. Coba topik lain.')
        return
      }
      setPreview(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal membuat soal.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Buat Soal dengan AI" size="lg">
      <div className="space-y-4 px-4 py-5 sm:px-6">
        <Textarea label="Topik / Materi" placeholder="cth: Fotosintesis pada tumbuhan" value={topic} onChange={(e) => setTopic(e.target.value)} required />
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Jumlah" type="number" min={1} max={20} value={count} onChange={(e) => setCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))} />
          <Select label="Jenis" value={type} onChange={(e) => setType(e.target.value as AiQuestionType | 'mixed')} options={TYPE_OPTIONS} />
          <Select label="Kesulitan" value={difficulty} onChange={(e) => setDifficulty(e.target.value as AiDifficulty | 'mixed')} options={DIFF_OPTIONS} />
        </div>
        <div className="flex justify-end">
          <Button onClick={() => void run()} loading={loading} icon={<Sparkles className="h-4 w-4" />}>
            Buatkan Soal
          </Button>
        </div>
        {preview && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge tone="green">{preview.length} soal siap disimpan</Badge>
              <p className="text-xs text-slate-400">Periksa dulu sebelum disimpan ke bank.</p>
            </div>
            <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {preview.map((q, i) => (
                <li key={i} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed dark:border-slate-700 dark:bg-slate-800/50">
                  <p className="font-semibold text-slate-700 dark:text-slate-200">{i + 1}. {q.question}</p>
                  <p className="mt-1 text-slate-400">Kunci: {q.correctAnswer || '-'}</p>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>Tutup</Button>
              <Button onClick={() => onGenerated(preview)}>Simpan ke Bank Soal</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
