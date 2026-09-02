import { useState } from 'react'
import { Upload, Download, FileSpreadsheet, Users, GraduationCap, Database, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { useAsync, useDocumentTitle } from '@/hooks/useAsync'
import { useToast } from '@/hooks/useToast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Input'
import { Tabs } from '@/components/ui/Tabs'
import { ErrorState } from '@/components/ui/Feedback'
import { parseAnyFile, validateRows, downloadTemplate, studentRowSchema, teacherRowSchema, type ImportRowResult } from '@/services/import.service'
import { listClasses } from '@/services/academics.service'
import { createFullUser, pingManageUser } from '@/services/users.service'
import { exportCsv, exportExcel, type ExportColumn } from '@/services/export.service'
import { listStudents, listTeachers, listSubjects } from '@/services/academics.service'

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
  const [kind, setKind] = useState<'students' | 'teachers' | 'subjects' | 'question_banks' | 'exams' | 'grades'>('students')
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [fileName, setFileName] = useState('')
  const [validated, setValidated] = useState<ImportRowResult<Record<string, unknown>>[] | null>(null)
  const [progress, setProgress] = useState<{ done: number; fail: number; running: boolean }>({ done: 0, fail: 0, running: false })
  const classesQuery = useAsync(() => listClasses(), [])

  const edgeCheck = useAsync(async () => {
    try {
      await pingManageUser()
      return true
    } catch {
      return false
    }
  }, [])

  const handleFile = async (file: File) => {
    setFileName(file.name)
    const parsed = await parseAnyFile(file)
    if (parsed.rows.length === 0) {
      toast.error('File tidak berisi data. Periksa format.')
      return
    }
    setRows(parsed.rows)
    if (kind === 'students' || kind === 'teachers') {
      const schema = kind === 'students' ? studentRowSchema : teacherRowSchema
      setValidated(validateRows(parsed.rows, schema as any) as ImportRowResult<Record<string, unknown>>[])
    } else {
      const generic = parsed.rows.map((r, i) => ({ index: i, data: r as Record<string, unknown>, valid: true, errors: [] as string[] }))
      setValidated(generic)
    }
    toast.info(`${parsed.rows.length} baris dibaca dari file.`)
  }

  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  const classByName = new Map((classesQuery.data ?? []).map((c) => [norm(c.name), c.id]))

  const runImport = async () => {
    if (!validated) return
    if (kind !== 'students' && kind !== 'teachers' && kind !== 'subjects') {
      toast.info(`Import ${kind} saat ini hanya template — data pratinjau valid, implementasi penuh menyusul. Gunakan template untuk persiapan.`)
      return
    }
    const validRows = validated.filter((v) => v.valid)
    if (validRows.length === 0) return

    setProgress({ done: 0, fail: 0, running: true })
    let done = 0
    let fail = 0

    for (const row of validRows) {
      try {
        const data = row.data as Record<string, string>
        if (kind === 'students') {
          const cid = classByName.get(norm(String(data.class_name ?? '')))
          if (!cid) throw new Error(`Kelas "${data.class_name}" tidak ditemukan`)
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
        } else if (kind === 'subjects') {
          const { supabase } = await import('@/services/client')
          const { error } = await supabase.from('subjects').insert({ code: String(data.code).trim(), name: String(data.name).trim(), description: String(data.description ?? '').trim() || null })
          if (error) throw error
        }
        done++
      } catch {
        fail++
      }
      setProgress({ done: done + fail, fail, running: true })
    }

    setProgress({ done: done + fail, fail, running: false })
    if (fail === 0) toast.success(`${done} akun berhasil diimport.`)
    else toast.warning(`${done} berhasil, ${fail} gagal. Periksa duplikat username.`)
  }

  const templateMap: Record<string, { headers: string[]; example: string[] }> = {
    students: { headers: ['username', 'password', 'full_name', 'nis', 'nisn', 'gender', 'class_name', 'phone', 'email'], example: ['nama.siswa', 'Password123', 'Nama Siswa', '1234', '0012345678', 'L', 'X A', '081234567890', ''] },
    teachers: { headers: ['username', 'password', 'full_name', 'nip', 'phone', 'email'], example: ['pak.ahmad', 'Password123', 'Ahmad Fauzi, S.Pd', '1987654321', '081234567891', ''] },
    subjects: { headers: ['code', 'name', 'description'], example: ['MTK', 'Matematika', 'Mata pelajaran matematika'] },
    question_banks: { headers: ['title', 'subject_code', 'grade_level', 'description'], example: ['Bank Soal UTS Ganjil', 'MTK', '10', 'Kumpulan soal UTS'] },
    exams: { headers: ['title', 'subject_code', 'starts_at', 'ends_at', 'duration_minutes', 'passing_grade'], example: ['Ujian Matematika', 'MTK', '2026-08-27T08:00', '2026-08-27T10:00', '90', '70'] },
    grades: { headers: ['exam_title', 'nis', 'score', 'feedback'], example: ['Ujian Matematika', '1234', '85', 'Bagus'] },
  }
  const template = templateMap[kind]

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        {!edgeCheck.data && !edgeCheck.loading && (
          <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs leading-relaxed text-sky-700">
            Edge Function <strong>manage-user</strong> belum ter-deploy — import akan menggunakan mode fallback otomatis (RPC / signUp) sehingga tetap berjalan. Untuk performa massal terbaik, deploy sesuai <code className="rounded bg-sky-100 px-1">docs/SUPABASE_SETUP.md</code>.
          </p>
        )}

        <Card>
          <CardHeader title="Langkah 1 · Unduh Template" subtitle="Isi template sesuai kolom yang tersedia." action={
            <Button size="sm" variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => downloadTemplate(`template-${kind}`, template.headers, template.example)}>
              Unduh CSV
            </Button>
          } />
          <CardBody>
            <Select
              label="Jenis Data"
              value={kind}
              onChange={(e) => { setKind(e.target.value as any); setValidated(null); setRows([]) }}
              options={[
                { value: 'students', label: 'Data Siswa (+akun)' },
                { value: 'teachers', label: 'Data Guru (+akun)' },
                { value: 'subjects', label: 'Mata Pelajaran' },
                { value: 'question_banks', label: 'Bank Soal' },
                { value: 'exams', label: 'Ujian' },
                { value: 'grades', label: 'Hasil / Nilai' },
              ]}
            />
            {kind === 'students' && (
              <p className="mt-3 text-xs leading-relaxed text-slate-400">
                Kolom <code className="rounded bg-slate-100 px-1">class_name</code> harus cocok dengan nama kelas yang sudah ada (cth: X A).
                {(classesQuery.data ?? []).length === 0 && <strong className="text-rose-500"> Belum ada kelas — buat kelas terlebih dahulu.</strong>}
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Langkah 2 · Unggah & Pratinjau" subtitle="CSV atau Excel (xlsx). Validasi otomatis + deteksi duplikat." />
          <CardBody>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition-colors hover:border-primary-400 hover:bg-primary-50/40">
              <Upload className="h-7 w-7 text-slate-400" />
              <span className="text-sm font-semibold text-slate-600">{fileName || 'Klik untuk pilih file .csv / .xlsx'}</span>
              <span className="text-xs text-slate-400">Baris akan divalidasi sebelum diimport</span>
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = '' }} />
            </label>

            {validated && (
              <div className="mt-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge tone="green"><CheckCircle2 className="mr-1 h-3 w-3 inline" />{validated.filter((v) => v.valid).length} valid</Badge>
                  <Badge tone="red"><XCircle className="mr-1 h-3 w-3 inline" />{validated.filter((v) => !v.valid).length} error</Badge>
                </div>
                <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 scrollbar-thin">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr>
                        <th className="table-th">#</th>
                        <th className="table-th">Username</th>
                        <th className="table-th">Nama</th>
                        <th className="table-th">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {validated.slice(0, 100).map((v) => (
                        <tr key={v.index} className={v.valid ? '' : 'bg-rose-50/50'}>
                          <td className="table-td text-slate-300">{v.index + 1}</td>
                          <td className="table-td font-mono">{String(v.data?.username ?? rows[v.index]?.username ?? '-')}</td>
                          <td className="table-td">{String(v.data?.full_name ?? rows[v.index]?.full_name ?? '-')}</td>
                          <td className="table-td">
                            {v.valid ? (
                              <Badge tone="green">OK</Badge>
                            ) : (
                              <span className="line-clamp-2 max-w-[220px] text-[11px] text-rose-600">{v.errors.join(', ')}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Langkah 3 · Jalankan Import" subtitle="Akun dibuat satu per satu dengan progress tracking." />
          <CardBody>
            {progress.running ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin text-primary-500" />
                  Mengimport... {progress.done}/{validated?.filter((v) => v.valid).length} {progress.fail > 0 && `(gagal: ${progress.fail})`}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${Math.min(100, (progress.done / Math.max(1, validated!.filter((v) => v.valid).length)) * 100)}%` }} />
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-400">Pastikan pratinjau sudah benar sebelum mengimport.</p>
                <Button disabled={!validated || validated.filter((v) => v.valid).length === 0} onClick={runImport} icon={<Upload className="h-4 w-4" />}>
                  Import {validated?.filter((v) => v.valid).length ?? 0} Akun
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <aside>
        <Card className="bg-primary-50/40 border-primary-100">
          <CardBody>
            <h3 className="flex items-center gap-2 text-sm font-bold text-primary-800">
              <FileSpreadsheet className="h-4 w-4" /> Aturan Validasi
            </h3>
            <ul className="mt-3 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-primary-900/70">
              <li>Username unik, 3–30 karakter (huruf, angka, . _ -)</li>
              <li>Password minimal 8 karakter per baris</li>
              <li>Nama lengkap minimal 2 karakter</li>
              <li>Duplikat dalam file ditolak otomatis</li>
              <li>Email kosong atau harus format valid</li>
              <li>Gender hanya L atau P</li>
            </ul>
          </CardBody>
        </Card>
      </aside>
    </div>
  )
}

function ExportPanel() {
  const query = useAsync(() => Promise.all([
    listStudents({ pageSize: 2000 }),
    listTeachers({ pageSize: 500 }),
    listSubjects(),
    import('@/services/questions.service').then((m) => m.listBanks({ pageSize: 100 }).then((r) => r.rows).catch(() => [])),
    import('@/services/exams.service').then((m) => m.listExams({ pageSize: 100 }).then((r) => r.rows).catch(() => [])),
    import('@/services/grading.service').then((m) => m.listResults({ pageSize: 100 }).then((r) => r.rows).catch(() => [])),
  ]), [])
  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />

  const students = query.data?.[0].rows ?? []
  const teachers = query.data?.[1].rows ?? []
  const subjects = query.data?.[2] ?? []
  const banks = (query.data?.[3] as unknown[]) ?? []
  const exams = (query.data?.[4] as unknown[]) ?? []
  const results = (query.data?.[5] as unknown[]) ?? []

  type StudentRow = (typeof students)[number]
  type TeacherRow = (typeof teachers)[number]
  type SubjectRow = (typeof subjects)[number]

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
    { header: 'Mapel', value: (t) => (t.subjects ?? []).filter(Boolean).map((s) => s!.name).join('; ') },
    { header: 'Telepon', value: (t) => t.phone ?? '' },
  ]
  const subjectCols: ExportColumn<SubjectRow>[] = [
    { header: 'Kode', value: (s) => s.code },
    { header: 'Nama', value: (s) => s.name },
  ]
  const bankCols: ExportColumn<any>[] = [
    { header: 'Judul', value: (b) => b.title ?? '' },
    { header: 'Mapel', value: (b) => b.subjects?.name ?? '' },
    { header: 'Status', value: (b) => b.status ?? '' },
  ]
  const examCols: ExportColumn<any>[] = [
    { header: 'Judul', value: (e) => e.title ?? '' },
    { header: 'Mapel', value: (e) => e.subjects?.name ?? '' },
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
      <ExportCard icon={<Database className="h-5 w-5" />} title={`Mata Pelajaran (${subjects.length})`} onCsv={() => exportCsv('mata-pelajaran', subjects, subjectCols)} onExcel={async () => await exportExcel('mata-pelajaran', 'Mapel', subjects, subjectCols)} />
      <ExportCard icon={<FileSpreadsheet className="h-5 w-5" />} title={`Bank Soal (${(banks as unknown[]).length})`} onCsv={() => exportCsv('bank-soal', banks as any, bankCols)} onExcel={async () => await exportExcel('bank-soal', 'Bank Soal', banks as any, bankCols)} />
      <ExportCard icon={<FileSpreadsheet className="h-5 w-5" />} title={`Ujian (${(exams as unknown[]).length})`} onCsv={() => exportCsv('daftar-ujian', exams as any, examCols)} onExcel={async () => await exportExcel('daftar-ujian', 'Ujian', exams as any, examCols)} />
      <ExportCard icon={<FileSpreadsheet className="h-5 w-5" />} title={`Hasil & Nilai (${(results as unknown[]).length})`} onCsv={() => exportCsv('hasil-ujian', results as any, resultCols)} onExcel={async () => await exportExcel('hasil-ujian', 'Nilai', results as any, resultCols)} />
      <p className="col-span-full text-center text-xs text-slate-400 sm:text-left">
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
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600">{icon}</span>
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        </div>
        <div className="mt-4 flex gap-2">
          <Button size="sm" variant="outline" onClick={onCsv}>CSV</Button>
          <Button size="sm" variant="outline" onClick={async () => { await onExcel(); toast.success('Excel diunduh.') }}>Excel</Button>
        </div>
      </CardBody>
    </Card>
  )
}
