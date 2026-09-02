const TZ = 'Asia/Jakarta'

const dateFmt = new Intl.DateTimeFormat('id-ID', {
  timeZone: TZ,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const dateTimeFmt = new Intl.DateTimeFormat('id-ID', {
  timeZone: TZ,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const timeFmt = new Intl.DateTimeFormat('id-ID', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
})

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatDate(value: string | Date | null | undefined): string {
  const d = toDate(value)
  return d ? dateFmt.format(d).replace('.', '') : '-'
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value)
  if (!d) return '-'
  const parts = dateTimeFmt.formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('day')} ${get('month')} ${get('year')}, ${get('hour')}:${get('minute')}`.replace('.', '')
}

export function formatTime(value: string | Date | null | undefined): string {
  const d = toDate(value)
  if (!d) return '-'
  return timeFmt.format(d).replace('.', '').replace(':', '.') || timeFmt.format(d)
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

export function toInputValue(value: string | Date | null | undefined): string {
  const d = toDate(value)
  if (!d) return ''
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

export function fromWibInput(input: string): string | null {
  if (!input) return null
  const withSeconds = input.length === 16 ? `${input}:00` : input
  const d = new Date(`${withSeconds}+07:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function relativeTime(value: string | Date | null | undefined): string {
  const d = toDate(value)
  if (!d) return '-'
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'baru saja'
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`
  if (diff < 604800) return `${Math.floor(diff / 86400)} hari lalu`
  return formatDate(d)
}
