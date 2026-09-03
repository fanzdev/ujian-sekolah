import Papa from 'papaparse'
import { z } from 'zod'

export interface ParsedCsv {
  rows: Record<string, string>[]
  errors: string[]
}

export function parseCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      delimiter: '',
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
      complete: (result) => {
        let rows = result.data as Record<string, string>[]
        let errors = result.errors.map((e) => `Baris ${e.row ?? '?'}: ${e.message}`)
        if (rows.length > 0 && Object.keys(rows[0] ?? {}).length === 1) {
          const singleKey = Object.keys(rows[0] ?? {})[0] ?? ''
          if (singleKey.includes(';') || singleKey.includes(',')) {
            const delim = singleKey.includes(';') ? ';' : ','
            const headers = singleKey.split(delim).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
            const fixed: Record<string, string>[] = []
            for (const r of rows) {
              const raw = Object.values(r)[0] as string
              const vals = raw.split(delim).map((v) => v.trim())
              const obj: Record<string, string> = {}
              headers.forEach((h, i) => { obj[h] = vals[i] ?? '' })
              fixed.push(obj)
            }
            rows = fixed
            errors = []
          }
        }
        const filtered = rows.filter((r) => Object.values(r).some((v) => String(v).trim() !== ''))
        resolve({ rows: filtered, errors })
      },
      error: (err) => resolve({ rows: [], errors: [err.message] }),
    })
  })
}

export async function parseExcelFile(file: File): Promise<ParsedCsv> {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return { rows: [], errors: ['Sheet kosong.'] }
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  const rows = json.map((obj) => {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(obj)) {
      out[k.trim().toLowerCase().replace(/\s+/g, '_')] = String(v ?? '')
    }
    return out
  })
  return { rows, errors: [] }
}

export async function parseAnyFile(file: File): Promise<ParsedCsv> {
  const isExcel = /\.(xlsx|xls)$/i.test(file.name)
  return isExcel ? parseExcelFile(file) : parseCsvFile(file)
}

const usernameSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-zA-Z0-9._-]+$/, 'huruf/angka/._- saja')

export interface StudentImportRow {
  username: string
  password: string
  full_name: string
  nis: string
  nisn: string
  gender: 'L' | 'P' | ''
  class_name: string
  phone: string
  email: string
}

export const studentRowSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8, 'password min. 8 karakter'),
  full_name: z.string().min(2, 'nama lengkap wajib'),
  nis: z.string(),
  nisn: z.string(),
  gender: z.enum(['L', 'P', '']).or(z.literal('')),
  class_name: z.string(),
  phone: z.string().optional().default(''),
  email: z.union([z.string().email('email tidak valid'), z.literal('')]).optional().default(''),
})

export interface TeacherImportRow {
  username: string
  password: string
  full_name: string
  nip: string
  phone: string
  email: string
}

export const teacherRowSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8, 'password min. 8 karakter'),
  full_name: z.string().min(2, 'nama lengkap wajib'),
  nip: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  email: z.union([z.string().email('email tidak valid'), z.literal('')]).optional().default(''),
})

export const subjectRowSchema = z.object({
  code: z.string().min(1, 'kode wajib').max(20).regex(/^[A-Za-z0-9_-]+$/, 'kode huruf/angka/_/- saja'),
  name: z.string().min(2, 'nama wajib').max(100),
  description: z.string().optional().default(''),
})

export const questionBankRowSchema = z.object({
  title: z.string().min(3, 'judul minimal 3 karakter').max(150),
  subject_code: z.string().optional().default(''),
  grade_level: z.union([z.string(), z.number()]).optional().transform((v) => {
    if (v === '' || v === undefined || v === null) return ''
    const n = Number(v)
    return Number.isNaN(n) ? String(v) : n
  }).refine((v) => v === '' || (typeof v === 'number' && v >= 1 && v <= 12), 'grade 1-12 atau kosong'),
  description: z.string().optional().default(''),
  status: z.enum(['draft', 'published', 'archived', '']).optional().default('draft').transform((v) => (v === '' ? 'draft' : v)),
  tags: z.string().optional().default(''),
})

export const soalRowSchema = z.object({
  bank_title: z.string().optional().default(''),
  question_text: z.string().min(5, 'teks soal minimal 5 karakter'),
  type: z.enum(['multiple_choice', 'multiple_response', 'true_false', 'short_answer', 'essay', 'matching']).or(z.string()).transform((v) => v.trim().toLowerCase()).refine((v) => ['multiple_choice', 'multiple_response', 'true_false', 'short_answer', 'essay', 'matching'].includes(v), 'type harus: multiple_choice / multiple_response / true_false / short_answer / essay / matching'),
  difficulty: z.enum(['easy', 'medium', 'hard', '']).optional().default('medium').transform((v) => (v === '' ? 'medium' : v)),
  points: z.union([z.string(), z.number()]).optional().default(10).transform((v) => Number(v)).refine((n) => Number.isFinite(n) && n > 0 && n <= 100, 'poin 1-100'),
  option_a: z.string().optional().default(''),
  option_b: z.string().optional().default(''),
  option_c: z.string().optional().default(''),
  option_d: z.string().optional().default(''),
  option_e: z.string().optional().default(''),
  correct_answer: z.string().optional().default(''),
  explanation: z.string().optional().default(''),
})

export const examRowSchema = z.object({
  title: z.string().min(4, 'judul minimal 4 karakter').max(150),
  subject_code: z.string().optional().default(''),
  starts_at: z.string().min(1, 'waktu mulai wajib').refine((v) => !Number.isNaN(Date.parse(v)), 'format tanggal tidak valid (cth: 2026-08-27T08:00)'),
  ends_at: z.string().min(1, 'waktu selesai wajib').refine((v) => !Number.isNaN(Date.parse(v)), 'format tanggal tidak valid'),
  duration_minutes: z.union([z.string(), z.number()]).transform((v) => Number(v)).refine((n) => Number.isFinite(n) && n >= 1 && n <= 1440, 'durasi 1-1440 menit'),
  passing_grade: z.union([z.string(), z.number()]).optional().default(0).transform((v) => Number(v)).refine((n) => Number.isFinite(n) && n >= 0 && n <= 100, 'KKM 0-100'),
  description: z.string().optional().default(''),
})

export const gradeRowSchema = z.object({
  exam_title: z.string().min(1, 'judul ujian wajib'),
  nis: z.string().min(1, 'NIS wajib'),
  score: z.union([z.string(), z.number()]).transform((v) => Number(v)).refine((n) => Number.isFinite(n) && n >= 0 && n <= 100, 'nilai 0-100'),
  feedback: z.string().optional().default(''),
})

export interface ImportRowResult<T> {
  index: number
  data?: T
  valid: boolean
  errors: string[]
}

export function validateRows<S extends z.ZodTypeAny>(
  rawRows: Record<string, string>[],
  schema: S,
): ImportRowResult<z.infer<S>>[] {
  const seenUsernames = new Set<string>()
  return rawRows.map((row, index) => {
    const parsed = schema.safeParse(row)
    if (!parsed.success) {
      return {
        index,
        valid: false,
        errors: parsed.error.errors.map((e) => `${String(e.path[0] ?? '')}: ${e.message}`),
      }
    }
    const data = parsed.data as Record<string, unknown>
    if (typeof data.username === 'string' && data.username) {
      const uname = String(data.username).toLowerCase()
      if (seenUsernames.has(uname)) {
        return { index, valid: false, errors: [`username "${uname}" duplikat di dalam file`] }
      }
      seenUsernames.add(uname)
    }
    if ('question_text' in data && typeof data.question_text === 'string') {
      const q = String(data.question_text).trim()
      if (q.length < 5) return { index, valid: false, errors: ['question_text: minimal 5 karakter'] }
      const type = String(data.type ?? '').toLowerCase()
      const correct = String(data.correct_answer ?? '').trim()
      if ((type === 'multiple_choice' || type === 'multiple_response') && !correct) {
        return { index, valid: false, errors: ['correct_answer wajib untuk pilihan ganda'] }
      }
      if (type === 'true_false' && !correct) {
        return { index, valid: false, errors: ['correct_answer wajib: Benar/Salah'] }
      }
    }
    return { index, data: parsed.data as z.infer<S>, valid: true, errors: [] }
  })
}

function getPrimaryHex(): string {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--c-primary-600').trim()
    if (raw) {
      const parts = raw.split(/\s+/).map(Number)
      if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) {
        return parts.slice(0, 3).map((n) => Math.round(n).toString(16).padStart(2, '0')).join('').toUpperCase()
      }
    }
  } catch { /* ignore */ }
  return '2563EB'
}

export function downloadTemplate(filename: string, headers: string[], example: string[]): void {
  const upper = headers.map((h) => h.toUpperCase())
  const csv = '\uFEFF' + upper.join(',') + '\n' + example.join(',')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadTemplateCsv(filename: string, headers: string[], examples: string[][]): void {
  const upperHeaders = headers.map((h) => h.toUpperCase())
  const lines = ['\uFEFF' + upperHeaders.join(','), ...examples.map((r) => r.map((v) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }).join(','))]
  const csv = lines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadTemplateExcel(filename: string, headers: string[], examples: string[][]): Promise<void> {
  const XLSX = await import('xlsx')
  const upperHeaders = headers.map((h) => h.toUpperCase())
  const ws = XLSX.utils.aoa_to_sheet([upperHeaders, ...examples])
  const colWidths = upperHeaders.map((h, i) => {
    const maxLen = Math.max(h.length, ...examples.map((r) => String(r[i] ?? '').length))
    return { wch: Math.min(30, Math.max(12, maxLen + 2)) }
  })
  ws['!cols'] = colWidths
  ws['!rows'] = [{ hpt: 22 }]
  const primaryHex = getPrimaryHex()
  const headerStyle = {
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
    fill: { fgColor: { rgb: primaryHex } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: primaryHex } },
      bottom: { style: 'thin', color: { rgb: primaryHex } },
      left: { style: 'thin', color: { rgb: primaryHex } },
      right: { style: 'thin', color: { rgb: primaryHex } },
    },
  }
  upperHeaders.forEach((_, colIdx) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIdx })
    if (ws[cellRef]) (ws[cellRef] as unknown as { s?: unknown }).s = headerStyle
  })
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: upperHeaders.length - 1 } }) }
  void range
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Template')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadHeaderOnlyExcel(filename: string, headers: string[]): Promise<void> {
  const XLSX = await import('xlsx')
  const upperHeaders = headers.map((h) => h.toUpperCase())
  const ws = XLSX.utils.aoa_to_sheet([upperHeaders])
  ws['!cols'] = upperHeaders.map((h) => ({ wch: Math.min(30, Math.max(12, h.length + 4)) }))
  ws['!rows'] = [{ hpt: 22 }]
  const primaryHex = getPrimaryHex()
  const headerStyle = {
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
    fill: { fgColor: { rgb: primaryHex } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: primaryHex } },
      bottom: { style: 'thin', color: { rgb: primaryHex } },
      left: { style: 'thin', color: { rgb: primaryHex } },
      right: { style: 'thin', color: { rgb: primaryHex } },
    },
  }
  upperHeaders.forEach((_, colIdx) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIdx })
    if (ws[cellRef]) (ws[cellRef] as unknown as { s?: unknown }).s = headerStyle
  })
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: upperHeaders.length - 1 } }) }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Template')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadHeaderOnlyCsv(filename: string, headers: string[]): void {
  const upperHeaders = headers.map((h) => h.toUpperCase())
  const csv = '\uFEFF' + upperHeaders.join(',')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export const importKindMeta: Record<string, { headers: string[]; examples: string[][]; required: string[]; desc: Record<string, string> }> = {
  students: {
    headers: ['username', 'password', 'full_name', 'nis', 'nisn', 'gender', 'class_name', 'phone', 'email'],
    examples: [
      ['budi.siswa', 'Password123', 'Budi Santoso', '12345', '0012345678', 'L', 'X IPA 1', '081234567890', 'budi@example.com'],
      ['siti.aminah', 'Siswa2026!', 'Siti Aminah', '12346', '0012345679', 'P', 'X IPA 1', '081234567891', ''],
      ['ahmad.rifai', 'Rifai2026', 'Ahmad Rifai', '12347', '', 'L', 'XI IPS 2', '', 'ahmad@example.com'],
    ],
    required: ['username', 'password', 'full_name', 'class_name'],
    desc: {
      username: 'Unik 3-30 karakter (huruf/angka/._-). Contoh: budi.siswa',
      password: 'Minimal 8 karakter. Contoh: Password123',
      full_name: 'Nama lengkap siswa',
      nis: 'Nomor Induk Siswa (opsional)',
      nisn: 'Nomor Induk Nasional (opsional)',
      gender: 'L atau P (kosongkan jika tidak ada)',
      class_name: 'Harus sama persis dengan nama kelas di sistem (cth: X IPA 1)',
      phone: 'Opsional',
      email: 'Opsional, harus valid jika diisi',
    },
  },
  teachers: {
    headers: ['username', 'password', 'full_name', 'nip', 'phone', 'email'],
    examples: [
      ['pak.ahmad', 'Guru2026!', 'Ahmad Fauzi, S.Pd', '198765432109', '081234567892', 'ahmad@smk.sch.id'],
      ['bu.siti', 'SitiGuru1', 'Siti Rahma, M.Pd', '198765432110', '081234567893', ''],
      ['pak.joko', 'Joko12345', 'Joko Prasetyo', '', '081234567894', 'joko@example.com'],
    ],
    required: ['username', 'password', 'full_name'],
    desc: {
      username: 'Unik 3-30 karakter',
      password: 'Minimal 8 karakter',
      full_name: 'Nama lengkap guru',
      nip: 'Opsional',
      phone: 'Opsional',
      email: 'Opsional, valid jika diisi',
    },
  },
  subjects: {
    headers: ['code', 'name', 'description'],
    examples: [
      ['MTK', 'Matematika', 'Mata pelajaran matematika wajib'],
      ['BINDO', 'Bahasa Indonesia', 'Bahasa Indonesia kelas X-XII'],
      ['FIS', 'Fisika', ''],
    ],
    required: ['code', 'name'],
    desc: {
      code: 'Kode unik (huruf/angka/_/-). Contoh: MTK',
      name: 'Nama mata pelajaran',
      description: 'Opsional',
    },
  },
  question_banks: {
    headers: ['bank_title', 'question_text', 'type', 'points', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer', 'explanation'],
    examples: [
      ['Bank UTS MTK X', 'Ibu kota Indonesia adalah?', 'multiple_choice', '10', 'Jakarta', 'Surabaya', 'Bandung', 'Medan', 'A', 'Jakarta adalah ibu kota negara Indonesia'],
      ['Bank UTS MTK X', 'Air mendidih pada suhu 100°C', 'true_false', '5', '', '', '', '', 'Benar', 'Titik didih air 100°C pada tekanan 1 atm'],
      ['Bank UAS Fisika', 'Jelaskan proses fotosintesis pada tumbuhan', 'essay', '20', '', '', '', '', '', 'Dinilai dari kelengkapan, ketepatan konsep, dan keruntutan penjelasan'],
    ],
    required: ['bank_title', 'question_text', 'type', 'correct_answer'],
    desc: {
      bank_title: 'Judul Bank Soal tujuan (harus persis, mapel otomatis ikut bank)',
      question_text: 'Teks pertanyaan (HTML didukung, min 5 karakter)',
      type: 'Jenis: multiple_choice / multiple_response / true_false / short_answer / essay / matching',
      points: 'Bobot poin 1-100 (default 10)',
      option_a: 'Pilihan A (wajib untuk PG)',
      option_b: 'Pilihan B',
      option_c: 'Pilihan C (opsional)',
      option_d: 'Pilihan D (opsional)',
      correct_answer: 'Kunci: PG="A" atau "A,C" (kompleks), TF="Benar/Salah", Isian="Jakarta; DKI Jakarta"',
      explanation: 'Pembahasan opsional untuk siswa',
    },
  },
  exams: {
    headers: ['title', 'subject_code', 'starts_at', 'ends_at', 'duration_minutes', 'passing_grade', 'description'],
    examples: [
      ['PTS Matematika Ganjil', 'MTK', '2026-09-01T08:00', '2026-09-01T10:00', '90', '70', 'PTS semester ganjil'],
      ['UAS Bahasa Indonesia', 'BINDO', '2026-09-02T08:00', '2026-09-02T11:00', '120', '65', ''],
      ['Ujian Fisika XI', 'FIS', '2026-09-10T07:30', '2026-09-10T09:00', '90', '75', 'Bab 1-3'],
    ],
    required: ['title', 'starts_at', 'ends_at', 'duration_minutes'],
    desc: {
      title: 'Judul ujian (min 4 karakter)',
      subject_code: 'Kode mapel (opsional, harus ada jika diisi)',
      starts_at: 'Format: YYYY-MM-DDTHH:mm (WIB, cth: 2026-09-01T08:00)',
      ends_at: 'Harus setelah starts_at',
      duration_minutes: 'Durasi pengerjaan 1-1440',
      passing_grade: '0-100 (default 0)',
      description: 'Opsional',
    },
  },
  grades: {
    headers: ['exam_title', 'nis', 'score', 'feedback'],
    examples: [
      ['PTS Matematika Ganjil', '12345', '85', 'Bagus, tingkatkan lagi'],
      ['PTS Matematika Ganjil', '12346', '92', 'Sangat baik'],
      ['UAS Bahasa Indonesia', '12345', '78', ''],
    ],
    required: ['exam_title', 'nis', 'score'],
    desc: {
      exam_title: 'Judul ujian persis sesuai di sistem',
      nis: 'NIS siswa',
      score: '0-100',
      feedback: 'Opsional',
    },
  },
}
