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
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
      complete: (result) => {
        resolve({ rows: result.data, errors: result.errors.map((e) => `Baris ${e.row ?? '?'}: ${e.message}`) })
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
    const uname = parsed.data.username.toLowerCase()
    if (seenUsernames.has(uname)) {
      return { index, valid: false, errors: [`username "${uname}" duplikat di dalam file`] }
    }
    seenUsernames.add(uname)
    return { index, data: parsed.data as z.infer<S>, valid: true, errors: [] }
  })
}

export function downloadTemplate(filename: string, headers: string[], example: string[]): void {
  const csv = '\uFEFF' + headers.join(';') + '\n' + example.join(';')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
