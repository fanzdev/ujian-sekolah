import Papa from 'papaparse'
import { z } from 'zod'

export interface ParsedCsv {
  rows: Record<string, string>[]
  errors: string[]
}

export const HEADER_ALIASES: Record<string, string> = {
  'nama_lengkap': 'full_name',
  'jenis_kelamin': 'gender',
  'nama_kelas': 'class_name',
  'telepon': 'phone',
  'kode': 'code',
  'nama': 'name',
  'deskripsi': 'description',
  'nama_bank': 'bank_title',
  'teks_soal': 'question_text',
  'jenis_soal': 'type',
  'poin': 'points',
  'pilihan_a': 'option_a',
  'pilihan_b': 'option_b',
  'pilihan_c': 'option_c',
  'pilihan_d': 'option_d',
  'pilihan_e': 'option_e',
  'kunci_jawaban': 'correct_answer',
  'pembahasan': 'explanation',
  'judul': 'title',
  'kode_mapel': 'subject_code',
  'waktu_mulai': 'starts_at',
  'waktu_selesai': 'ends_at',
  'durasi_menit': 'duration_minutes',
  'kkm': 'passing_grade',
  'judul_ujian': 'exam_title',
  'nilai': 'score',
  'umpan_balik': 'feedback',
}
export function normalizeHeader(h: string): string {
  const key = h.trim().toLowerCase().replace(/\s+/g, '_')
  return HEADER_ALIASES[key] ?? key
}
function normalizeRow(row: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(row)) out[normalizeHeader(k)] = v
  return out
}
export function parseCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      delimiter: '',
      transformHeader: (h) => normalizeHeader(h),
      complete: (result) => {
        let rows = (result.data as Record<string, string>[]).map(normalizeRow)
        let errors = result.errors.map((e) => `Baris ${e.row ?? '?'}: ${e.message}`)
        if (rows.length > 0 && Object.keys(rows[0] ?? {}).length === 1) {
          const singleKey = Object.keys(rows[0] ?? {})[0] ?? ''
          if (singleKey.includes(';') || singleKey.includes(',')) {
            const delim = singleKey.includes(';') ? ';' : ','
            const headers = singleKey.split(delim).map((h) => normalizeHeader(h))
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
      out[normalizeHeader(k)] = String(v ?? '')
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

const TYPE_ID_MAP: Record<string, string> = {
  'pilihan ganda': 'multiple_choice',
  'pilihan_ganda': 'multiple_choice',
  'pg': 'multiple_choice',
  'pilgan': 'multiple_choice',
  'pilihan ganda kompleks': 'multiple_response',
  'pilihan_ganda_kompleks': 'multiple_response',
  'pg kompleks': 'multiple_response',
  'kompleks': 'multiple_response',
  'benar/salah': 'true_false',
  'benar_salah': 'true_false',
  'b/s': 'true_false',
  'isian singkat': 'short_answer',
  'isian_singkat': 'short_answer',
  'jawaban singkat': 'short_answer',
  'isai singkat': 'short_answer',
  'esai': 'essay',
  'essay': 'essay',
  'uraian': 'essay',
  'menjodohkan': 'matching',
  'jodohkan': 'matching',
  'pasangan': 'matching',
}
function normType(v: string): string {
  const k = v.trim().toLowerCase().replace(/\s+/g, ' ').replace(/_/g, ' ')
  return TYPE_ID_MAP[k] ?? k.replace(/\s+/g, '_')
}
const DIFF_ID_MAP: Record<string, string> = {
  'mudah': 'easy',
  'gampang': 'easy',
  'sedang': 'medium',
  'menengah': 'medium',
  'sulit': 'hard',
  'susah': 'hard',
}
function normDiff(v: string): string {
  const k = v.trim().toLowerCase()
  if (!k) return 'medium'
  return DIFF_ID_MAP[k] ?? k
}
export const soalRowSchema = z.object({
  bank_title: z.string().optional().default(''),
  question_text: z.string().min(5, 'teks soal minimal 5 karakter'),
  type: z.string().transform((v) => normType(v)).refine((v) => ['multiple_choice', 'multiple_response', 'true_false', 'short_answer', 'essay', 'matching'].includes(v), 'jenis harus: Pilihan Ganda / Pilihan Ganda Kompleks / Benar/Salah / Isian Singkat / Esai / Menjodohkan'),
  difficulty: z.string().optional().default('medium').transform((v) => normDiff(String(v))).refine((v) => ['easy', 'medium', 'hard'].includes(v), 'tingkat kesulitan harus: Mudah / Sedang / Sulit'),
  points: z.union([z.string(), z.number()]).optional().default(10).transform((v) => {
    if (v === '' || v === undefined || v === null) return 10
    const n = Number(v)
    return Number.isFinite(n) ? n : 10
  }).refine((n) => Number.isFinite(n) && n > 0 && n <= 100, 'poin 1-100'),
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
  duration_minutes: z.union([z.string(), z.number()]).transform((v) => {
    if (v === '' || v === undefined || v === null) return 60
    const n = Number(v)
    return Number.isFinite(n) ? n : 60
  }).refine((n) => Number.isFinite(n) && n >= 1 && n <= 1440, 'durasi 1-1440 menit'),
  passing_grade: z.union([z.string(), z.number()]).optional().default(0).transform((v) => {
    if (v === '' || v === undefined || v === null) return 0
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }).refine((n) => Number.isFinite(n) && n >= 0 && n <= 100, 'KKM 0-100'),
  description: z.string().optional().default(''),
})

export const gradeRowSchema = z.object({
  exam_title: z.string().min(1, 'judul ujian wajib'),
  nis: z.string().min(1, 'NIS wajib'),
  score: z.union([z.string(), z.number()]).transform((v) => {
    if (v === '' || v === undefined || v === null) return 0
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }).refine((n) => Number.isFinite(n) && n >= 0 && n <= 100, 'nilai 0-100'),
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
    headers: ['username', 'password', 'nama_lengkap', 'nis', 'nisn', 'jenis_kelamin', 'nama_kelas', 'telepon', 'email'],
    examples: [
      ['budi.siswa', 'Password123', 'Budi Santoso', '12345', '0012345678', 'L', 'X IPA 1', '081234567890', 'budi@example.com'],
      ['siti.aminah', 'Siswa2026!', 'Siti Aminah', '12346', '0012345679', 'P', 'X IPA 1', '081234567891', ''],
      ['ahmad.rifai', 'Rifai2026', 'Ahmad Rifai', '12347', '', 'L', 'XI IPS 2', '', 'ahmad@example.com'],
    ],
    required: ['username', 'password', 'nama_lengkap', 'nama_kelas'],
    desc: {
      username: 'Unik 3-30 karakter (huruf/angka/._-). Contoh: budi.siswa',
      password: 'Minimal 8 karakter. Contoh: Password123',
      nama_lengkap: 'Nama lengkap siswa',
      nis: 'Nomor Induk Siswa (opsional)',
      nisn: 'Nomor Induk Nasional (opsional)',
      jenis_kelamin: 'L atau P (kosongkan jika tidak ada)',
      nama_kelas: 'Harus sama persis dengan nama kelas di sistem (cth: X IPA 1)',
      telepon: 'Opsional',
      email: 'Opsional, harus valid jika diisi',
    },
  },
  teachers: {
    headers: ['username', 'password', 'nama_lengkap', 'nip', 'telepon', 'email'],
    examples: [
      ['pak.ahmad', 'Guru2026!', 'Ahmad Fauzi, S.Pd', '198765432109', '081234567892', 'ahmad@smk.sch.id'],
      ['bu.siti', 'SitiGuru1', 'Siti Rahma, M.Pd', '198765432110', '081234567893', ''],
      ['pak.joko', 'Joko12345', 'Joko Prasetyo', '', '081234567894', 'joko@example.com'],
    ],
    required: ['username', 'password', 'nama_lengkap'],
    desc: {
      username: 'Unik 3-30 karakter',
      password: 'Minimal 8 karakter',
      nama_lengkap: 'Nama lengkap guru',
      nip: 'Opsional',
      telepon: 'Opsional',
      email: 'Opsional, valid jika diisi',
    },
  },
  subjects: {
    headers: ['kode', 'nama', 'deskripsi'],
    examples: [
      ['MTK', 'Matematika', 'Mata pelajaran matematika wajib'],
      ['BINDO', 'Bahasa Indonesia', 'Bahasa Indonesia kelas X-XII'],
      ['FIS', 'Fisika', ''],
    ],
    required: ['kode', 'nama'],
    desc: {
      kode: 'Kode unik (huruf/angka/_/-). Contoh: MTK',
      nama: 'Nama mata pelajaran',
      deskripsi: 'Opsional',
    },
  },
  question_banks: {
    headers: ['nama_bank', 'teks_soal', 'jenis_soal', 'poin', 'pilihan_a', 'pilihan_b', 'pilihan_c', 'pilihan_d', 'kunci_jawaban', 'pembahasan'],
    examples: [
      ['Bank UTS MTK X', 'Ibu kota Indonesia adalah?', 'Pilihan Ganda', '10', 'Jakarta', 'Surabaya', 'Bandung', 'Medan', 'A', 'Jakarta adalah ibu kota negara Indonesia'],
      ['Bank UTS MTK X', 'Air mendidih pada suhu 100°C', 'Benar/Salah', '5', '', '', '', '', 'Benar', 'Titik didih air 100°C pada tekanan 1 atm'],
      ['Bank UAS Fisika', 'Jelaskan proses fotosintesis pada tumbuhan', 'Esai', '20', '', '', '', '', '', 'Dinilai dari kelengkapan, ketepatan konsep, dan keruntutan penjelasan'],
    ],
    required: ['nama_bank', 'teks_soal', 'jenis_soal', 'kunci_jawaban'],
    desc: {
      nama_bank: 'Judul Bank Soal tujuan (harus persis, mapel otomatis ikut bank)',
      teks_soal: 'Teks pertanyaan (HTML didukung, min 5 karakter)',
      jenis_soal: 'Jenis: Pilihan Ganda / Pilihan Ganda Kompleks / Benar/Salah / Isian Singkat / Esai / Menjodohkan',
      poin: 'Bobot poin 1-100 (default 10)',
      pilihan_a: 'Pilihan A (wajib untuk Pilihan Ganda)',
      pilihan_b: 'Pilihan B',
      pilihan_c: 'Pilihan C (opsional)',
      pilihan_d: 'Pilihan D (opsional)',
      kunci_jawaban: 'Kunci: Pilihan Ganda="A" atau "A,C" (kompleks), Benar/Salah="Benar/Salah", Isian="Jakarta; DKI Jakarta"',
      pembahasan: 'Pembahasan opsional untuk siswa',
    },
  },
  exams: {
    headers: ['judul', 'kode_mapel', 'waktu_mulai', 'waktu_selesai', 'durasi_menit', 'kkm', 'deskripsi'],
    examples: [
      ['PTS Matematika Ganjil', 'MTK', '2026-09-01T08:00', '2026-09-01T10:00', '90', '70', 'PTS semester ganjil'],
      ['UAS Bahasa Indonesia', 'BINDO', '2026-09-02T08:00', '2026-09-02T11:00', '120', '65', ''],
      ['Ujian Fisika XI', 'FIS', '2026-09-10T07:30', '2026-09-10T09:00', '90', '75', 'Bab 1-3'],
    ],
    required: ['judul', 'waktu_mulai', 'waktu_selesai', 'durasi_menit'],
    desc: {
      judul: 'Judul ujian (min 4 karakter)',
      kode_mapel: 'Kode mapel (opsional, harus ada jika diisi)',
      waktu_mulai: 'Format: YYYY-MM-DDTHH:mm (WIB, cth: 2026-09-01T08:00)',
      waktu_selesai: 'Harus setelah waktu mulai',
      durasi_menit: 'Durasi pengerjaan 1-1440',
      kkm: '0-100 (default 0)',
      deskripsi: 'Opsional',
    },
  },
  grades: {
    headers: ['judul_ujian', 'nis', 'nilai', 'umpan_balik'],
    examples: [
      ['PTS Matematika Ganjil', '12345', '85', 'Bagus, tingkatkan lagi'],
      ['PTS Matematika Ganjil', '12346', '92', 'Sangat baik'],
      ['UAS Bahasa Indonesia', '12345', '78', ''],
    ],
    required: ['judul_ujian', 'nis', 'nilai'],
    desc: {
      judul_ujian: 'Judul ujian persis sesuai di sistem',
      nis: 'NIS siswa',
      nilai: '0-100',
      umpan_balik: 'Opsional',
    },
  },
}
