import { downloadBlob } from '@/lib/utils'
import { logAudit } from './audit.service'

export type ExportColumn<T> = {
  header: string
  value: (row: T) => string | number | null
}

function toMatrix<T>(rows: T[], columns: ExportColumn<T>[]): (string | number)[][] {
  const header = columns.map((c) => c.header)
  const body = rows.map((r) => columns.map((c) => c.value(r) ?? ''))
  return [header, ...body]
}

export function exportCsv<T>(filename: string, rows: T[], columns: ExportColumn<T>[]): void {
  const matrix = toMatrix(rows, columns)
  const escape = (v: string | number): string => {
    const s = String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = '\uFEFF' + matrix.map((line) => line.map(escape).join(';')).join('\n')
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`)
  void logAudit('EXPORT_DATA', 'csv', filename, { rows: rows.length })
}

export async function exportExcel<T>(
  filename: string,
  sheetName: string,
  rows: T[],
  columns: ExportColumn<T>[],
): Promise<void> {
  const XLSX = await import('xlsx')
  const matrix = toMatrix(rows, columns)
  const ws = XLSX.utils.aoa_to_sheet(matrix)
  ws['!cols'] = columns.map(() => ({ wch: 20 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  downloadBlob(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${filename}.xlsx`,
  )
  void logAudit('EXPORT_DATA', 'excel', filename, { rows: rows.length })
}

export async function exportPdfTable(
  filename: string,
  title: string,
  head: string[],
  body: (string | number)[][],
  orientation: 'p' | 'l' = 'l',
): Promise<void> {
  const { default: jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' })

  doc.setFontSize(14)
  doc.text(title, 14, 15)
  autoTable(doc, {
    head: [head],
    body,
    startY: 22,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235] },
  })
  doc.save(`${filename}.pdf`)
  void logAudit('EXPORT_DATA', 'pdf', filename, { rows: body.length })
}
