import { useRef, useState } from 'react'
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom'
import {
  ArrowLeft, Plus, Pencil, Trash2, HelpCircle, Image as ImageIcon,
  UploadCloud, X,
} from 'lucide-react'
import { useAsync, useDebounce, useDocumentTitle } from '@/hooks/useAsync'
import { useToast } from '@/hooks/useToast'
import { useConfirm } from '@/hooks/useConfirm'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { SearchInput, ToggleSwitch } from '@/components/ui/FormControls'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { DataTable, Pagination } from '@/components/ui/DataTable'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback'
import { RichTextEditor, RichContent } from '@/components/ui/RichTextEditor'
import { QUESTION_TYPE_LABELS, DIFFICULTY_LABELS } from '@/lib/constants'
import { stripHtml } from '@/lib/sanitize'
import { uploadMedia } from '@/services/storage.service'
import type { Difficulty, Question, QuestionType } from '@/types/models'

type Mode = 'bank' | 'all'

export default function BankQuestionsPage({ mode = 'bank' }: { mode?: Mode }) {
  const params = useParams()
  const bankId = mode === 'bank' ? params.bankId : undefined
  const navigate = useNavigate()
  const location = useLocation()
  const role = location.pathname.split('/')[1] ?? 'admin'
  const toast = useToast()
  const confirmDialog = useConfirm()

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null)
  const [defaultType, setDefaultType] = useState<QuestionType>('multiple_choice')
  const [newQuestionNum, setNewQuestionNum] = useState(1)
  const [editQuestionNum, setEditQuestionNum] = useState(1)
  const PAGE_SIZE = 10

  const banksQuery = useAsync(() => import('@/services/questions.service').then((m) => m.listBanks({ pageSize: 100 })), [])
  const query = useAsync(
    () =>
      import('@/services/questions.service').then((m) =>
        m.listQuestions({
          bankId,
          search: debouncedSearch || undefined,
          type: (typeFilter || undefined) as QuestionType | undefined,
          difficulty: (difficultyFilter || undefined) as Difficulty | undefined,
          page,
          pageSize: PAGE_SIZE,
        }),
      ),
    [bankId, debouncedSearch, typeFilter, difficultyFilter, page],
  )

  const title = mode === 'all' ? 'Semua Soal' : banksQuery.data?.rows.find((b) => b.id === bankId)?.title ?? 'Soal'

  useDocumentTitle(mode === 'all' ? 'Semua Soal' : `Soal · ${title}`)

  const rowsRef = useRef<Question[]>([])
  if (query.data?.rows) rowsRef.current = query.data.rows

  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 animate-fade-in">
        <div className="flex items-center gap-3">
          {mode === 'bank' && (
            <Link
              to={`/${role}/question-banks`}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
              aria-label="Kembali ke bank soal"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          )}
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
            <p className="mt-0.5 text-sm text-slate-400">
              {mode === 'bank' ? 'Kelola koleksi soal dalam bank ini' : 'Seluruh soal yang dapat Anda akses'}
            </p>
          </div>
        </div>
        <Button
          icon={<Plus className="h-4 w-4" />}
          onClick={() => {
            setEditingQuestion(null)
            setDefaultType('multiple_choice')
            setNewQuestionNum((query.data?.total ?? 0) + 1)
            setEditorOpen(true)
          }}
        >
          Buat Soal
        </Button>
      </div>

      {mode === 'all' && (
        <Card className="mb-4">
          <div className="p-4">
            <Select
              label="Filter per bank"
              placeholder="Semua bank"
              value={bankId ?? ''}
              onChange={(e) => {
                if (e.target.value) navigate(`/${role}/question-banks/${e.target.value}`)
                else navigate(`/${role}/questions`)
              }}
              options={(banksQuery.data?.rows ?? []).map((b) => ({ value: b.id, label: b.title }))}
            />
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <SearchInput placeholder="Cari teks soal..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
          <Select
            className="w-full sm:w-48"
            placeholder="Semua Tipe"
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
            options={Object.entries(QUESTION_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
          />
          <Select
            className="w-full sm:w-40"
            placeholder="Semua Level"
            value={difficultyFilter}
            onChange={(e) => { setDifficultyFilter(e.target.value); setPage(1) }}
            options={Object.entries(DIFFICULTY_LABELS).map(([v, l]) => ({ value: v, label: l }))}
          />
        </div>

        {query.loading ? (
          <TableSkeleton cols={4} />
        ) : (
          <>
            <DataTable
              columns={[
                {
                  key: 'text',
                  header: 'Soal',
                  render: (q) => (
                    <div className="max-w-md">
                      <RichContent html={q.text} className="line-clamp-2 [&_*]:text-[13px]" />
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge tone="blue">{QUESTION_TYPE_LABELS[q.type]}</Badge>
                        <Badge tone={q.difficulty === 'easy' ? 'green' : q.difficulty === 'hard' ? 'red' : 'amber'}>
                          {DIFFICULTY_LABELS[q.difficulty]}
                        </Badge>
                        <Badge tone="gray">{q.points} poin</Badge>
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'media',
                  header: 'Media',
                  render: (q) => (q.media_url ? <ImageIcon className="h-4 w-4 text-slate-400" /> : <span className="text-slate-300">-</span>),
                },
                {
                  key: 'actions',
                  header: '',
                  render: (q, rowIndex) => (
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => {
                          setEditingQuestion(q)
                          setEditQuestionNum((page - 1) * PAGE_SIZE + rowIndex + 1)
                          setEditorOpen(true)
                        }}
                        title="Ubah"
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-sky-50 hover:text-sky-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await confirmDialog.confirm({
                            title: 'Hapus Soal?',
                            message: 'Soal akan dihapus permanen dari bank.',
                            danger: true,
                            confirmText: 'Hapus',
                          })
                          if (!ok) return
                          try {
                            const m = await import('@/services/questions.service')
                            await m.deleteQuestion(q.id)
                            toast.success('Soal dihapus.')
                            query.reload()
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : 'Gagal menghapus.')
                          }
                        }}
                        title="Hapus"
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ),
                  headerClassName: 'text-right w-28',
                },
              ]}
              data={query.data?.rows ?? []}
              rowKey={(q) => q.id}
              emptyState={
                <EmptyState
                  icon={<HelpCircle className="h-6 w-6" />}
                  title="Belum ada soal"
                  description="Mulai tambahkan soal pertama ke dalam koleksi ini."
                  action={<Button size="sm" onClick={() => setEditorOpen(true)} icon={<Plus className="h-4 w-4" />}>Buat Soal</Button>}
                />
              }
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={query.data?.total ?? 0} onPageChange={setPage} />
          </>
        )}
      </Card>

      {editorOpen && (
        <QuestionEditorModal
          key={editingQuestion?.id ?? `new-${defaultType}`}
          open={editorOpen}
          bankId={bankId}
          editing={editingQuestion}
          defaultType={defaultType}
          questionNumber={editingQuestion ? editQuestionNum : newQuestionNum}
          onClose={() => setEditorOpen(false)}
          onSaved={() => {
            setEditorOpen(false)
            query.reload()
          }}
          onSavedAndNext={() => {
            if (editingQuestion) {
              const currentIdx = rowsRef.current.findIndex((r) => r.id === editingQuestion.id)
              const next = currentIdx >= 0 ? rowsRef.current[currentIdx + 1] : undefined
              query.reload()
              if (next) {
                setEditingQuestion(next)
                setEditQuestionNum((page - 1) * PAGE_SIZE + currentIdx + 2)
              } else {
                setEditorOpen(false)
              }
            } else {
              query.reload()
              setNewQuestionNum((n) => n + 1)
            }
          }}
        />
      )}
    </>
  )
}

interface EditorForm {
  type: QuestionType
  bank_id: string
  text: string
  points: number
  difficulty: Difficulty
  media_url: string | null
  media_type: 'image' | 'audio' | 'video' | null
  explanation: string
  tf_answer: boolean
  sa_mode: string
  sa_accepted: string
  partial_mr: boolean
  min_words: number
  max_words: number
  rubric: string
  options: { option_text: string; is_correct: boolean; media_url?: string | null }[]
  pairs: { left_text: string; right_text: string }[]
}

function QuestionEditorModal({
  open,
  bankId,
  editing,
  defaultType,
  questionNumber,
  onClose,
  onSaved,
  onSavedAndNext,
}: {
  open: boolean
  bankId: string | undefined
  editing: Question | null
  defaultType: QuestionType
  questionNumber?: number
  onClose: () => void
  onSaved: () => void
  onSavedAndNext?: () => void
}) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const makeDefault = (overrides?: Partial<EditorForm>): EditorForm => ({
    type: editing?.type ?? defaultType,
    bank_id: editing?.bank_id ?? bankId ?? '',
    text: editing?.text ?? '',
    points: Number(editing?.points ?? 1),
    difficulty: editing?.difficulty ?? 'medium',
    media_url: editing?.media_url ?? null,
    media_type: editing?.media_type ?? null,
    explanation: editing?.explanation ?? '',
    tf_answer:
      editing?.scoring_rule?.tf_answer === true ||
      editing?.default_answer?.answer === 'true' ||
      false,
    sa_mode: String(editing?.scoring_rule?.match_mode ?? 'exact'),
    sa_accepted: ((editing?.default_answer?.accepted as string[]) ?? []).join(' ; '),
    partial_mr: editing?.scoring_rule?.partial === true,
    min_words: Number(editing?.scoring_rule?.min_words ?? 0),
    max_words: Number(editing?.scoring_rule?.max_words ?? 0),
    rubric: String(editing?.scoring_rule?.rubric ?? ''),
    options: editing?.question_options?.length
      ? editing.question_options.map((o) => ({ option_text: o.option_text, is_correct: o.is_correct }))
      : [
          { option_text: '', is_correct: true },
          { option_text: '', is_correct: false },
          { option_text: '', is_correct: false },
          { option_text: '', is_correct: false },
        ],
    pairs: editing?.matching_pairs?.length
      ? editing.matching_pairs.map((p) => ({ left_text: p.left_text, right_text: p.right_text }))
      : [
          { left_text: '', right_text: '' },
          { left_text: '', right_text: '' },
        ],
    ...overrides,
  })

  const [form, setForm] = useState<EditorForm>(() => makeDefault())

  const banksQuery = useAsync(() => import('@/services/questions.service').then((m) => m.listBanks({ pageSize: 100 })), [])

  const needsOptions = form.type === 'multiple_choice' || form.type === 'multiple_response'

  const validate = (): string | null => {
    if (!form.bank_id) return 'Pilih bank soal terlebih dahulu.'
    if (stripHtml(form.text).length < 5) return 'Teks pertanyaan minimal 5 karakter.'
    if (form.points <= 0) return 'Poin harus lebih besar dari 0.'
    if (needsOptions) {
      if (form.options.filter((o) => o.option_text.trim()).length < 2) return 'Minimal 2 pilihan jawaban.'
      const correctCount = form.options.filter((o) => o.is_correct && o.option_text.trim()).length
      if (form.type === 'multiple_choice' && correctCount !== 1) return 'PG harus tepat satu jawaban benar.'
      if (form.type === 'multiple_response' && correctCount < 1) return 'PG Kompleks butuh minimal satu jawaban benar.'
    }
    if (form.type === 'matching') {
      if (form.pairs.filter((p) => p.left_text.trim() && p.right_text.trim()).length < 2)
        return 'Menjodohkan butuh minimal 2 pasangan valid.'
    }
    if (form.type === 'short_answer') {
      if (form.sa_mode !== 'numeric' && !form.sa_accepted.trim()) return 'Isi minimal satu jawaban yang diterima.'
      if (form.sa_mode === 'numeric' && !form.sa_accepted.trim()) return 'Isi angka jawaban benar.'
    }
    return null
  }

  const submit = async (saveAndNext = false) => {
    const error = validate()
    if (error) {
      toast.error(error)
      return
    }
    setSaving(true)
    try {
      const scoringRule: Record<string, unknown> = {}
      if (form.type === 'true_false') scoringRule.tf_answer = form.tf_answer
      if (form.type === 'short_answer') {
        scoringRule.match_mode = form.sa_mode
        scoringRule.accepted = form.sa_accepted.split(';').map((s) => s.trim()).filter(Boolean)
        if (form.sa_mode === 'numeric') {
          scoringRule.tolerance = 0
        }
      }
      if (form.type === 'essay') {
        scoringRule.min_words = form.min_words
        scoringRule.max_words = form.max_words
        scoringRule.rubric = form.rubric
      }
      if (form.type === 'multiple_response') scoringRule.partial = form.partial_mr

      const payload = {
        bank_id: form.bank_id,
        type: form.type,
        text: form.text,
        media_url: form.media_url,
        media_type: form.media_type,
        difficulty: form.difficulty,
        points: form.points,
        explanation: form.explanation || null,
        scoring_rule: scoringRule,
        options: needsOptions
          ? form.options.filter((o) => o.option_text.trim()).map((o) => ({ option_text: o.option_text.trim(), is_correct: o.is_correct }))
          : undefined,
        pairs:
          form.type === 'matching'
            ? form.pairs.filter((p) => p.left_text.trim() && p.right_text.trim())
            : undefined,
      }

      const m = await import('@/services/questions.service')
      if (editing) {
        await m.updateQuestion(editing.id, payload)
        toast.success('Soal diperbarui.')
      } else {
        await m.createQuestion(payload)
        toast.success('Soal ditambahkan.')
      }

      if (saveAndNext && !editing) {
        setForm(makeDefault({ bank_id: form.bank_id, type: form.type, difficulty: form.difficulty, points: form.points }))
        onSavedAndNext?.()
      } else {
        onSaved()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan soal.')
    } finally {
      setSaving(false)
    }
  }

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      const kind: 'image' | 'audio' | 'video' =
        ['mp3', 'wav', 'ogg', 'm4a'].includes(ext) ? 'audio' : ['mp4', 'webm'].includes(ext) ? 'video' : 'image'
      const result = await uploadMedia(file, `question-${kind}`)
      setForm((f) => ({ ...f, media_url: result.url, media_type: kind }))
      toast.success('Media terunggah.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengunggah media.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Ubah Soal — #${questionNumber ?? 1}` : `Buat Soal Baru — #${questionNumber ?? 1}`} size="xl">
      <div className="space-y-5 px-4 py-5 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label="Tipe Soal *"
            value={form.type}
            onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as QuestionType }))}
            options={Object.entries(QUESTION_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
          />
          <Select
            label="Bank Soal *"
            placeholder="Pilih bank"
            value={form.bank_id}
            onChange={(e) => setForm((p) => ({ ...p, bank_id: e.target.value }))}
            options={(banksQuery.data?.rows ?? []).map((b) => ({ value: b.id, label: b.title }))}
          />
          <Select
            label="Tingkat Kesulitan"
            value={form.difficulty}
            onChange={(e) => setForm((p) => ({ ...p, difficulty: e.target.value as Difficulty }))}
            options={Object.entries(DIFFICULTY_LABELS).map(([v, l]) => ({ value: v, label: l }))}
          />
        </div>

        <div>
          <label className="label-base">Pertanyaan *</label>
          <RichTextEditor value={form.text} onChange={(html) => setForm((p) => ({ ...p, text: html }))} placeholder="Tulis pertanyaan di sini... Anda bisa memakai teks tebal, daftar, dan tautan." minHeight={110} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Bobot / Poin *" type="number" min={0.5} step={0.5} value={form.points} onChange={(e) => setForm((p) => ({ ...p, points: Number(e.target.value) }))} required />

          <div className="sm:col-span-2">
            <label className="label-base">Media Pendukung (opsional)</label>
            {form.media_url ? (
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <ImageIcon className="h-4 w-4 shrink-0 text-primary-500" />
                <p className="min-w-0 flex-1 truncate text-xs text-slate-500">{form.media_url.split('/').pop()}</p>
                <button onClick={() => setForm((p) => ({ ...p, media_url: null, media_type: null }))} aria-label="Hapus media" className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs font-medium text-slate-500 transition-colors hover:border-primary-400 hover:text-primary-600">
                {uploading ? <UploadCloud className="h-4 w-4 animate-pulse" /> : <UploadCloud className="h-4 w-4" />}
                {uploading ? 'Mengunggah...' : 'Unggah gambar / audio / video'}
                <input
                  type="file"
                  accept="image/*,audio/*,video/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void handleUpload(f)
                    e.target.value = ''
                  }}
                />
              </label>
            )}
          </div>
        </div>

        {needsOptions && (
          <fieldset className="rounded-xl border border-slate-200 p-4">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Pilihan Jawaban</legend>
            <div className="space-y-2.5">
              {form.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <input
                    type={form.type === 'multiple_response' ? 'checkbox' : 'radio'}
                    name={`correct-option-${i}`}
                    checked={opt.is_correct}
                    aria-label={`Jawaban benar opsi ${String.fromCharCode(65 + i)}`}
                    onChange={() => {
                      setForm((p) => ({
                        ...p,
                        options:
                          p.type === 'multiple_choice'
                            ? p.options.map((o, j) => ({ ...o, is_correct: j === i }))
                            : p.options.map((o, j) => (j === i ? { ...o, is_correct: !o.is_correct } : o)),
                      }))
                    }}
                    className="h-4 w-4 shrink-0 accent-primary-600"
                  />
                  <Input
                    placeholder={`Opsi ${String.fromCharCode(65 + i)}`}
                    value={opt.option_text}
                    onChange={(e) => {
                      setForm((p) => {
                        const next = [...p.options]
                        next[i] = { ...next[i], option_text: e.target.value }
                        return { ...p, options: next }
                      })
                    }}
                  />
                  {(form.options.length > 2 || i >= 2) && (
                    <button
                      onClick={() => setForm((p) => ({ ...p, options: p.options.filter((_, j) => j !== i) }))}
                      aria-label="Hapus opsi"
                      className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setForm((p) => ({ ...p, options: [...p.options, { option_text: '', is_correct: false }] }))}
              className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700"
            >
              <Plus className="h-3.5 w-3.5" /> Tambah Opsi
            </button>
            {form.type === 'multiple_choice' && (
              <p className="mt-2 text-xs text-slate-400">Pilih radio pada opsi yang merupakan jawaban benar. Tepat satu opsi harus dipilih.</p>
            )}
            {form.type === 'multiple_response' && (
              <p className="mt-2 text-xs text-slate-400">Centang semua opsi yang merupakan jawaban benar. Minimal satu opsi harus dicentang.</p>
            )}
          </fieldset>
        )}

        {form.type === 'multiple_response' && (
          <ToggleSwitch
            checked={form.partial_mr}
            onChange={(v) => setForm((p) => ({ ...p, partial_mr: v }))}
            label="Nilai parsial"
            description="Jika aktif, skor dihitung proporsional (jawaban salah mengurangi nilai). Jika nonaktif: semua harus tepat."
          />
        )}

        {form.type === 'true_false' && (
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Kunci Jawaban</p>
            <div className="flex gap-3">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  onClick={() => setForm((p) => ({ ...p, tf_answer: v }))}
                  className={`rounded-lg border px-5 py-2.5 text-sm font-semibold transition-colors ${
                    form.tf_answer === v
                      ? 'border-primary-500 bg-primary-50 text-primary-700 ring-2 ring-primary-500/20'
                       : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-500'
                  }`}
                >
                  {v ? 'Benar' : 'Salah'}
                </button>
              ))}
            </div>
          </div>
        )}

        {form.type === 'matching' && (
          <fieldset className="rounded-xl border border-slate-200 p-4">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Pasangan (Kiri → Kanan)</legend>
            <div className="space-y-2.5">
              {form.pairs.map((pair, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span className="w-5 text-center text-xs font-bold text-slate-400">{i + 1}</span>
                  <Input
                    placeholder={`Item kiri #${i + 1}`}
                    value={pair.left_text}
                    onChange={(e) => {
                      setForm((p) => {
                        const next = [...p.pairs]
                        next[i] = { ...next[i], left_text: e.target.value }
                        return { ...p, pairs: next }
                      })
                    }}
                  />
                  <Input
                    placeholder={`Pasangan kanan #${i + 1}`}
                    value={pair.right_text}
                    onChange={(e) => {
                      setForm((p) => {
                        const next = [...p.pairs]
                        next[i] = { ...next[i], right_text: e.target.value }
                        return { ...p, pairs: next }
                      })
                    }}
                  />
                  <button
                    onClick={() => setForm((p) => ({ ...p, pairs: p.pairs.filter((_, j) => j !== i) }))}
                    aria-label="Hapus pasangan"
                    className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => setForm((p) => ({ ...p, pairs: [...p.pairs, { left_text: '', right_text: '' }] }))}
              className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700"
            >
              <Plus className="h-3.5 w-3.5" /> Tambah Pasangan
            </button>
          </fieldset>
        )}

        {form.type === 'short_answer' && (
          <fieldset className="rounded-xl border border-slate-200 p-4 space-y-4">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Kunci & Aturan Penilaian</legend>
            <Select
              label="Mode Pencocokan"
              value={form.sa_mode}
              onChange={(e) => setForm((p) => ({ ...p, sa_mode: e.target.value }))}
              options={[
                { value: 'exact', label: 'Persis sama (abaikan kapital/spasi)' },
                { value: 'contains', label: 'Mengandung kata kunci' },
                { value: 'numeric', label: 'Angka (numerik)' },
              ]}
            />
            <Input
              label="Jawaban Diterima *"
              placeholder={form.sa_mode === 'numeric' ? 'cth: 42' : 'pisahkan beberapa jawaban dengan titik-koma ( ; )'}
              value={form.sa_accepted}
              onChange={(e) => setForm((p) => ({ ...p, sa_accepted: e.target.value }))}
              hint={form.sa_mode === 'numeric' ? 'Satu angka target. Toleransi default 0.' : 'cth: Jakarta; DKI Jakarta'}
            />
          </fieldset>
        )}

        {form.type === 'essay' && (
          <fieldset className="rounded-xl border border-slate-200 p-4 space-y-4">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Konfigurasi Essay</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Minimal Kata" type="number" min={0} value={form.min_words} onChange={(e) => setForm((p) => ({ ...p, min_words: Number(e.target.value) }))} />
              <Input label="Maksimal Kata" type="number" min={0} value={form.max_words} onChange={(e) => setForm((p) => ({ ...p, max_words: Number(e.target.value) }))} hint="0 = tanpa batas" />
            </div>
            <Textarea label="Rubrik Penilaian (untuk AI & referensi guru)" placeholder="cth: dinilai dari kelengkapan argumen, ketepatan konsep, dan keruntutan." value={form.rubric} onChange={(e) => setForm((p) => ({ ...p, rubric: e.target.value }))} />
          </fieldset>
        )}

        <Textarea
          label="Pembahasan / Pembahasan Singkat (opsional)"
          placeholder="Penjelasan yang ditampilkan kepada siswa setelah ujian selesai (jika diizinkan)."
          value={form.explanation}
          onChange={(e) => setForm((p) => ({ ...p, explanation: e.target.value }))}
        />
      </div>

      <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 sm:flex-row sm:justify-end sm:px-6 sm:py-4">
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button variant="outline" onClick={() => submit(true)} loading={saving}>Selanjutnya</Button>
          <Button onClick={() => submit()} loading={saving}>{editing ? 'Simpan Perubahan' : 'Tambahkan Soal'}</Button>
        </div>
      </div>
    </Modal>
  )
}
