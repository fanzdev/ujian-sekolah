import { useState } from 'react'
import { Bot, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Feedback'
import { useToast } from '@/hooks/useToast'
import { veyraGenerateQuestions, VeyraAiError } from '@/services/veyra-ai.service'
import { createBank, createQuestion } from '@/services/questions.service'
import { QUESTION_TYPE_LABELS, DIFFICULTY_LABELS } from '@/lib/constants'
import type { Difficulty, QuestionType } from '@/types/models'
import type { GeneratedQuestion } from '@/services/ai-providers/interface'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

export function VeyraAiModal({ onClose, onSaved }: { onClose: () => void; onSaved: (bankId: string) => void }) {
  const toast = useToast()
  const [subject, setSubject] = useState('')
  const [gradeLevel, setGradeLevel] = useState('')
  const [material, setMaterial] = useState('')
  const [count, setCount] = useState(5)
  const [type, setType] = useState<QuestionType | 'mixed'>('mixed')
  const [difficulty, setDifficulty] = useState<Difficulty | 'mixed'>('mixed')
  const [bankTitle, setBankTitle] = useState('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [items, setItems] = useState<GeneratedQuestion[] | null>(null)

  const run = async () => {
    if (subject.trim() === '') {
      toast.error('Mata pelajaran wajib diisi.')
      return
    }
    if (material.trim().length < 10) {
      toast.error('Materi minimal 10 karakter agar soal relevan.')
      return
    }
    setGenerating(true)
    setItems(null)
    try {
      const result = await veyraGenerateQuestions({ subject: subject.trim(), gradeLevel: gradeLevel.trim(), material: material.trim(), count, type, difficulty })
      setItems(result)
      if (bankTitle.trim() === '') setBankTitle(`Bank ${subject.trim()} — Draf Veyra AI`)
      toast.success('Soal berhasil dibuat. Periksa sebelum disimpan sebagai draf.')
    } catch (err) {
      toast.error(err instanceof VeyraAiError ? err.message : err instanceof Error ? err.message : 'Veyra AI gagal membuat soal. Silakan coba lagi.')
    } finally {
      setGenerating(false)
    }
  }

  const removeAt = (idx: number) => {
    setItems((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev))
  }

  const editAt = (idx: number, patch: Partial<GeneratedQuestion>) => {
    setItems((prev) => (prev ? prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)) : prev))
  }

  const save = async () => {
    if (!items || items.length === 0 || saving) return
    if (bankTitle.trim() === '') {
      toast.error('Judul bank draf wajib diisi.')
      return
    }
    setSaving(true)
    setSavedCount(0)
    try {
      const bank = await createBank({ title: bankTitle.trim(), description: `Draf hasil Veyra AI — ${subject.trim()}`, grade_level: null, status: 'draft', tags: ['veyra-ai', 'draf'] })
      let done = 0
      for (const q of items) {
        try {
          await createQuestion(toQuestionInput(bank.id, q))
          done += 1
          setSavedCount(done)
        } catch {
          continue
        }
      }
      if (done > 0) {
        toast.success(`${done} soal tersimpan sebagai draf. Lanjut review lalu preview sebelum publish.`)
        onSaved(bank.id)
      } else {
        toast.error('Soal gagal dibuat. Coba lagi.')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan bank draf.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Veyra AI — Buat Soal" size="lg">
      <div className="space-y-4 px-4 py-5 sm:px-6">
        <div className="flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-4 py-2.5 text-xs text-primary-800 dark:border-primary-500/30 dark:bg-primary-500/10 dark:text-primary-200">
          <Bot className="h-4 w-4 shrink-0" />
          <p>Hasil AI tidak langsung dipublikasikan. Periksa, sunting, simpan sebagai draf, lalu gunakan Preview sebagai Siswa sebelum publish.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Mata Pelajaran" placeholder="cth: Matematika" value={subject} onChange={(e) => setSubject(e.target.value)} required autoFocus />
          <Input label="Kelas" placeholder="cth: 10" value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} />
        </div>
        <Textarea label="Materi Sumber" placeholder="Tempel materi pembelajaran di sini. AI hanya membuat soal yang relevan dengan materi ini." value={material} onChange={(e) => setMaterial(e.target.value)} required />
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Jumlah" type="number" min={1} max={20} value={count} onChange={(e) => setCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))} />
          <Select label="Jenis" value={type} onChange={(e) => setType(e.target.value as QuestionType | 'mixed')} options={[{ value: 'mixed', label: 'Campuran' }, ...Object.entries(QUESTION_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))]} />
          <Select label="Kesulitan" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty | 'mixed')} options={[{ value: 'mixed', label: 'Campuran' }, ...Object.entries(DIFFICULTY_LABELS).map(([v, l]) => ({ value: v, label: l }))]} />
        </div>

        {!items && (
          <div className="flex justify-end">
            <Button onClick={() => void run()} loading={generating} icon={<Bot className="h-4 w-4" />}>
              {generating ? 'Veyra AI sedang membuat soal…' : 'Buatkan Soal'}
            </Button>
          </div>
        )}

        {generating && (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
            <Spinner className="h-4 w-4" />
            <p>Veyra AI sedang membuat soal…</p>
          </div>
        )}

        {items && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="green">{items.length} draf soal — wajib direview</Badge>
            </div>
            <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {items.map((q, i) => (
                <li key={i} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/50">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{i + 1}. {QUESTION_TYPE_LABELS[q.type]} · {DIFFICULTY_LABELS[q.difficulty]}</p>
                    <button onClick={() => removeAt(i)} aria-label={`Hapus draf soal ${i + 1}`} className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <Textarea aria-label={`Teks draf soal ${i + 1}`} value={q.question} onChange={(e) => editAt(i, { question: e.target.value })} />
                  {q.options && <p className="text-[11px] leading-relaxed text-slate-400">Opsi: {q.options.map((o, oi) => `${LETTERS[oi] ?? ''}. ${o}`).join(' · ')}</p>}
                  <Input aria-label={`Kunci draf soal ${i + 1}`} placeholder="Kunci jawaban" value={q.correctAnswer} onChange={(e) => editAt(i, { correctAnswer: e.target.value })} />
                </li>
              ))}
            </ul>
            {items.length === 0 && <p className="text-xs text-slate-400">Semua draf dihapus. Klik Ulangi untuk membuat lagi.</p>}
            <Input label="Judul Bank Draf" placeholder="cth: Bank Matematika Kelas 10 — Draf" value={bankTitle} onChange={(e) => setBankTitle(e.target.value)} required />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setItems(null)}>Ulangi</Button>
              <Button onClick={() => void save()} loading={saving} icon={<Bot className="h-4 w-4" />}>
                {saving ? `Menyimpan ${savedCount}/${items.length}…` : 'Simpan sebagai Draf'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function toQuestionInput(bankId: string, q: GeneratedQuestion) {
  const scoringRule: Record<string, unknown> = {}
  let options: { option_text: string; is_correct: boolean }[] | undefined
  let pairs: { left_text: string; right_text: string }[] | undefined
  if (q.type === 'multiple_choice' || q.type === 'multiple_response') {
    const picked = q.correctAnswer.toUpperCase().split(',').map((s) => s.trim()).filter(Boolean)
    options = (q.options ?? []).map((text, idx) => ({ option_text: text, is_correct: picked.includes(LETTERS[idx] ?? '') }))
    if (!options.some((o) => o.is_correct) && options.length > 0 && options[0]) options[0].is_correct = true
    if (q.type === 'multiple_response') scoringRule.partial = false
  } else if (q.type === 'true_false') {
    const norm = q.correctAnswer.toLowerCase()
    scoringRule.tf_answer = ['benar', 'true', 'b', '1', 'ya'].includes(norm)
  } else if (q.type === 'short_answer') {
    scoringRule.match_mode = 'exact'
    scoringRule.accepted = q.correctAnswer.split(';').map((s) => s.trim()).filter(Boolean)
  } else if (q.type === 'matching') {
    pairs = (q.pairs ?? []).map((p) => ({ left_text: p.left, right_text: p.right }))
  } else {
    scoringRule.rubric = q.explanation
  }
  return {
    bank_id: bankId,
    type: q.type,
    text: q.question,
    difficulty: q.difficulty,
    points: 1,
    explanation: q.explanation || null,
    scoring_rule: scoringRule,
    options,
    pairs,
  }
}
