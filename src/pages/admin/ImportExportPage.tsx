import { useMemo, useState } from 'react'
import { Upload, Download, FileSpreadsheet, Users, GraduationCap, Database, CheckCircle2, XCircle, Loader2, FileDown, Table2, AlertCircle, Info } from 'lucide-react'
import { useAsync, useDocumentTitle } from '@/hooks/useAsync'
import { useToast } from '@/hooks/useToast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Input'
import { Tabs } from '@/components/ui/Tabs'
import { ErrorState } from '@/components/ui/Feedback'
import {
  parseAnyFile,
  validateRows,
  downloadTemplateCsv,
  downloadTemplateExcel,
  downloadHeaderOnlyCsv,
  downloadHeaderOnlyExcel,
  studentRowSchema,
  teacherRowSchema,
  soalRowSchema,
  examRowSchema,
  gradeRowSchema,
  importKindMeta,
  normalizeHeader,
  type ImportRowResult,
} from '@/services/import.service'
import { listClasses } from '@/services/academics.service'
import { createFullUser, pingManageUser } from '@/services/users.service'
import { exportCsv, exportExcel, type ExportColumn } from '@/services/export.service'
import { listStudents, listTeachers } from '@/services/academics.service'
import { supabase } from '@/services/client'

type ImportKind = 'students' | 'teachers' | 'question_banks' | 'exams' | 'grades'

const KIND_LABELS: Record<ImportKind, string> = {
  students: 'Data Siswa (+akun)',
  teachers: 'Data Guru (+akun)',
  question_banks: 'Soal (Import ke Bank Soal)',
  exams: 'Ujian',
  grades: 'Hasil / Nilai',
}

const KIND_ICONS: Record<ImportKind, React.ReactNode> = {
  students: <GraduationCap className="h-4 w-4" />,
  teachers: <Users className="h-4 w-4" />,
  question_banks: <FileSpreadsheet className="h-4 w-4" />,
  exams: <Table2 className="h-4 w-4" />,
  grades: <FileSpreadsheet className="h-4 w-4" />,
}

export default function ImportExportPage() {
  const [tab, setTab] = useState('import')
  useDocumentTitle('Import / Export')

  return (
    <>
      <PageHeader title="Import & Export Data" subtitle="Kelola data massal dengan aman melalui validasi berlapis" icon={<Database className="h-5 w-5" />} />
      <Tabs active={tab} onChange={setTab} tabs={[{ id: 'import', label: 'Import' }, { id: 'export', label: 'Export' }]} />
      <div className="mt-6">{tab === 'import' ? <ImportPanel /> : <ExportPanel />}</div>
    </>
  )
}

function ImportPanel() {
  const toast = useToast()
  const [kind, setKind] = useState<ImportKind>('students')
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [fileName, setFileName] = useState('')
  const [validated, setValidated] = useState<ImportRowResult<Record<string, unknown>>[] | null>(null)
  const [progress, setProgress] = useState<{ done: number; fail: number; running: boolean }>({ done: 0, fail: 0, running: false })
  const [resultDetails, setResultDetails] = useState<{ success: number; failed: number; errors: { row: number; msg: string }[] } | null>(null)

  const classesQuery = useAsync(() => listClasses(), [])
  const banksQuery = useAsync(() => import('@/services/questions.service').then((m) => m.listBanks({ pageSize: 100 })), [])
  const edgeCheck = useAsync(async () => {
    try {
      await pingManageUser()
      return true
    } catch {
      return false
    }
  }, [])

  const meta = importKindMeta[kind]

  const kindSchema = useMemo(() => {
    switch (kind) {
      case 'students': return studentRowSchema
      case 'teachers': return teacherRowSchema
      case 'question_banks': return soalRowSchema
      case 'exams': return examRowSchema
      case 'grades': return gradeRowSchema
      default: return studentRowSchema
    }
  }, [kind])

  const handleFile = async (file: File) => {
    setFileName(file.name)
    setResultDetails(null)
    setProgress({ done: 0, fail: 0, running: false })
    try {
      const parsed = await parseAnyFile(file)
      if (parsed.rows.length === 0) {
        toast.error('File tidak berisi data. Periksa format header dan isi.')
        setRows([])
        setValidated(null)
        return
      }
      if (parsed.errors.length > 0) {
        toast.warning(parsed.errors[0])
      }
      setRows(parsed.rows)
      const validatedRows = validateRows(parsed.rows, kindSchema as never) as ImportRowResult<Record<string, unknown>>[]
      if (kind === 'question_banks') {
        for (const v of validatedRows) {
          if (!v.valid) continue
          const bt = String((v.data as Record<string, unknown>)?.bank_title ?? '').trim()
          if (!bt) {
            v.valid = false
            v.errors = ['bank_title: wajib — isi judul Bank Soal tujuan']
          }
        }
      }
      setValidated(validatedRows)
      const validCount = validatedRows.filter((v) => v.valid).length
      const errCount = validatedRows.filter((v) => !v.valid).length
      if (errCount > 0) toast.warning(`${validCount} valid, ${errCount} baris bermasalah — perbaiki sebelum import.`)
      else toast.success(`${parsed.rows.length} baris siap diimport.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal membaca file.')
      setValidated(null)
      setRows([])
    }
  }

  const resetFile = () => {
    setRows([])
    setValidated(null)
    setFileName('')
    setResultDetails(null)
    setProgress({ done: 0, fail: 0, running: false })
  }

  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  const classByName = useMemo(() => new Map((classesQuery.data ?? []).map((c) => [norm(c.name), c.id])), [classesQuery.data])
  const bankByTitle = useMemo(() => new Map((banksQuery.data?.rows ?? []).map((b) => [norm(b.title), b.id])), [banksQuery.data])

  const runImport = async () => {
    if (!validated) return
    if (progress.running) return
    if (resultDetails && resultDetails.failed === 0 && resultDetails.success > 0) {
      toast.info('File ini sudah berhasil diimport. Pilih file baru untuk import lagi.')
      return
    }
    if (kind === 'students' && classesQuery.loading) {
      toast.error('Data kelas masih memuat. Tunggu sebentar lalu coba lagi.')
      return
    }
    if (kind === 'question_banks' && banksQuery.loading) {
      toast.error('Data bank soal masih memuat. Tunggu sebentar lalu coba lagi.')
      return
    }
    if (kind === 'students' && !classesQuery.data?.length) {
      toast.error('Belum ada kelas di sistem. Buat kelas terlebih dahulu sebelum import siswa.')
      return
    }
    const validRows = validated.filter((v) => v.valid)
    if (validRows.length === 0) {
      toast.error('Tidak ada baris valid untuk diimport.')
      return
    }
    setProgress({ done: 0, fail: 0, running: true })
    setResultDetails(null)
    let done = 0
    let fail = 0
    const errors: { row: number; msg: string }[] = []

    for (const row of validRows) {
      try {
        const data = row.data as Record<string, string>
        if (kind === 'students') {
          const cid = classByName.get(norm(String(data.class_name ?? '')))
          if (!cid) throw new Error(`Kelas "${data.class_name}" tidak ditemukan di sistem`)
          await createFullUser({
            username: String(data.username),
            password: String(data.password),
            fullName: String(data.full_name),
            role: 'student',
            student: {
              nis: data.nis || undefined,
              nisn: data.nisn || undefined,
              gender: data.gender === 'L' || data.gender === 'P' ? (data.gender as 'L' | 'P') : undefined,
              class_id: cid,
              phone: data.phone || undefined,
              email: data.email || undefined,
            },
          })
        } else if (kind === 'teachers') {
          await createFullUser({
            username: String(data.username),
            password: String(data.password),
            fullName: String(data.full_name),
            role: 'teacher',
            teacher: {
              nip: data.nip || undefined,
              phone: data.phone || undefined,
              email: data.email || undefined,
            },
          })
        } else if (kind === 'question_banks') {
          const bankTitleRaw = String(data.bank_title ?? '').trim()
          if (!bankTitleRaw) throw new Error('bank_title wajib — isi judul Bank Soal tujuan')
          const bankId = bankByTitle.get(norm(bankTitleRaw))
          if (!bankId) throw new Error(`Bank Soal "${bankTitleRaw}" tidak ditemukan. Buat dulu di menu Bank Soal`)
          const typeMap: Record<string, string> = {
            'pilihan ganda': 'multiple_choice', 'pilihan_ganda': 'multiple_choice', 'pg': 'multiple_choice',
            'pilihan ganda kompleks': 'multiple_response', 'pilihan_ganda_kompleks': 'multiple_response', 'pg kompleks': 'multiple_response',
            'benar/salah': 'true_false', 'benar_salah': 'true_false', 'b/s': 'true_false',
            'isian singkat': 'short_answer', 'isian_singkat': 'short_answer', 'jawaban singkat': 'short_answer',
            'esai': 'essay', 'essay': 'essay', 'uraian': 'essay',
            'menjodohkan': 'matching', 'jodohkan': 'matching',
          }
          const normType = (v: string) => {
            const k = v.trim().toLowerCase().replace(/\s+/g, ' ').replace(/_/g, ' ')
            return typeMap[k] ?? k.replace(/\s+/g, '_')
          }
          const rawTypeNorm = normType(String(data.type ?? ''))
          const allowedTypes = ['multiple_choice', 'multiple_response', 'true_false', 'short_answer', 'essay', 'matching']
          if (!allowedTypes.includes(rawTypeNorm)) throw new Error(`Jenis soal harus: Pilihan Ganda / Pilihan Ganda Kompleks / Benar/Salah / Isian Singkat / Esai / Menjodohkan (ditemukan: "${String(data.type ?? '').trim()}")`)
          const type = rawTypeNorm as 'multiple_choice' | 'multiple_response' | 'true_false' | 'short_answer' | 'essay' | 'matching'
          const text = String(data.question_text ?? '').trim()
          if (text.length < 5) throw new Error('Teks soal minimal 5 karakter')
          const diffMap: Record<string, string> = { 'mudah': 'easy', 'sedang': 'medium', 'sulit': 'hard' }
          const rawDiff = String(data.difficulty ?? 'medium').trim().toLowerCase()
          const diffNorm = diffMap[rawDiff] ?? rawDiff
          const difficulty = (diffNorm || 'medium') as 'easy' | 'medium' | 'hard'
          const points = 1
          const explanation = String(data.explanation ?? '').trim() || null
          const correctRaw = String(data.correct_answer ?? '').trim()
          const optionFields = ['option_a', 'option_b', 'option_c', 'option_d', 'option_e'] as const
          const optionsRaw = optionFields.map((k) => String(data[k] ?? '').trim()).filter(Boolean)

          const scoringRule: Record<string, unknown> = {}
          let options: { option_text: string; is_correct: boolean }[] | undefined
          let pairs: { left_text: string; right_text: string }[] | undefined

          if (type === 'multiple_choice' || type === 'multiple_response') {
            if (optionsRaw.length < 2) throw new Error('Butuh minimal 2 opsi (option_a, option_b, ...)')
            const letters = ['A', 'B', 'C', 'D', 'E']
            const correctLetters = correctRaw.toUpperCase().split(',').map((s) => s.trim()).filter(Boolean)
            if (correctLetters.length === 0) throw new Error('correct_answer wajib (contoh: A atau A,C)')
            if (type === 'multiple_choice' && correctLetters.length !== 1) throw new Error('multiple_choice harus tepat satu jawaban benar (contoh: B)')
            options = optionFields
              .map((k, idx) => {
                const txt = String(data[k] ?? '').trim()
                if (!txt) return null
                const letter = letters[idx]
                const isCorrect = correctLetters.includes(letter)
                return { option_text: txt, is_correct: isCorrect }
              })
              .filter(Boolean) as { option_text: string; is_correct: boolean }[]
            const correctCount = options.filter((o) => o.is_correct).length
            if (correctCount === 0) throw new Error(`correct_answer "${correctRaw}" tidak cocok dengan opsi yang ada`)
            if (type === 'multiple_response') scoringRule.partial = false
          } else if (type === 'true_false') {
            const normAns = correctRaw.toLowerCase()
            let tf: boolean | null = null
            if (['benar', 'true', 'b', '1', 'ya'].includes(normAns)) tf = true
            else if (['salah', 'false', 's', '0', 'tidak'].includes(normAns)) tf = false
            if (tf === null) throw new Error('correct_answer untuk true_false harus Benar/Salah')
            scoringRule.tf_answer = tf
          } else if (type === 'short_answer') {
            if (!correctRaw) throw new Error('correct_answer wajib untuk short_answer (pisahkan dengan ; )')
            scoringRule.match_mode = 'exact'
            scoringRule.accepted = correctRaw.split(';').map((s) => s.trim()).filter(Boolean)
          } else if (type === 'essay') {
            scoringRule.rubric = explanation ?? ''
            scoringRule.min_words = 0
            scoringRule.max_words = 0
          } else if (type === 'matching') {
            throw new Error('Import matching belum didukung via Excel — buat manual di editor')
          }

          const mod = await import('@/services/questions.service')
          await mod.createQuestion({
            bank_id: bankId,
            type,
            text,
            difficulty: difficulty as never,
            points,
            explanation,
            scoring_rule: scoringRule,
            options,
            pairs,
          } as never)
        } else if (kind === 'exams') {
          const title = String(data.title).trim()
          const startsAtRaw = String(data.starts_at).trim()
          const endsAtRaw = String(data.ends_at).trim()
          const startsAt = new Date(startsAtRaw).toISOString()
          const endsAt = new Date(endsAtRaw).toISOString()
          if (Number.isNaN(Date.parse(startsAt)) || Number.isNaN(Date.parse(endsAt))) throw new Error('Format tanggal tidak valid. Gunakan YYYY-MM-DDTHH:mm')
          if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) throw new Error('ends_at harus setelah starts_at')
          const duration = Number(data.duration_minutes)
          const passing = Number(data.passing_grade ?? 0)
          const mod = await import('@/services/exams.service')
          await mod.createExam({
            title,
            subject_id: null,
            starts_at: startsAt,
            ends_at: endsAt,
            duration_minutes: duration,
            passing_grade: passing,
            description: String(data.description ?? '').trim() || null,
            status: 'draft',
          } as never)
        } else if (kind === 'grades') {
          const examTitle = String(data.exam_title).trim()
          const nis = String(data.nis).trim()
          const score = Number(data.score)
          if (!examTitle || !nis) throw new Error('exam_title dan nis wajib')
          if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error('Nilai harus 0-100')
          const { data: examRow, error: examErr } = await supabase.from('exams').select('id, title, passing_grade').ilike('title', examTitle).limit(1).maybeSingle()
          if (examErr) throw examErr
          if (!examRow) throw new Error(`Ujian "${examTitle}" tidak ditemukan`)
          const { data: stuRow, error: stuErr } = await supabase.from('students').select('id').eq('nis', nis).maybeSingle()
          if (stuErr) throw stuErr
          if (!stuRow) throw new Error(`Siswa NIS "${nis}" tidak ditemukan`)
          const { data: attemptRow, error: attErr } = await supabase
            .from('exam_attempts')
            .select('id')
            .eq('exam_id', (examRow as { id: string }).id)
            .eq('student_id', (stuRow as { id: string }).id)
            .order('attempt_number', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (attErr) throw attErr
          if (!attemptRow) throw new Error(`Belum ada attempt untuk ujian "${examTitle}" dan NIS "${nis}" — siswa harus sudah mengumpulkan ujian`)
          const attemptId = (attemptRow as { id: string }).id
          const passing = Number((examRow as { passing_grade?: number }).passing_grade ?? 0)
          const passed = passing > 0 ? score >= passing : null
          try {
            const { error: upErr } = await supabase
              .from('exam_results')
              .upsert(
                {
                  attempt_id: attemptId,
                  exam_id: (examRow as { id: string }).id,
                  student_id: (stuRow as { id: string }).id,
                  final_score: score,
                  passed,
                },
                { onConflict: 'attempt_id' },
              )
            if (upErr) throw upErr
            try {
              await supabase.rpc('recalc_result', { p_attempt_id: attemptId })
            } catch {
              // trigger already handles recalc; ignore
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            if (msg.toLowerCase().includes('row level security') || msg.toLowerCase().includes('permission') || msg.includes('42501')) {
              throw new Error('Gagal update nilai: RLS menolak. Pastikan migrasi 00034 sudah dijalankan (admin perlu akses update exam_results) atau gunakan menu Penilaian Essay.')
            }
            throw e
          }
        }
        done++
      } catch (e) {
        fail++
        const msg = e instanceof Error ? e.message : String(e)
        errors.push({ row: row.index + 1, msg })
      }
      setProgress({ done: done + fail, fail, running: true })
    }

    setProgress({ done: done + fail, fail, running: false })
    setResultDetails({ success: done, failed: fail, errors })
    if (fail === 0) toast.success(`${done} data ${KIND_LABELS[kind]} berhasil diimport.`)
    else if (done > 0) toast.warning(`${done} berhasil, ${fail} gagal. Lihat rincian di bawah.`)
    else toast.error(`Import gagal: ${errors[0]?.msg ?? 'Periksa data.'}`)
  }

  const handleDownloadCsv = () => {
    downloadTemplateCsv(`template-${kind}`, meta.headers, meta.examples)
  }
  const handleDownloadExcel = async () => {
    await downloadTemplateExcel(`template-${kind}`, meta.headers, meta.examples)
  }

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        {!edgeCheck.data && !edgeCheck.loading && (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs leading-relaxed text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
            Edge Function <strong>manage-user</strong> belum ter-deploy — import siswa/guru akan menggunakan mode fallback otomatis (RPC / signUp) sehingga tetap berjalan. Untuk performa massal terbaik, deploy sesuai <code className="rounded bg-sky-100 px-1 dark:bg-sky-500/20">docs/SUPABASE_SETUP.md</code>.
          </div>
        )}

        <Card>
          <CardHeader
            title="Langkah 1 · Pilih Jenis & Unduh Template"
            subtitle="Template berisi header yang wajib sama persis. Contoh tabel di bawah adalah isi file yang benar."
            action={
              <div className="flex gap-2">
                <Button size="sm" variant="outline" icon={<Download className="h-4 w-4" />} onClick={handleDownloadCsv}>
                  CSV
                </Button>
                <Button size="sm" icon={<FileDown className="h-4 w-4" />} onClick={handleDownloadExcel}>
                  Excel
                </Button>
              </div>
            }
          />
          <CardBody className="space-y-4">
            <Select
              label="Jenis Data"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as ImportKind)
                resetFile()
              }}
              options={(Object.keys(KIND_LABELS) as ImportKind[]).map((k) => ({ value: k, label: KIND_LABELS[k] }))}
            />

            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/30">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300">
                  {KIND_ICONS[kind]}
                </span>
                Template {KIND_LABELS[kind]}
                <Badge tone="blue" className="ml-auto">{meta.headers.length} kolom</Badge>
              </div>

              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white scrollbar-thin dark:border-slate-700 dark:bg-slate-900">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60">
                    <tr>
                      {meta.headers.map((h) => (
                        <th key={h} className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            {h}
                            {meta.required.includes(h) ? <span className="text-rose-500">*</span> : <span className="text-slate-300 dark:text-slate-600">○</span>}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {meta.examples.map((row, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/50 dark:bg-slate-800/30'}>
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-700 dark:text-slate-300">
                            {cell || <span className="text-slate-300 dark:text-slate-600">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                <Info className="h-3 w-3" /> <span className="text-rose-500">*</span> wajib. Baris contoh di atas bisa langsung disalin ke Excel/CSV Anda.
              </p>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {meta.headers.map((h) => (
                  <div key={h} className="flex gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${meta.required.includes(h) ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                      {meta.required.includes(h) ? 'WAJIB' : 'OPSIONAL'}
                    </span>
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">{h}</p>
                      <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">{meta.desc[h] ?? '-'}</p>
                    </div>
                  </div>
                ))}
              </div>

              {kind === 'students' && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                  Kolom <code className="rounded bg-amber-100 px-1 dark:bg-amber-500/20">class_name</code> harus sama persis dengan nama kelas di sistem. {(classesQuery.data ?? []).length === 0 && <span className="font-bold text-rose-600 dark:text-rose-400"> Belum ada kelas — buat kelas terlebih dahulu di menu Akademik.</span>}
                </p>
              )}
              {kind === 'exams' && (
                <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-700 dark:bg-sky-500/10 dark:text-sky-200">
                  Format <code className="rounded bg-sky-100 px-1 dark:bg-sky-500/20">starts_at / ends_at</code> = <strong>YYYY-MM-DDTHH:mm</strong> (WIB, contoh: 2026-09-01T08:00). Sistem akan simpan sebagai UTC.
                </p>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Langkah 2 · Unggah & Pratinjau" subtitle="Excel (.xlsx/.xls) atau CSV. Deteksi otomatis ; atau , . Maks 100 baris pratinjau." />
          <CardBody>
            <label className="group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition-colors hover:border-primary-400 hover:bg-primary-50/40 dark:border-slate-700 dark:bg-slate-800/30 dark:hover:border-primary-500/50 dark:hover:bg-slate-800">
              <Upload className="h-7 w-7 text-slate-400 group-hover:text-primary-500 dark:text-slate-500" />
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{fileName || 'Klik untuk pilih file .csv / .xlsx'}</span>
              <span className="text-xs text-slate-400">Header wajib sama persis dengan template di atas</span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleFile(f)
                  e.target.value = ''
                }}
              />
            </label>
            {fileName && (
              <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                <span className="truncate text-xs font-medium text-slate-600 dark:text-slate-300">{fileName} · {rows.length} baris</span>
                <button onClick={resetFile} className="text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400">Hapus</button>
              </div>
            )}

            {validated && (
              <div className="mt-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge tone="green"><CheckCircle2 className="mr-1 inline h-3 w-3" />{validated.filter((v) => v.valid).length} valid</Badge>
                  <Badge tone="red"><XCircle className="mr-1 inline h-3 w-3" />{validated.filter((v) => !v.valid).length} error</Badge>
                  <Badge tone="gray">{rows.length} total</Badge>
                </div>
                <div className="max-h-[320px] overflow-auto rounded-xl border border-slate-200 scrollbar-thin dark:border-slate-700">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
                      <tr>
                        <th className="table-th">#</th>
                        {meta.headers.slice(0, 5).map((h) => (
                          <th key={h} className="table-th">{h}</th>
                        ))}
                        {meta.headers.length > 5 && <th className="table-th">…</th>}
                        <th className="table-th">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {validated.slice(0, 100).map((v) => (
                        <tr key={v.index} className={v.valid ? 'bg-white dark:bg-slate-900' : 'bg-rose-50/60 dark:bg-rose-500/10'}>
                          <td className="table-td text-slate-400">{v.index + 1}</td>
                          {meta.headers.slice(0, 5).map((h) => {
                            const key = normalizeHeader(h)
                            const raw = rows[v.index] ?? {}
                            const val = (v.data as Record<string, unknown>)?.[key] ?? (v.data as Record<string, unknown>)?.[h] ?? raw[key] ?? raw[h] ?? ''
                            return (
                              <td key={h} className="table-td max-w-[140px] truncate font-mono text-[11px]">{String(val || '-')}</td>
                            )
                          })}
                          {meta.headers.length > 5 && <td className="table-td text-slate-400">+{meta.headers.length - 5}</td>}
                          <td className="table-td">
                            {v.valid ? <Badge tone="green">OK</Badge> : <span className="line-clamp-2 max-w-[200px] text-[11px] font-medium text-rose-600 dark:text-rose-300">{v.errors.join(', ')}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {validated.length > 100 && <p className="mt-1 text-xs text-slate-400">Menampilkan 100 dari {validated.length} baris.</p>}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Langkah 3 · Jalankan Import" subtitle={`Akan memproses ${validated?.filter((v) => v.valid).length ?? 0} baris valid untuk ${KIND_LABELS[kind]}.`} />
          <CardBody>
            {progress.running ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                  <Loader2 className="h-4 w-4 animate-spin text-primary-500" />
                  Mengimport... {progress.done}/{validated?.filter((v) => v.valid).length} {progress.fail > 0 && `(gagal: ${progress.fail})`}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${Math.min(100, (progress.done / Math.max(1, validated!.filter((v) => v.valid).length)) * 100)}%` }} />
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="flex items-center gap-1.5 text-xs text-slate-400">
                    <AlertCircle className="h-3.5 w-3.5" /> Pastikan pratinjau sudah benar. Duplikat username / kode akan ditolak.
                  </p>
                  <div className="flex gap-2">
                    {resultDetails && resultDetails.failed === 0 && resultDetails.success > 0 ? (
                      <Button variant="outline" size="sm" onClick={resetFile}>Import File Lain</Button>
                    ) : null}
                    <Button
                      disabled={!validated || validated.filter((v) => v.valid).length === 0 || progress.running || (resultDetails !== null && resultDetails.failed === 0 && resultDetails.success > 0)}
                      onClick={runImport}
                      icon={<Upload className="h-4 w-4" />}
                    >
                      {resultDetails && resultDetails.failed === 0 && resultDetails.success > 0 ? 'Sudah Diimport' : `Import ${validated?.filter((v) => v.valid).length ?? 0} ${KIND_LABELS[kind]}`}
                    </Button>
                  </div>
                </div>
                {resultDetails && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                      Hasil: <span className="text-emerald-600 dark:text-emerald-400">{resultDetails.success} berhasil</span> · <span className="text-rose-600 dark:text-rose-400">{resultDetails.failed} gagal</span>
                    </p>
                    {resultDetails.errors.length > 0 && (
                      <ul className="mt-2 max-h-32 list-disc overflow-y-auto pl-4 text-xs text-rose-600 dark:text-rose-300 scrollbar-thin">
                        {resultDetails.errors.slice(0, 20).map((e, i) => (
                          <li key={i}>Baris {e.row}: {e.msg}</li>
                        ))}
                        {resultDetails.errors.length > 20 && <li>+{resultDetails.errors.length - 20} error lain...</li>}
                      </ul>
                    )}
                    {resultDetails.failed === 0 && resultDetails.success > 0 && (
                      <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                        <CheckCircle2 className="h-4 w-4" /> File berhasil diproses sepenuhnya. Pilih file baru jika ingin import lagi.
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <aside className="space-y-4">
        <Card className="border-primary-100 bg-primary-50/40 dark:border-primary-800/40 dark:bg-primary-500/5">
          <CardBody>
            <h3 className="flex items-center gap-2 text-sm font-bold text-primary-800 dark:text-primary-200">
              <FileSpreadsheet className="h-4 w-4" /> Aturan Validasi — {KIND_LABELS[kind]}
            </h3>
            <ul className="mt-3 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-primary-900/70 dark:text-primary-200/70">
              {kind === 'students' && (
                <>
                  <li>Username unik 3-30 karakter (huruf/angka/._-)</li>
                  <li>Password minimal 8 karakter</li>
                  <li>Nama lengkap minimal 2 karakter</li>
                  <li>class_name harus ada di sistem</li>
                  <li>Duplikat username dalam file ditolak</li>
                  <li>Email kosong atau valid, gender L/P/kosong</li>
                </>
              )}
              {kind === 'teachers' && (
                <>
                  <li>Username unik 3-30 karakter</li>
                  <li>Password minimal 8 karakter</li>
                  <li>Nama lengkap minimal 2 karakter</li>
                  <li>Duplikat username ditolak</li>
                  <li>NIP/Phone opsional, email valid jika diisi</li>
                </>
              )}
              {kind === 'question_banks' && (
                <>
                  <li>question_text minimal 5 karakter (HTML didukung)</li>
                  <li>type: multiple_choice / multiple_response / true_false / short_answer / essay</li>
                  <li>Untuk PG butuh minimal 2 opsi (option_a/b) + correct_answer (A atau A,C)</li>
                  <li>Untuk TF: correct_answer = Benar/Salah</li>
                  <li>Untuk isian: correct_answer = Jawaban1; Jawaban2</li>
                  <li>Bank tujuan wajib dipilih</li>
                  <li>Bobot otomatis: tiap soal setara, nilai akhir selalu 0-100</li>
                </>
              )}
              {kind === 'exams' && (
                <>
                  <li>Judul minimal 4 karakter</li>
                  <li>starts_at &lt; ends_at (YYYY-MM-DDTHH:mm WIB)</li>
                  <li>Durasi 1-1440 menit, KKM 0-100</li>
                </>
              )}
              {kind === 'grades' && (
                <>
                  <li>exam_title harus persis (case-insensitive)</li>
                  <li>NIS harus ada di sistem</li>
                  <li>Siswa harus sudah punya attempt ujian tersebut</li>
                  <li>Score 0-100</li>
                </>
              )}
            </ul>
            <div className="mt-4 rounded-lg bg-white px-3 py-2.5 text-xs dark:bg-slate-900">
              <p className="font-semibold text-slate-700 dark:text-slate-200">Tips file</p>
              <p className="mt-1 leading-relaxed text-slate-500 dark:text-slate-400">Header harus huruf kecil dengan underscore. Simpan sebagai <strong>CSV UTF-8</strong> atau <strong>XLSX</strong>. Baris kosong otomatis diabaikan.</p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Contoh cepat</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Unduh header saja — siap isi, background header ikut tema, huruf besar & rata tengah.</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => downloadHeaderOnlyCsv(`header-${kind}`, meta.headers)}>CSV</Button>
              <Button size="sm" className="flex-1" onClick={() => downloadHeaderOnlyExcel(`header-${kind}`, meta.headers)}>Excel</Button>
            </div>
          </CardBody>
        </Card>
      </aside>
    </div>
  )
}

function ExportPanel() {
  const query = useAsync(async () => {
    const fetchAllStudents = async () => {
      const all: Awaited<ReturnType<typeof listStudents>>['rows'] = []
      let page = 1
      const pageSize = 1000
      for (;;) {
        const res = await listStudents({ page, pageSize })
        all.push(...res.rows)
        if (res.rows.length < pageSize || all.length >= (res.total ?? all.length)) break
        page++
        if (page > 20) break
      }
      return { rows: all, total: all.length }
    }
    const fetchAllTeachers = async () => {
      const all: Awaited<ReturnType<typeof listTeachers>>['rows'] = []
      let page = 1
      const pageSize = 500
      for (;;) {
        const res = await listTeachers({ page, pageSize })
        all.push(...res.rows)
        if (res.rows.length < pageSize || all.length >= (res.total ?? all.length)) break
        page++
        if (page > 20) break
      }
      return { rows: all, total: all.length }
    }
    const fetchAllBanks = async () => {
      const m = await import('@/services/questions.service')
      const all: Awaited<ReturnType<typeof m.listBanks>>['rows'] = []
      let page = 1
      const pageSize = 100
      for (;;) {
        const res = await m.listBanks({ page, pageSize })
        all.push(...res.rows)
        if (res.rows.length < pageSize) break
        page++
        if (page > 50) break
      }
      return all
    }
    const fetchAllExams = async () => {
      const m = await import('@/services/exams.service')
      const all: Awaited<ReturnType<typeof m.listExams>>['rows'] = []
      let page = 1
      const pageSize = 100
      for (;;) {
        const res = await m.listExams({ page, pageSize })
        all.push(...res.rows)
        if (res.rows.length < pageSize) break
        page++
        if (page > 50) break
      }
      return all
    }
    const fetchAllResults = async () => {
      const m = await import('@/services/grading.service')
      const all: Awaited<ReturnType<typeof m.listResults>>['rows'] = []
      let page = 1
      const pageSize = 200
      for (;;) {
        const res = await m.listResults({ page, pageSize })
        all.push(...res.rows)
        if (res.rows.length < pageSize) break
        page++
        if (page > 50) break
      }
      return all
    }
    return Promise.all([
      fetchAllStudents(),
      fetchAllTeachers(),
      fetchAllBanks(),
      fetchAllExams(),
      fetchAllResults(),
    ])
  }, [])
  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />

  const students = query.data?.[0].rows ?? []
  const teachers = query.data?.[1].rows ?? []
  const banks = (query.data?.[2] as unknown[]) ?? []
  const exams = (query.data?.[3] as unknown[]) ?? []
  const results = (query.data?.[4] as unknown[]) ?? []

  type StudentRow = (typeof students)[number]
  type TeacherRow = (typeof teachers)[number]

  const studentCols: ExportColumn<StudentRow>[] = [
    { header: 'NIS', value: (s) => s.nis ?? '' },
    { header: 'NISN', value: (s) => s.nisn ?? '' },
    { header: 'Nama', value: (s) => s.profiles?.full_name ?? '' },
    { header: 'Username', value: (s) => s.profiles?.username ?? '' },
    { header: 'Kelas', value: (s) => s.classes?.name ?? '' },
    { header: 'Jurusan', value: (s) => s.classes?.departments?.name ?? '' },
    { header: 'JK', value: (s) => s.gender ?? '' },
    { header: 'Telepon', value: (s) => s.phone ?? '' },
  ]
  const teacherCols: ExportColumn<TeacherRow>[] = [
    { header: 'NIP', value: (t) => t.nip ?? '' },
    { header: 'Nama', value: (t) => t.profiles?.full_name ?? '' },
    { header: 'Username', value: (t) => t.profiles?.username ?? '' },
    { header: 'Telepon', value: (t) => t.phone ?? '' },
  ]
  const bankCols: ExportColumn<any>[] = [
    { header: 'Judul', value: (b) => b.title ?? '' },
    { header: 'Status', value: (b) => b.status ?? '' },
  ]
  const examCols: ExportColumn<any>[] = [
    { header: 'Judul', value: (e) => e.title ?? '' },
    { header: 'Mulai', value: (e) => e.starts_at ?? '' },
    { header: 'Selesai', value: (e) => e.ends_at ?? '' },
    { header: 'Status', value: (e) => e.status ?? '' },
  ]
  const resultCols: ExportColumn<any>[] = [
    { header: 'Ujian', value: (r) => r.exams?.title ?? '' },
    { header: 'Siswa', value: (r) => r.attempts?.students?.profiles?.full_name ?? '' },
    { header: 'Nilai', value: (r) => String(r.final_score ?? '') },
    { header: 'Lulus', value: (r) => (r.passed ? 'Ya' : 'Tidak') },
  ]

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <ExportCard icon={<GraduationCap className="h-5 w-5" />} title={`Data Siswa (${students.length})`} onCsv={() => exportCsv('data-siswa', students, studentCols)} onExcel={async () => await exportExcel('data-siswa', 'Siswa', students, studentCols)} />
      <ExportCard icon={<Users className="h-5 w-5" />} title={`Data Guru (${teachers.length})`} onCsv={() => exportCsv('data-guru', teachers, teacherCols)} onExcel={async () => await exportExcel('data-guru', 'Guru', teachers, teacherCols)} />
      <ExportCard icon={<FileSpreadsheet className="h-5 w-5" />} title={`Bank Soal (${(banks as unknown[]).length})`} onCsv={() => exportCsv('bank-soal', banks as any, bankCols)} onExcel={async () => await exportExcel('bank-soal', 'Bank Soal', banks as any, bankCols)} />
      <ExportCard icon={<FileSpreadsheet className="h-5 w-5" />} title={`Ujian (${(exams as unknown[]).length})`} onCsv={() => exportCsv('daftar-ujian', exams as any, examCols)} onExcel={async () => await exportExcel('daftar-ujian', 'Ujian', exams as any, examCols)} />
      <ExportCard icon={<FileSpreadsheet className="h-5 w-5" />} title={`Hasil & Nilai (${(results as unknown[]).length})`} onCsv={() => exportCsv('hasil-ujian', results as any, resultCols)} onExcel={async () => await exportExcel('hasil-ujian', 'Nilai', results as any, resultCols)} />
      <p className="col-span-full text-center text-xs text-slate-400 dark:text-slate-500 sm:text-left">
        Semua data di atas tersedia CSV &amp; Excel. Laporan PDF lengkap juga ada di menu <strong>Laporan</strong>.
      </p>
    </div>
  )
}

function ExportCard({ icon, title, onCsv, onExcel }: { icon: React.ReactNode; title: string; onCsv: () => void; onExcel: () => Promise<void> }) {
  const toast = useToast()
  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300">{icon}</span>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{title}</h3>
        </div>
        <div className="mt-4 flex gap-2">
          <Button size="sm" variant="outline" onClick={onCsv}>CSV</Button>
          <Button size="sm" variant="outline" onClick={async () => { await onExcel(); toast.success('Excel diunduh.') }}>Excel</Button>
        </div>
      </CardBody>
    </Card>
  )
}
