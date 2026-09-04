import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ArrowLeft, ChevronRight, FileText, Target, ListChecks, Settings2, Check, Plus, X, GripVertical, HelpCircle } from 'lucide-react'
import { useAsync, useDocumentTitle } from '@/hooks/useAsync'
import { useToast } from '@/hooks/useToast'
import { useConfirm } from '@/hooks/useConfirm'
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
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:bg-slate-800"
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
  subjects,
  teachers,
  examId,
  onNext,
  onEnsureCreated,
}: {
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
  }, [exam, title])

  const handleNext = async () => {
    if (title.trim().length < 4) { toast.error('Nama ujian minimal 4 karakter.'); return }
    if (!startsAt || !endsAt) { toast.error('Tanggal mulai dan selesai wajib diisi.'); return }
    const startIso = fromWibInput(startsAt)
    const endIso = fromWibInput(endsAt)
    if (!startIso || !endIso) { toast.error('Format tanggal tidak valid.'); return }
    if (endIso <= startIso) { toast.error('Tanggal selesai harus setelah tanggal mulai.'); return }

    const durationMinutes = Math.max(1, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000))

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
        duration_minutes: durationMinutes,
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
          <Input label="Selesai (WIB) *" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required hint="Durasi otomatis mengikuti selisih waktu mulai-selesai." />
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-sky-50 px-4 py-3 text-xs leading-relaxed text-sky-800">
          Zona waktu otomatis WIB (Asia/Jakarta). Durasi pengerjaan dihitung otomatis dari selisih waktu mulai dan selesai.
        </div>
      </div>
      <div className="flex justify-end border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:bg-slate-800 dark:text-slate-200">
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
      try {
        const { supabase } = await import('@/services/client')
        await supabase.rpc('sync_exam_participants', { p_exam_id: examId })
      } catch {
        /* trigger DB akan sync otomatis jika migrasi 00015/00017 terpasang */
      }
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

            <p className="rounded-lg bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500 dark:bg-slate-800 dark:text-slate-200">
              Estimasi <strong>{estimatedCount}</strong> kelas akan ditugaskan. Siswa individual dapat dikecualikan / ditambahkan pada halaman Peserta setelah ujian dibuat.
            </p>
          </>
        )}
      </div>
      <div className="flex justify-between border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:bg-slate-800 dark:text-slate-200">
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
  const [hasUnsaved, setHasUnsaved] = useState(false)
  const toast = useToast()
  const confirmDialog = useConfirm()

  const examInfo = useAsync(() => (examId ? getExam(examId) : Promise.resolve(null)), [examId])
  const banksForSubject = useAsync(async () => {
    const subjectId = examInfo.data?.subject_id
    const all = await listBanks({ pageSize: 100 })
    if (!subjectId) return all
    const filtered = all.rows.filter((b) => b.subject_id === subjectId)
    return { rows: filtered.length > 0 ? filtered : all.rows, total: filtered.length > 0 ? filtered.length : all.total }
  }, [examInfo.data?.subject_id])

  const availableCountQuery = useAsync(async () => {
    const subjectId = examInfo.data?.subject_id
    if (!subjectId) return 0
    const banks = await listBanks({ pageSize: 100 })
    const relevant = banks.rows.filter((b) => b.subject_id === subjectId)
    if (relevant.length === 0) return 0
    let total = 0
    for (const b of relevant) {
      const qs = await listQuestions({ bankId: b.id, pageSize: 1 })
      total += qs.total
    }
    return total
  }, [examInfo.data?.subject_id])

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
      const next = [...prev, ...additions]
      if (additions.length > 0) setHasUnsaved(true)
      return next
    })
  }

  const handleAutoFill = async () => {
    const subjectId = examInfo.data?.subject_id
    if (!subjectId) {
      toast.error('Atur mata pelajaran dulu di langkah Informasi.')
      return
    }
    try {
      const banks = await listBanks({ pageSize: 100 })
      const relevant = banks.rows.filter((b) => b.subject_id === subjectId)
      if (relevant.length === 0) {
        toast.error('Tidak ada bank soal untuk mapel ini. Buat bank dulu.')
        return
      }
      const allQs: typeof items = []
      for (const b of relevant) {
        const qs = await listQuestions({ bankId: b.id, pageSize: 100 })
        for (const q of qs.rows) {
          allQs.push({
            question_id: q.id,
            position: allQs.length,
            points: null,
            question: { id: q.id, text: q.text, points: Number(q.points), type: q.type, difficulty: q.difficulty },
          })
        }
      }
      if (allQs.length === 0) {
        toast.error('Bank untuk mapel ini masih kosong. Isi bank dulu.')
        return
      }
      addQuestions(allQs)
      toast.success(`${allQs.length} soal dari bank ${relevant.map((b) => b.title).join(', ')} ditambahkan. Klik Simpan.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal auto-isi')
    }
  }

  const save = async (): Promise<boolean> => {
    if (!examId) return false
    setSaving(true)
    try {
      await setExamQuestions(
        examId,
        items.map((i, idx) => ({ question_id: i.question_id, position: idx, points: i.points })),
      )
      setHasUnsaved(false)
      onSaved()
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan soal ujian.')
      return false
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!hasUnsaved) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasUnsaved])

  const handleBack = async () => {
    if (hasUnsaved) {
      const ok = await confirmDialog.confirm({
        title: 'Buang perubahan?',
        message: 'Ada perubahan soal belum disimpan. Yakin kembali tanpa menyimpan? Perubahan akan hilang.',
        confirmText: 'Buang & Kembali',
        cancelText: 'Tetap di sini',
        danger: true,
      })
      if (!ok) return
    }
    onBack()
  }
  const handleNext = async () => {
    if (hasUnsaved) {
      const ok = await confirmDialog.confirm({
        title: 'Simpan perubahan?',
        message: 'Ada perubahan soal belum disimpan. Simpan dulu sebelum lanjut ke langkah berikutnya?',
        confirmText: 'Simpan & Lanjut',
        cancelText: 'Lanjut tanpa simpan',
      })
      if (ok) {
        const saved = await save()
        if (!saved) return
      }
    }
    onNext()
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
            {items.length === 0 && (availableCountQuery.data ?? 0) > 0 && (
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 dark:border-sky-800/50 dark:bg-sky-500/10">
                <p className="text-sm font-semibold text-sky-800 dark:text-sky-200">Bank untuk mapel ini punya {availableCountQuery.data} soal, tapi ujian ini masih 0 soal.</p>
                <p className="mt-1 text-xs text-sky-700 dark:text-sky-300">Klik tombol di bawah untuk isi otomatis semua soal dari bank mapel ini, atau pilih manual.</p>
                <Button size="sm" className="mt-3" icon={<Plus className="h-4 w-4" />} onClick={handleAutoFill}>Isi Otomatis {availableCountQuery.data} Soal dari Bank Mapel</Button>
              </div>
            )}
            {items.length === 0 && (availableCountQuery.data ?? 0) === 0 && examInfo.data?.subject_id && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/50 dark:bg-amber-500/10">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Bank untuk mapel ini belum ada soal.</p>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Buka menu <strong>Bank Soal</strong> → buat soal atau import Excel (1 baris = 1 soal). Mapel bank harus sama dengan mapel ujian ({examInfo.data?.subject_id ? banksForSubject.data?.rows[0]?.subjects?.name ?? '—' : '—'}).</p>
              </div>
            )}
            {hasUnsaved && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-800/50 dark:bg-amber-500/10 dark:text-amber-200">
                Ada perubahan belum disimpan — klik <strong>Simpan & Lanjut ke Aturan</strong> untuk menyimpan soal ke ujian.
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Badge tone="blue">{items.length} soal dipilih</Badge>
                {hasUnsaved && <Badge tone="amber">Belum disimpan</Badge>}
              </div>
              <div className="flex gap-2">
                {(availableCountQuery.data ?? 0) > 0 && items.length === 0 && (
                  <Button variant="outline" size="sm" icon={<Plus className="h-4 w-4" />} onClick={handleAutoFill}>Isi Otomatis</Button>
                )}
                <Button variant="outline" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setPickerOpen(true)}>
                  Ambil dari Bank Soal
                </Button>
              </div>
            </div>

            {items.length === 0 ? (
              <EmptyState icon={<ListChecks className="h-6 w-6" />} title="Belum ada soal" description="Ambil soal dari bank soal Anda." />
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {items.map((item, index) => (
                  <li key={item.question_id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary-700 dark:bg-primary-600 dark:text-white">{index + 1}</span>
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
                          setHasUnsaved(true)
                        }}
                        className="!py-1.5 text-center text-xs"
                      />
                    </div>
                    <div className="flex shrink-0 flex-col gap-0.5">
                      <button
                        disabled={index === 0}
                        onClick={() => { setItems((prev) => reorder(prev, index, -1)); setHasUnsaved(true) }}
                        aria-label="Naikkan urutan"
                        className="rounded p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30 dark:hover:bg-slate-700 dark:bg-slate-700 dark:text-slate-200"
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" /></svg>
                      </button>
                      <button
                        disabled={index === items.length - 1}
                        onClick={() => { setItems((prev) => reorder(prev, index, +1)); setHasUnsaved(true) }}
                        aria-label="Turunkan urutan"
                        className="rounded p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30 dark:hover:bg-slate-700 dark:bg-slate-700 dark:text-slate-200"
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                      </button>
                    </div>
                    <button
                      onClick={() => { setItems((prev) => prev.filter((_, i) => i !== index)); setHasUnsaved(true) }}
                      aria-label="Hapus dari ujian"
                      className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
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
      <div className="flex justify-between border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:bg-slate-800 dark:text-slate-200">
        <Button variant="ghost" onClick={handleBack}>Kembali</Button>
        <Button loading={saving} disabled={!examId} onClick={handleNext}>
          {hasUnsaved ? 'Simpan & Lanjut ke Aturan' : 'Lanjut ke Aturan'}
        </Button>
      </div>

      {pickerOpen && examId && (
        <BankPicker
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

function BankPicker({
  onClose,
  onPick,
}: {
  onClose: () => void
  onPick: (picked: { question_id: string; position: number; points: number | null; question: { id: string; text: string; points: number; type: string; difficulty: string } }[]) => void
}) {
  const [banks, setBanks] = useState<Awaited<ReturnType<typeof listBanks>>['rows']>([])
  const [search, setSearch] = useState('')
  const [pickedBankIds, setPickedBankIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [bankCounts, setBankCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    listBanks({ pageSize: 100 })
      .then((r) => {
        setBanks(r.rows)
        return Promise.all(
          r.rows.map((b) =>
            listQuestions({ bankId: b.id, pageSize: 1 })
              .then((q) => [b.id, q.total] as [string, number])
              .catch(() => [b.id, 0] as [string, number])
          ),
        )
      })
      .then((counts) => {
        const map: Record<string, number> = {}
        for (const [id, count] of counts) map[id] = count
        setBankCounts(map)
      })
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [])

  const filtered = banks.filter((b) => {
    if (search && !b.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const toggleBank = (id: string) => {
    setPickedBankIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totalSelected = Array.from(pickedBankIds).reduce((sum, id) => sum + (bankCounts[id] ?? 0), 0)

  const handleImport = async () => {
    if (pickedBankIds.size === 0) return
    setImporting(true)
    try {
      const allQs: { question_id: string; position: number; points: number | null; question: { id: string; text: string; points: number; type: string; difficulty: string } }[] = []
      for (const bankId of pickedBankIds) {
        const result = await listQuestions({ bankId, pageSize: 500 })
        for (const q of result.rows) {
          allQs.push({
            question_id: q.id,
            position: allQs.length,
            points: null,
            question: { id: q.id, text: q.text, points: Number(q.points), type: q.type, difficulty: q.difficulty },
          })
        }
      }
      onPick(allQs)
    } catch {
      void 0
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Ambil Folder Soal" size="md">
      <div className="space-y-4 px-6 py-5">
        <SearchInput placeholder="Cari nama folder..." value={search} onChange={(e) => setSearch(e.target.value)} />

        <div className="max-h-80 space-y-2 overflow-y-auto scrollbar-thin pr-1">
          {loading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">Tidak ada folder soal ditemukan.</p>
          ) : (
            filtered.map((bank) => {
              const picked = pickedBankIds.has(bank.id)
              const count = bankCounts[bank.id] ?? 0
              return (
                <button
                  key={bank.id}
                  onClick={() => toggleBank(bank.id)}
                  className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-all ${
                    picked ? 'border-primary-500 bg-primary-50/70 ring-1 ring-primary-500/30 dark:bg-primary-500/10' : 'border-slate-200 bg-white hover:border-primary-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-primary-500'
                  }`}
                >
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${picked ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                    {picked && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{bank.title}</span>
                    {bank.description && <span className="mt-0.5 block text-xs text-slate-400 line-clamp-1">{bank.description}</span>}
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-400">
                      <HelpCircle className="h-3 w-3" /> {count} soal
                    </span>
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/60">
        <span className="text-xs text-slate-500">{pickedBankIds.size} folder · {totalSelected} soal</span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button disabled={pickedBankIds.size === 0} loading={importing} onClick={handleImport}>
            Ambil Semua Soal dari Folder
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
                className="absolute top-[34px] right-2 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
              >
                Acak
              </button>
            </div>
            <Input label="PIN Ujian" value={pinCode} onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="kosongkan jika tanpa PIN" hint="Siswa wajib memasukkan PIN sebelum mulai." />
          </div>
        </Section>
      </div>
      <div className="flex justify-between border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:bg-slate-800 dark:text-slate-200">
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
    const targets = await getExamTargets(examId)
    const { count: pCount } = await (await import('@/services/client')).supabase.from('exam_participants').select('student_id', { count: 'exact', head: true }).eq('exam_id', examId).eq('is_removed', false)
    return { exam, totalPoints: eqs.reduce((sum, e) => sum + Number(e.points ?? e.questions?.points ?? 0), 0), count: eqs.length, targets: targets.length, participants: pCount ?? 0 }
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
  const isReady = query.data.count > 0 && (query.data.targets > 0 || query.data.participants > 0)

  const rows: [string, React.ReactNode][] = [
    ['Nama Ujian', exam.title],
    ['Mata Pelajaran', exam.subjects?.name ?? '-'],
    ['Jadwal', `${formatDateTime(exam.starts_at)} → ${formatDateTime(exam.ends_at)}`],
    ['Durasi', `${exam.duration_minutes} menit`],
    ['Jumlah Soal', String(query.data.count)],
    ['Total Bobot', `${query.data.totalPoints} poin`],
    ['Target Grup', `${query.data.targets} grup / ${query.data.participants} peserta`],
    ['Passing Grade', exam.passing_grade > 0 ? String(exam.passing_grade) : 'Tidak ada'],
    ['Percobaan Maks', String(exam.max_attempts)],
    ['Randomisasi', [exam.shuffle_questions && 'soal', exam.shuffle_options && 'opsi'].filter(Boolean).join(', ') || 'nonaktif'],
    ['Anti-Curang', `limit ${exam.violation_limit}${exam.auto_submit_on_limit ? ' + auto-submit' : ''}${exam.fullscreen_required ? ' + fullscreen' : ''}${exam.camera_monitoring ? ' + kamera' : ''}`],
    ['Kode / PIN', [exam.exam_code, exam.pin_code ? `PIN: ${exam.pin_code}` : null].filter(Boolean).join(' · ') || '-'],
    ['Status', exam.status === 'published' ? 'AKTIF' : 'Draf'],
  ]

  return (
    <Card>
      {!isReady && (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs leading-relaxed text-amber-800">
          <strong>Ujian belum siap diaktifkan:</strong> {query.data.count === 0 ? 'Belum ada soal. ' : ''}{query.data.targets === 0 && query.data.participants === 0 ? 'Belum ada target kelas/jurusan atau peserta. ' : ''} Lengkapi langkah Peserta & Soal sebelum mengaktifkan.
        </div>
      )}
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
    const { count: pCount } = await (await import('@/services/client')).supabase.from('exam_participants').select('student_id', { count: 'exact', head: true }).eq('exam_id', examId).eq('is_removed', false)
    return { count: eqs.length, points: eqs.reduce((s, e) => s + Number(e.points ?? e.questions?.points ?? 0), 0), targets: targets.length, participants: pCount ?? 0 }
  }, [examId])

  const isReady = (query.data?.count ?? 0) > 0 && ((query.data?.targets ?? 0) > 0 || (query.data?.participants ?? 0) > 0)

  return (
    <>
      <ul className="mt-3 space-y-2.5 text-sm">
        <SummaryRow label="Soal" value={query.data ? String(query.data.count) : '...'} />
        <SummaryRow label="Total Poin" value={query.data ? String(query.data.points) : '...'} />
        <SummaryRow label="Target" value={query.data ? `${query.data.targets} grup / ${query.data.participants} peserta` : '...'} />
        <SummaryRow label="Status" value={<Badge tone={isReady ? 'green' : 'amber'}>{isReady ? 'Siap Aktif' : 'Belum Siap'}</Badge>} />
      </ul>
      {query.data && !isReady && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
          {query.data.count === 0 ? 'Belum ada soal. ' : ''}{query.data.targets === 0 && query.data.participants === 0 ? 'Belum ada peserta/target. ' : ''} Lengkapi sebelum mengaktifkan.
        </p>
      )}
    </>
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
