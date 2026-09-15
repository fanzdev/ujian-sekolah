import { useEffect, useState } from 'react'
import { Send, Sparkles } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Checkbox } from '@/components/ui/FormControls'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Feedback'
import { useToast } from '@/hooks/useToast'
import { SUPABASE_URL } from '@/services/client'
import { aiGenerateQuestions, aiRefineQuestions, aiStatus, saveAiQuestionsToBank, type AiGeneratedQuestion, type AiProviderStatus, type AiQuestionType, type AiDifficulty } from '@/services/ai.service'
import { createBank } from '@/services/questions.service'
import { QUESTION_TYPE_LABELS, DIFFICULTY_LABELS } from '@/lib/constants'

export function AiBankModal({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: (bankId: string) => void
}) {
  const toast = useToast()
  const [checking, setChecking] = useState(true)
  const [active, setActive] = useState(false)
  const [detail, setDetail] = useState('')
  const [foundProviders, setFoundProviders] = useState<AiProviderStatus[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [topic, setTopic] = useState('')
  const [notes, setNotes] = useState('')
  const [count, setCount] = useState(5)
  const [selectedTypes, setSelectedTypes] = useState<AiQuestionType[]>(['multiple_choice', 'true_false', 'short_answer', 'essay'])
  const [difficulty, setDifficulty] = useState<AiDifficulty | 'mixed'>('mixed')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [preview, setPreview] = useState<AiGeneratedQuestion[] | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [refining, setRefining] = useState(false)

  const checkBackend = async () => {
    setChecking(true)
    try {
      const status = await aiStatus()
      setActive(status.configured)
      setFoundProviders(status.providers ?? [])
      if (status.configured) {
        setDetail('')
      } else if ((status.providers ?? []).length === 0) {
        setDetail('Backend menjawab, tetapi tidak ada provider terbaca dari secrets. Isi pasangan AI_BASE_URL_XX dan AI_API_KEY_XX pada panduan di bawah.')
      } else {
        setDetail('Backend menjawab dan provider terbaca, tetapi tidak ada model gratis yang bisa dipakai. Periksa kebenaran kunci tiap provider.')
      }
    } catch (err) {
      setActive(false)
      setFoundProviders([])
      setDetail(err instanceof Error ? err.message : 'Gagal menghubungi backend AI.')
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    void checkBackend()
  }, [])

  const toggleType = (t: AiQuestionType) => {
    if (selectedTypes.includes(t)) {
      if (selectedTypes.length === 1) {
        toast.error('Pilih minimal 1 jenis soal.')
        return
      }
      setSelectedTypes(selectedTypes.filter((x) => x !== t))
      return
    }
    setSelectedTypes([...selectedTypes, t])
  }

  const copyDiagnostics = async () => {
    let host = SUPABASE_URL
    try {
      host = new URL(SUPABASE_URL).hostname
    } catch {
      host = SUPABASE_URL
    }
    const info = [
      `Waktu: ${new Date().toISOString()}`,
      `Project: ${host}`,
      `Status AI: ${active ? 'siap' : 'belum aktif'}`,
      `Detail: ${detail || '-'}`,
      `Provider: ${foundProviders.map((p) => `${p.label}=${p.freeModels}`).join(', ') || '-'}`,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(info)
      toast.success('Info diagnostik disalin.')
    } catch {
      toast.error('Gagal menyalin info diagnostik.')
    }
  }

  const run = async () => {
    if (title.trim() === '') {
      toast.error('Judul bank soal wajib diisi.')
      return
    }
    if (topic.trim().length < 3) {
      toast.error('Topik minimal 3 karakter.')
      return
    }
    setGenerating(true)
    setPreview(null)
    setChatInput('')
    const typeParam: AiQuestionType | 'mixed' | AiQuestionType[] =
      selectedTypes.length >= 4 ? 'mixed' : selectedTypes.length === 1 ? (selectedTypes[0] ?? 'multiple_choice') : [...selectedTypes]
    try {
      const result = await aiGenerateQuestions({ topic: topic.trim(), count, type: typeParam, difficulty, notes })
      if (result.length === 0) {
        toast.error('AI tidak menghasilkan soal. Coba topik lain.')
        return
      }
      setPreview(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal membuat soal.')
    } finally {
      setGenerating(false)
    }
  }

  const applyLocalDelete = (instruction: string): boolean => {
    if (!/(hapus|buang|hilangkan|hapuskan)/i.test(instruction)) return false
    if (/(semua|seluruh|semuanya)/i.test(instruction)) {
      toast.error('Minimal sisakan 1 soal di pratinjau.')
      return true
    }
    const numbers = Array.from(instruction.matchAll(/\d+/g)).map((m) => Number(m[0]))
    if (numbers.length === 0) return false
    setPreview((current) => {
      if (!current) return current
      const drop = new Set(numbers.filter((n) => n >= 1 && n <= current.length))
      if (drop.size === 0) {
        toast.error(`Nomor soal tidak valid. Pilih 1 sampai ${current.length}.`)
        return current
      }
      if (drop.size >= current.length) {
        toast.error('Minimal sisakan 1 soal di pratinjau.')
        return current
      }
      const rest = current.filter((_, idx) => !drop.has(idx + 1))
      toast.success(`${drop.size} soal dihapus dari pratinjau.`)
      return rest
    })
    setChatInput('')
    return true
  }

  const sendChat = async () => {
    if (!preview || preview.length === 0 || refining) return
    const instruction = chatInput.trim()
    if (instruction.length < 3) {
      toast.error('Tulis perintah revisi minimal 3 karakter.')
      return
    }
    if (applyLocalDelete(instruction)) return
    setRefining(true)
    try {
      const result = await aiRefineQuestions({ questions: preview, instruction })
      if (result.length === 0) {
        toast.error('AI tidak menghasilkan revisi. Coba perintah lain.')
        return
      }
      setPreview(result)
      setChatInput('')
      toast.success(`Revisi selesai. Pratinjau kini ${result.length} soal.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyunting soal.')
    } finally {
      setRefining(false)
    }
  }

  const save = async () => {
    if (!preview || preview.length === 0 || saving) return
    setSaving(true)
    setSavedCount(0)
    try {
      const bank = await createBank({ title: title.trim(), description: description.trim() || null, grade_level: null, status: 'draft', tags: [] })
      const { done, errors } = await saveAiQuestionsToBank(bank.id, preview, (d) => setSavedCount(d))
      if (done > 0) {
        toast.success(`Bank "${bank.title}" dibuat dengan ${done} soal AI.`)
        onSaved(bank.id)
      } else {
        toast.error(errors[0] ?? 'Gagal menyimpan soal.')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal membuat bank soal.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Buat Bank Soal dengan AI" size="lg">
      <div className="space-y-4 px-4 py-5 sm:px-6">
        {checking ? (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-800/50">
            <Spinner className="h-4 w-4" />
            <p className="text-xs text-slate-500 dark:text-slate-400">Memeriksa layanan AI…</p>
          </div>
        ) : active ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
            <Badge tone="green">AI siap</Badge>
            {foundProviders.map((p) => (
              <span key={p.index} className="text-[11px] text-emerald-800 dark:text-emerald-200">{p.label}: {p.freeModels} model gratis</span>
            ))}
          </div>
        ) : (
          <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone="amber">AI belum aktif</Badge>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => void copyDiagnostics()}>Salin Diagnostik</Button>
                <Button size="sm" variant="ghost" onClick={() => void checkBackend()}>Periksa Lagi</Button>
              </div>
            </div>
            {detail !== '' && (
              <p className="text-[11px] leading-relaxed text-amber-900/80 dark:text-amber-200/80">{detail}</p>
            )}
            <details className="text-[11px] text-amber-900/80 dark:text-amber-200/80">
              <summary className="cursor-pointer font-bold">Lihat cara mengaktifkan</summary>
              <ol className="mt-2 list-decimal space-y-1.5 pl-4 leading-relaxed">
                <li>Jalankan di terminal laptop: <code className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">supabase functions deploy ai-proxy</code></li>
                <li>Pasang kunci gratis tiap provider: <code className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">supabase secrets set AI_BASE_URL_01=https://openrouter.ai/api/v1 AI_API_KEY_01=isi-kunci-anda</code> (lanjutkan _02, _03 untuk provider lain).</li>
                <li>Kunci gratis bisa dari provider mana pun yang kompatibel OpenAI: OpenRouter, UnoRouter, Groq, Cerebras, SambaNova, Gemini, Pollinations, dan lainnya.</li>
              </ol>
            </details>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Judul Bank Soal" placeholder="cth: Bank Soal IPA Kelas VIII" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
          <Input label="Jumlah Soal" type="number" min={1} max={20} value={count} onChange={(e) => setCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))} />
        </div>
        <Textarea label="Deskripsi (opsional)" placeholder="Deskripsi singkat isi bank soal" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Textarea label="Topik / Materi" placeholder="cth: Fotosintesis pada tumbuhan" value={topic} onChange={(e) => setTopic(e.target.value)} required />
        <Textarea label="Instruksi Tambahan untuk AI (opsional)" placeholder="cth: pakai bahasa sederhana, sertakan soal hitungan, fokus pada daur Calvin" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="label-base">Jenis Soal <span className="font-normal text-slate-400">(boleh lebih dari satu)</span></p>
            <div className="grid gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              {(['multiple_choice', 'true_false', 'short_answer', 'essay'] as AiQuestionType[]).map((t) => (
                <Checkbox key={t} label={QUESTION_TYPE_LABELS[t]} checked={selectedTypes.includes(t)} onChange={() => toggleType(t)} />
              ))}
            </div>
          </div>
          <Select label="Kesulitan" value={difficulty} onChange={(e) => setDifficulty(e.target.value as AiDifficulty | 'mixed')} options={[
            { value: 'mixed', label: 'Campuran' },
            { value: 'easy', label: DIFFICULTY_LABELS.easy },
            { value: 'medium', label: DIFFICULTY_LABELS.medium },
            { value: 'hard', label: DIFFICULTY_LABELS.hard },
          ]} />
        </div>
        {!preview && (
          <div className="flex justify-end">
            <Button onClick={() => void run()} loading={generating} icon={<Sparkles className="h-4 w-4" />}>
              Buatkan Soal
            </Button>
          </div>
        )}
        {preview && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="green">{preview.length} soal siap disimpan</Badge>
              <p className="text-xs text-slate-400">Bank soal otomatis dibuat saat Anda klik Simpan.</p>
            </div>
            <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {preview.map((q, i) => (
                <li key={i} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed dark:border-slate-700 dark:bg-slate-800/50">
                  <p className="font-semibold text-slate-700 dark:text-slate-200">{i + 1}. {q.question}</p>
                  <p className="mt-1 text-slate-400">Kunci: {q.correctAnswer || '-'}</p>
                </li>
              ))}
            </ul>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Perintah lanjutan untuk AI</p>
              <p className="mt-0.5 text-[11px] text-slate-400">cth: ubah soal no 2 jadi lebih sulit · tambah 2 soal essay · hapus soal no 3 (perintah hapus dikerjakan langsung)</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Input placeholder="Tulis perintah revisi…" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void sendChat() }} />
                <Button onClick={() => void sendChat()} loading={refining} icon={<Send className="h-4 w-4" />} className="shrink-0">
                  Kirim
                </Button>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPreview(null)}>Ulangi</Button>
              <Button onClick={() => void save()} loading={saving} icon={<Sparkles className="h-4 w-4" />}>
                {saving ? `Menyimpan ${savedCount}/${preview.length}…` : 'Simpan Bank & Soal'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
