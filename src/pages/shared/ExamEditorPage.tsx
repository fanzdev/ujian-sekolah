import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ArrowLeft, ChevronRight, FileText, Target, ListChecks, Settings2, Check, Plus, X, GripVertical } from 'lucide-react'
import { useAsync, useDocumentTitle } from '@/hooks/useAsync'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { ToggleSwitch, SearchInput } from '@/components/ui/FormControls'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { getExam, createExam, updateExam, getExamQuestions, setExamQuestions, setExamTargets, getExamTargets } from '@/services/exams.service'
import { listBanks, listQuestions } from '@/services/questions.service'
import { listClasses, listDepartments, listSubjects } from '@/services/academics.service'
import { fetchSystemSettings } from '@/services/settings.service'
import { QUESTION_TYPE_LABELS, DIFFICULTY_LABELS } from '@/lib/constants'
import { toInputValue, fromWibInput, formatDateTime } from '@/lib/datetime'
import { randomCode } from '@/lib/utils'
import { RichContent } from '@/components/ui/RichTextEditor'
import type { ExamTarget } from '@/types/models'

const STEPS = [
  { id: 'info', label: 'Informasi', icon: FileText },
  { id: 'target', label: 'Peserta', icon: Target },
  { id: 'questions', label: 'Soal', icon: ListChecks },
  { id: 'settings', label: 'Aturan', icon: Settings2 },
  { id: 'review', label: 'Selesai', icon: Check },
]

export default function ExamEditorPage() {
  const params = useParams()
  const examId = params.examId
  const navigate = useNavigate()
  const location = useLocation()
  const role = location.pathname.split('/')[1] ?? 'admin'
  const toast = useToast()
  const isEdit = Boolean(examId)

  useDocumentTitle(isEdit ? 'Ubah Ujian' : 'Buat Ujian')

  const [step, setStep] = useState(0)
  const [currentExamId, setCurrentExamId] = useState<string | null>(examId ?? null)

  const defaults = useAsync(() => fetchSystemSettings().then((s) => s.exam_defaults), [])
  const metaQuery = useAsync(
    () =>
      Promise.all([
        listSubjects(),
        listClasses(),
        listDepartments(),
        import('@/services/academics.service').then((m) => m.listTeachers({ pageSize: 200 })),
      ]),
    [],
  )
  const targetsQuery = useAsync(
    () => (examId ? getExamTargets(examId) : Promise.resolve([] as ExamTarget[])),
    [examId],
  )

  if (defaults.error) return <ErrorState message={defaults.error} />
  if (metaQuery.error) return <ErrorState message={String(metaQuery.error)} onRetry={metaQuery.reload} />

  const d = defaults.data ?? {
    duration_minutes: 60,
    max_attempts: 1,
    violation_limit: 3,
    auto_submit_on_limit: true,
    shuffle_questions: true,
    shuffle_options: true,
    fullscreen_required: false,
    camera_monitoring: false,
    show_result_to_student: true,
    show_answers_after: false,
    passing_grade: 0,
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/${role}/exams`)}
            aria-label="Kembali"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {isEdit ? 'Ubah Ujian' : 'Buat Ujian Baru'}
            </h1>
            <p className="mt-0.5 text-sm text-slate-400">Satu ujian untuk satu mata pelajaran</p>
          </div>
        </div>
      </div>

      <StepIndicator step={step} onStep={setStep} />

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {step === 0 && (
            <InfoStep
              defaults={d}
              subjects={metaQuery.data?.[0] ?? []}
              teachers={(metaQuery.data?.[3]?.rows ?? []).map((t) => ({
                id: t.id,
                name: t.profiles?.full_name ?? t.id,
              }))}
              onNext={() => setStep(1)}
              examId={currentExamId}
              onEnsureCreated={async (form) => {
                const id = await ensureExamCreated({ form, currentExamId })
                setCurrentExamId(id)
                return id
              }}
            />
          )}
          {step === 1 && (
            <TargetStep
              examId={currentExamId}
              initialTargets={targetsQuery.data ?? []}
              classes={metaQuery.data?.[1] ?? []}
              departments={metaQuery.data?.[2] ?? []}
              onBack={() => setStep(0)}
              onNext={() => setStep(2)}
              onSaved={() => toast.success('Peserta ujian tersimpan.')}
            />
          )}
          {step === 2 && (
            <QuestionsStep
              examId={currentExamId}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
              onSaved={() => toast.success('Daftar soal tersimpan.')}
            />
          )}
          {step === 3 && (
            <SettingsStep
              formKey={currentExamId ?? 'new'}
              defaults={d}
              onBack={() => setStep(2)}
              onNext={() => setStep(4)}
              examId={currentExamId}
            />
          )}
          {step === 4 && (
            <ReviewStep
              examId={currentExamId}
              onBack={() => setStep(3)}
              onDone={() => {
                toast.success('Ujian disimpan.')
                navigate(`/${role}/exams`)
              }}
            />
          )}
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-800">Ringkasan Cepat</h3>
            <QuickSummary examId={currentExamId} />
          </Card>
          <Card className="p-5 bg-primary-50/50 border-primary-100">
            <h3 className="text-sm font-bold text-primary-800">Alur Membuat Ujian</h3>
            <ol className="mt-3 space-y-2 text-xs leading-relaxed text-primary-900/70">
              <li><strong>1.</strong> Isi informasi & jadwal — klik Lanjut (ujian otomatis dibuat sebagai Draf).</li>
              <li><strong>2.</strong> Pilih target kelas/jurusan; peserta terisi otomatis.</li>
              <li><strong>3.</strong> Pilih soal dari bank soal & atur bobot.</li>
              <li><strong>4.</strong> Atur randomisasi, PIN, anti-curang.</li>
              <li><strong>5.</strong> Review lalu aktifkan dari daftar ujian.</li>
            </ol>
          </Card>
        </aside>
      </div>
    </>
  )
}

async function ensureExamCreated({
  form,
  currentExamId,
}: {
  form: Record<string, unknown>
  currentExamId: string | null
}): Promise<string> {
  if (currentExamId) {
    await updateExam(currentExamId, form)
    return currentExamId
  }
  const created = await createExam(form)
  return created.id
}

function StepIndicator({ step, onStep }: { step: number; onStep: (n: number) => void }) {
  return (
    <nav aria-label="Langkah pembuatan ujian" className="overflow-x-auto scrollbar-thin">
      <ol className="flex min-w-max items-center gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-card dark:border-slate-700 dark:bg-slate-900">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          const done = i < step
          const active = i === step
          return (
            <li key={s.id} className="flex items-center">
              <button
                onClick={() => i <= step && onStep(i)}
                disabled={i > step}
                aria-current={active ? 'step' : undefined}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors sm:text-[13px] ${
                  active ? 'bg-primary-600 text-white shadow-sm' : done ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-300 cursor-not-allowed'
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                {s.label}
              </button>
              {i < STEPS.length - 1 && <ChevronRight className={`mx-0.5 h-3.5 w-3.5 ${done ? 'text-emerald-400' : 'text-slate-200'}`} />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

type MetaSubjects = Awaited<ReturnType<typeof listSubjects>>
type TeacherOption = { id: string; name: string }

function InfoStep({
  defaults,
  subjects,
  teachers,
  examId,
  onNext,
  onEnsureCreated,
}: {
  defaults: NonNullable<Awaited<ReturnType<typeof fetchSystemSettings>>['exam_defaults']>
  subjects: MetaSubjects
  teachers: TeacherOption[]
  examId: string | null
  onNext: () => void
  onEnsureCreated: (form: Record<string, unknown>) => Promise<string>
}) {
  const toast = useToast()
  const examQuery = useAsync(() => (examId ? getExam(examId) : Promise.resolve(null)), [examId])
  const exam = examQuery.data

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [duration, setDuration] = useState(defaults.duration_minutes)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!exam || title) return
    setTitle(exam.title)
    setDescription(exam.description ?? '')
    setInstructions(exam.instructions ?? '')
    setSubjectId(exam.subject_id ?? '')
    setTeacherId(exam.teacher_id ?? '')
    setStartsAt(toInputValue(exam.starts_at))
    setEndsAt(toInputValue(exam.ends_at))
    setDuration(exam.duration_minutes)
  }, [exam, title])

  const handleNext = async () => {
    if (title.trim().length < 4) { toast.error('Nama ujian minimal 4 karakter.'); return }
    if (!startsAt || !endsAt) { toast.error('Tanggal mulai dan selesai wajib diisi.'); return }
    const startIso = fromWibInput(startsAt)
    const endIso = fromWibInput(endsAt)
    if (!startIso || !endIso) { toast.error('Format tanggal tidak valid.'); return }
    if (endIso <= startIso) { toast.error('Tanggal selesai harus setelah tanggal mulai.'); return }
    if (!duration || duration < 1) { toast.error('Durasi pengerjaan minimal 1 menit.'); return }

    setSaving(true)
    try {
      await onEnsureCreated({
        title: title.trim(),
        description: description || null,
        instructions: instructions || null,
        subject_id: subjectId || null,
        teacher_id: teacherId || null,
        starts_at: startIso,
        ends_at: endIso,
        duration_minutes: duration,
        status: 'draft',
      })
      onNext()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan ujian.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <div className="space-y-5 p-6">
        <Input label="Nama Ujian *" placeholder="cth: PTS Ganjil Matematika XII" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        <Textarea label="Deskripsi" placeholder="Deskripsi singkat cakupan materi ujian" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Textarea label="Instruksi untuk Siswa" placeholder="Petunjuk pengerjaan yang dibaca siswa sebelum mulai..." value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Mata Pelajaran" placeholder="Pilih mapel" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} options={subjects.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))} />
          <Select label="Guru Pengampu" placeholder={teachers.length ? 'Pilih guru' : 'Tidak ada data guru'} value={teacherId} onChange={(e) => setTeacherId(e.target.value)} options={teachers.map((t) => ({ value: t.id, label: t.name }))} />
          <Input label="Mulai (WIB) *" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
          <Input label="Selesai (WIB) *" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required hint="Siswa masih boleh masuk selama periode aktif." />
          <Input label="Durasi Pengerjaan (menit) *" type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} required hint="Timer dihitung dari waktu server saat siswa memulai." />
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-sky-50 px-4 py-3 text-xs leading-relaxed text-sky-800">
          Zona waktu otomatis WIB (Asia/Jakarta). Deadline attempt = waktu mulai siswa + durasi, atau batas akhir jadwal — diambil yang lebih dulu.
        </div>
      </div>
      <div className="flex justify-end border-t border-slate-100 bg-slate-50/60 px-6 py-4">
        <Button onClick={handleNext} loading={saving}>
          Simpan & Lanjut ke Peserta
        </Button>
      </div>
    </Card>
  )
}

function TargetStep({
  examId,
  initialTargets,
  classes,
  departments,
  onBack,
  onNext,
  onSaved,
}: {
  examId: string | null
  initialTargets: ExamTarget[]
  classes: Awaited<ReturnType<typeof listClasses>>
  departments: Awaited<ReturnType<typeof listDepartments>>
  onBack: () => void
  onNext: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialTargets.map((t) => `${t.kind}:${t.target_id}`)),
  )
  const [saving, setSaving] = useState(false)
  const [searchClass, setSearchClass] = useState('')

  const filteredClasses = useMemo(
    () => classes.filter((c) => c.name.toLowerCase().includes(searchClass.toLowerCase())),
    [classes, searchClass],
  )

  const toggle = (kind: 'class' | 'department', id: string) => {
    const key = `${kind}:${id}`
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const save = async (): Promise<boolean> => {
    if (!examId) return false
    setSaving(true)
    try {
      const targets = Array.from(selected).map((key) => {
        const [kind, id] = key.split(':') as ['class' | 'department', string]
        return { kind, target_id: id }
      })
      await setExamTargets(examId, targets)
      onSaved()
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan peserta.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const estimatedCount = useMemo(() => {
    const classIds = new Set(Array.from(selected).filter((k) => k.startsWith('class:')).map((k) => k.split(':')[1]))
    const deptIds = new Set(Array.from(selected).filter((k) => k.startsWith('department:')).map((k) => k.split(':')[1]))
    return classes.filter((c) => classIds.has(c.id) || deptIds.has(c.department_id)).length
  }, [selected, classes])

  return (
    <Card>
      <div className="space-y-5 p-6">
        {!examId && (
          <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Selesaikan langkah Informasi terlebih dahulu.
          </p>
        )}
        {examId && (
          <>
            <fieldset>
              <legend className="label-base">Target Jurusan</legend>
              <div className="flex flex-wrap gap-2">
                {departments.map((dept) => (
                  <ChipToggle
                    key={dept.id}
                    active={selected.has(`department:${dept.id}`)}
                    label={`${dept.code} · ${dept.name}`}
                    onClick={() => toggle('department', dept.id)}
                  />
                ))}
              </div>
            </fieldset>

            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <legend className="label-base mb-0">Target Kelas</legend>
                <SearchInput placeholder="Cari kelas..." value={searchClass} onChange={(e) => setSearchClass(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {filteredClasses.map((c) => (
                  <ChipToggle
                    key={c.id}
                    active={selected.has(`class:${c.id}`)}
                    label={c.name}
                    sublabel={c.departments?.code}
                    onClick={() => toggle('class', c.id)}
                  />
                ))}
              </div>
              {filteredClasses.length === 0 && (
                <p className="mt-3 text-xs text-slate-400">Tidak ada kelas yang cocok.</p>
              )}
            </div>

            <p className="rounded-lg bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
              Estimasi <strong>{estimatedCount}</strong> kelas akan ditugaskan. Siswa individual dapat dikecualikan / ditambahkan pada halaman Peserta setelah ujian dibuat.
            </p>
          </>
        )}
      </div>
      <div className="flex justify-between border-t border-slate-100 bg-slate-50/60 px-6 py-4">
        <Button variant="ghost" onClick={onBack}>Kembali</Button>
        <Button
          loading={saving}
          disabled={!examId}
          onClick={async () => {
            if (await save()) onNext()
          }}
        >
          Simpan & Lanjut ke Soal
        </Button>
      </div>
    </Card>
  )
}

function ChipToggle({ active, label, sublabel, onClick }: { active: boolean; label: string; sublabel?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition-all active:scale-95 ${
        active
          ? 'border-primary-500 bg-primary-600 text-white shadow-sm'
          : 'border-slate-200 bg-white text-slate-600 hover:border-primary-300 hover:text-primary-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-primary-500 dark:hover:text-primary-400'
      }`}
    >
      {active ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3 opacity-40" />}
      {label}
      {sublabel && <span className={`text-[10px] ${active ? 'text-white/70' : 'text-slate-300'}`}>{sublabel}</span>}
    </button>
  )
}

function QuestionsStep({
  examId,
  onBack,
  onNext,
  onSaved,
}: {
  examId: string | null
  onBack: () => void
  onNext: () => void
  onSaved: () => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [items, setItems] = useState<{ question_id: string; position: number; points: number | null; question: { id: string; text: string; points: number; type: string; difficulty: string } }[]>([])
  const [loadingExisting, setLoadingExisting] = useState(Boolean(examId))
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (!examId) {
      setLoadingExisting(false)
      return
    }
    getExamQuestions(examId)
      .then((rows) => {
        setItems(
          rows.map((r) => ({
            question_id: r.question_id,
            position: r.position,
            points: r.points,
            question: {
              id: r.questions!.id,
              text: r.questions!.text,
              points: Number(r.questions!.points),
              type: r.questions!.type,
              difficulty: r.questions!.difficulty,
            },
          })),
        )
      })
      .catch(() => undefined)
      .finally(() => setLoadingExisting(false))
  }, [examId])

  const addQuestions = (picked: typeof items) => {
    setItems((prev) => {
      const existing = new Set(prev.map((i) => i.question_id))
      const additions = picked.filter((p) => !existing.has(p.question_id)).map((p, idx) => ({ ...p, position: prev.length + idx }))
      return [...prev, ...additions]
    })
  }

  const save = async (): Promise<boolean> => {
    if (!examId) return false
    setSaving(true)
    try {
      await setExamQuestions(
        examId,
        items.map((i, idx) => ({ question_id: i.question_id, position: idx, points: i.points })),
      )
      onSaved()
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan soal ujian.')
      return false
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <div className="space-y-4 p-6">
        {!examId && <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">Selesaikan langkah sebelumnya terlebih dahulu.</p>}
        {loadingExisting && (
          <div className="flex justify-center py-8"><Spinner /></div>
        )}

        {examId && !loadingExisting && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge tone="blue">{items.length} soal dipilih</Badge>
              <Button variant="outline" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setPickerOpen(true)}>
                Ambil dari Bank Soal
              </Button>
            </div>

            {items.length === 0 ? (
              <EmptyState icon={<ListChecks className="h-6 w-6" />} title="Belum ada soal" description="Ambil soal dari bank soal Anda." />
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {items.map((item, index) => (
                  <li key={item.question_id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary-700">{index + 1}</span>
                    <GripVertical className="hidden h-4 w-4 shrink-0 text-slate-200 sm:block" />
                    <div className="min-w-0 flex-1">
                      <RichContent html={item.question.text} className="line-clamp-1 [&_*]:text-[13px]" />
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge tone="gray">{QUESTION_TYPE_LABELS[item.question.type as keyof typeof QUESTION_TYPE_LABELS]}</Badge>
                        <Badge tone={item.question.difficulty === 'easy' ? 'green' : item.question.difficulty === 'hard' ? 'red' : 'amber'}>
                          {DIFFICULTY_LABELS[item.question.difficulty]}
                        </Badge>
                      </div>
                    </div>
                    <div className="w-20 shrink-0">
                      <Input
                        aria-label={`Poin soal ${index + 1}`}
                        type="number"
                        step={0.5}
                        min={0.5}
                        value={item.points ?? item.question.points}
                        onChange={(e) => {
                          const v = e.target.value === '' ? null : Number(e.target.value)
                          setItems((prev) => prev.map((it, i) => (i === index ? { ...it, points: v } : it)))
                        }}
                        className="!py-1.5 text-center text-xs"
                      />
                    </div>
                    <div className="flex shrink-0 flex-col gap-0.5">
                      <button
                        disabled={index === 0}
                        onClick={() => setItems((prev) => reorder(prev, index, -1))}
                        aria-label="Naikkan urutan"
                        className="rounded p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" /></svg>
                      </button>
                      <button
                        disabled={index === items.length - 1}
                        onClick={() => setItems((prev) => reorder(prev, index, +1))}
                        aria-label="Turunkan urutan"
                        className="rounded p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                      </button>
                    </div>
                    <button
                      onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                      aria-label="Hapus dari ujian"
                      className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <div className="flex justify-between border-t border-slate-100 bg-slate-50/60 px-6 py-4">
        <Button variant="ghost" onClick={onBack}>Kembali</Button>
        <Button loading={saving} disabled={!examId} onClick={async () => { if (await save()) onNext() }}>
          Simpan & Lanjut ke Aturan
        </Button>
      </div>

      {pickerOpen && examId && (
        <QuestionPicker
          onClose={() => setPickerOpen(false)}
          onPick={(picked) => {
            addQuestions(picked)
            setPickerOpen(false)
          }}
        />
      )}
    </Card>
  )
}

function reorder<T>(arr: T[], index: number, dir: -1 | 1): T[] {
  const next = [...arr]
  const target = index + dir
  if (target < 0 || target >= arr.length) return arr
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

function QuestionPicker({
  onClose,
  onPick,
}: {
  onClose: () => void
  onPick: (picked: { question_id: string; position: number; points: number | null; question: { id: string; text: string; points: number; type: string; difficulty: string } }[]) => void
}) {
  const [banksResult, setBanksResult] = useState<Awaited<ReturnType<typeof listBanks>>['rows']>([])
  const [bankFilter, setBankFilter] = useState('')
  const [search, setSearch] = useState('')
  const [questions, setQuestions] = useState<Awaited<ReturnType<typeof listQuestions>>['rows']>([])
  const [loadingQ, setLoadingQ] = useState(false)
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    listBanks({ pageSize: 100 }).then((r) => setBanksResult(r.rows)).catch(() => undefined)
  }, [])

  useEffect(() => {
    setLoadingQ(true)
    const t = window.setTimeout(() => {
      listQuestions({ search: search || undefined, bankId: bankFilter || undefined, pageSize: 50 })
        .then((r) => setQuestions(r.rows))
        .catch(() => undefined)
        .finally(() => setLoadingQ(false))
    }, 250)
    return () => window.clearTimeout(t)
  }, [search, bankFilter])

  return (
    <Modal open onClose={onClose} title="Ambil Soal dari Bank" size="xl">
      <div className="space-y-4 px-6 py-5">
        <div className="flex flex-wrap gap-3">
          <SearchInput placeholder="Cari teks soal..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select placeholder="Semua Bank" className="sm:w-56" value={bankFilter} onChange={(e) => setBankFilter(e.target.value)} options={banksResult.map((b) => ({ value: b.id, label: b.title }))} />
        </div>

        <div className="max-h-80 space-y-2 overflow-y-auto scrollbar-thin pr-1">
          {loadingQ ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : questions.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">Tidak ada soal ditemukan.</p>
          ) : (
            questions.map((q) => {
              const picked = pickedIds.has(q.id)
              return (
                <button
                  key={q.id}
                  onClick={() =>
                    setPickedIds((prev) => {
                      const next = new Set(prev)
                      if (next.has(q.id)) next.delete(q.id)
                      else next.add(q.id)
                      return next
                    })
                  }
                  className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                    picked ? 'border-primary-500 bg-primary-50/70 ring-1 ring-primary-500/30' : 'border-slate-200 bg-white hover:border-primary-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-primary-500'
                  }`}
                >
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${picked ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-300'}`}>
                    {picked && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <RichContent html={q.text} className="line-clamp-2 [&_*]:text-[13px]" />
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      <Badge tone="blue">{QUESTION_TYPE_LABELS[q.type]}</Badge>
                      <Badge tone="gray">{q.points} poin</Badge>
                    </span>
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-6 py-4">
        <Badge tone="blue">{pickedIds.size} dipilih</Badge>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button
            disabled={pickedIds.size === 0}
            onClick={() => {
              const picked = questions
                .filter((q) => pickedIds.has(q.id))
                .map((q) => ({
                  question_id: q.id,
                  position: 0,
                  points: null,
                  question: { id: q.id, text: q.text, points: Number(q.points), type: q.type, difficulty: q.difficulty },
                }))
              onPick(picked)
            }}
          >
            Tambahkan Terpilih
          </Button>
        </div>
      </div>
    </Modal>
  )
}

type SettingsFormDefaults = {
  shuffle_questions: boolean
  shuffle_options: boolean
  max_attempts: number
  violation_limit: number
  auto_submit_on_limit: boolean
  fullscreen_required: boolean
  camera_monitoring: boolean
  show_result_to_student: boolean
  show_answers_after: boolean
  passing_grade: number
}

function SettingsStep({
  formKey,
  defaults: _defaults,
  examId,
  onBack,
  onNext,
}: {
  formKey: string
  defaults: SettingsFormDefaults
  examId: string | null
  onBack: () => void
  onNext: () => void
}) {
  const toast = useToast()
  const [shuffleQuestions, setShuffleQuestions] = useState(true)
  const [shuffleOptions, setShuffleOptions] = useState(true)
  const [maxAttempts, setMaxAttempts] = useState(1)
  const [passingGrade, setPassingGrade] = useState(0)
  const [violationLimit, setViolationLimit] = useState(3)
  const [autoSubmit, setAutoSubmit] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [camera, setCamera] = useState(false)
  const [showResult, setShowResult] = useState(true)
  const [showAnswers, setShowAnswers] = useState(false)
  const [examCode, setExamCode] = useState(randomCode(6))
  const [pinCode, setPinCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState<string | null>(null)

  useEffect(() => {
    if (!examId || loaded === examId) {
      if (!examId) {
        setShuffleQuestions(_defaults.shuffle_questions)
        setShuffleOptions(_defaults.shuffle_options)
      }
      return
    }
    setLoaded(examId)
    getExam(examId).then((exam) => {
      if (!exam) return
      setShuffleQuestions(exam.shuffle_questions)
      setShuffleOptions(exam.shuffle_options)
      setMaxAttempts(exam.max_attempts)
      setPassingGrade(Number(exam.passing_grade))
      setViolationLimit(exam.violation_limit)
      setAutoSubmit(exam.auto_submit_on_limit)
      setFullscreen(exam.fullscreen_required)
      setCamera(exam.camera_monitoring)
      setShowResult(exam.show_result_to_student)
      setShowAnswers(exam.show_answers_after)
      setExamCode(exam.exam_code ?? randomCode(6))
      setPinCode(exam.pin_code ?? '')
    }).catch(() => undefined)
  }, [examId, loaded, _defaults])

  const save = async (): Promise<boolean> => {
    if (!examId) return false
    setSaving(true)
    try {
      await updateExam(examId, {
        shuffle_questions: shuffleQuestions,
        shuffle_options: shuffleOptions,
        max_attempts: maxAttempts,
        passing_grade: passingGrade,
        violation_limit: violationLimit,
        auto_submit_on_limit: autoSubmit,
        fullscreen_required: fullscreen,
        camera_monitoring: camera,
        show_result_to_student: showResult,
        show_answers_after: showAnswers,
        exam_code: examCode || null,
        pin_code: pinCode || null,
      })
      toast.success('Pengaturan ujian tersimpan.')
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.')
      return false
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card key={formKey}>
      <div className="space-y-6 p-6">
        <Section title="Randomisasi">
          <ToggleSwitch checked={shuffleQuestions} onChange={setShuffleQuestions} label="Acak urutan soal" description="Urutan unik per siswa, tetap konsisten saat refresh." />
          <ToggleSwitch checked={shuffleOptions} onChange={setShuffleOptions} label="Acak urutan pilihan jawaban" />
        </Section>

        <Section title="Kesempatan & Kelulusan">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Maksimal Percobaan" type="number" min={1} max={10} value={maxAttempts} onChange={(e) => setMaxAttempts(Number(e.target.value))} />
            <Input label="Passing Grade" type="number" min={0} step={0.5} value={passingGrade} onChange={(e) => setPassingGrade(Number(e.target.value))} hint="0 = tidak ada KKM" />
          </div>
        </Section>

        <Section title="Anti-Curang">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Batas Pelanggaran" type="number" min={1} max={20} value={violationLimit} onChange={(e) => setViolationLimit(Number(e.target.value))} hint="Pindah tab, keluar fokus, dsb." />
            <ToggleSwitch checked={autoSubmit} onChange={setAutoSubmit} label="Auto-submit saat limit tercapai" />
          </div>
          <ToggleSwitch checked={fullscreen} onChange={setFullscreen} label="Wajib mode layar penuh" description="Browser akan meminta fullscreen saat ujian dimulai." />
          <ToggleSwitch checked={camera} onChange={setCamera} label="Aktifkan monitoring kamera" description="Preview kamera opsional selama ujian (membutuhkan izin browser)." />
        </Section>

        <Section title="Hasil & Pembahasan">
          <ToggleSwitch checked={showResult} onChange={setShowResult} label="Siswa boleh melihat nilai" />
          <ToggleSwitch checked={showAnswers} onChange={setShowAnswers} label="Tampilkan pembahasan & kunci setelah submit" />
        </Section>

        <Section title="Kode & PIN Akses">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="relative">
              <Input label="Kode Ujian" value={examCode} onChange={(e) => setExamCode(e.target.value.toUpperCase())} hint="Opsional, untuk referensi cepat." />
              <button
                onClick={() => setExamCode(randomCode(6))}
                className="absolute top-[34px] right-2 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-500 hover:bg-slate-200"
              >
                Acak
              </button>
            </div>
            <Input label="PIN Ujian" value={pinCode} onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="kosongkan jika tanpa PIN" hint="Siswa wajib memasukkan PIN sebelum mulai." />
          </div>
        </Section>
      </div>
      <div className="flex justify-between border-t border-slate-100 bg-slate-50/60 px-6 py-4">
        <Button variant="ghost" onClick={onBack}>Kembali</Button>
        <Button loading={saving} disabled={!examId} onClick={async () => { if (await save()) onNext() }}>
          Simpan & Review
        </Button>
      </div>
    </Card>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</legend>
      {children}
    </fieldset>
  )
}

function ReviewStep({ examId, onBack, onDone }: { examId: string | null; onBack: () => void; onDone: () => void }) {
  const query = useAsync(async () => {
    if (!examId) return null
    const exam = await getExam(examId)
    const eqs = await getExamQuestions(examId)
    return { exam, totalPoints: eqs.reduce((sum, e) => sum + Number(e.points ?? e.questions?.points ?? 0), 0), count: eqs.length }
  }, [examId])

  if (!query.data?.exam) {
    return (
      <Card>
        <EmptyState title="Ujian belum dibuat" description="Selesaikan langkah informasi terlebih dahulu." />
        <div className="px-6 pb-6"><Button variant="ghost" onClick={onBack}>Kembali</Button></div>
      </Card>
    )
  }

  const exam = query.data.exam

  const rows: [string, React.ReactNode][] = [
    ['Nama Ujian', exam.title],
    ['Mata Pelajaran', exam.subjects?.name ?? '-'],
    ['Jadwal', `${formatDateTime(exam.starts_at)} → ${formatDateTime(exam.ends_at)}`],
    ['Durasi', `${exam.duration_minutes} menit`],
    ['Jumlah Soal', String(query.data.count)],
    ['Total Bobot', `${query.data.totalPoints} poin`],
    ['Passing Grade', exam.passing_grade > 0 ? String(exam.passing_grade) : 'Tidak ada'],
    ['Percobaan Maks', String(exam.max_attempts)],
    ['Randomisasi', [exam.shuffle_questions && 'soal', exam.shuffle_options && 'opsi'].filter(Boolean).join(', ') || 'nonaktif'],
    ['Anti-Curang', `limit ${exam.violation_limit}${exam.auto_submit_on_limit ? ' + auto-submit' : ''}${exam.fullscreen_required ? ' + fullscreen' : ''}${exam.camera_monitoring ? ' + kamera' : ''}`],
    ['Kode / PIN', [exam.exam_code, exam.pin_code ? `PIN: ${exam.pin_code}` : null].filter(Boolean).join(' · ') || '-'],
    ['Status', exam.status === 'published' ? 'AKTIF' : 'Draf'],
  ]

  return (
    <Card>
      <dl className="divide-y divide-slate-100">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 px-5 py-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
            <dd className="truncate text-right text-sm font-semibold text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:border-slate-700 dark:bg-slate-800/60">
        <Button variant="ghost" onClick={onBack}>Kembali</Button>
        <Button onClick={onDone} icon={<Check className="h-4 w-4" />}>Selesai</Button>
      </div>
    </Card>
  )
}

function QuickSummary({ examId }: { examId: string | null }) {
  const query = useAsync(async () => {
    if (!examId) return null
    const [eqs, targets] = await Promise.all([getExamQuestions(examId), getExamTargets(examId)])
    return { count: eqs.length, points: eqs.reduce((s, e) => s + Number(e.points ?? e.questions?.points ?? 0), 0), targets: targets.length }
  }, [examId])

  return (
    <ul className="mt-3 space-y-2.5 text-sm">
      <SummaryRow label="Soal" value={query.data ? String(query.data.count) : '...'} />
      <SummaryRow label="Total Poin" value={query.data ? String(query.data.points) : '...'} />
      <SummaryRow label="Target" value={query.data ? `${query.data.targets} grup` : '...'} />
      <SummaryRow label="Status" value={<Badge tone={query.data ? 'amber' : 'gray'}>Draf</Badge>} />
    </ul>
  )
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm font-bold text-slate-800">{value}</span>
    </li>
  )
}
