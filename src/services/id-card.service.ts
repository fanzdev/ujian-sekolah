import { fetchSchoolSettings } from './settings.service'
import { resolveLogoUrl, sanitizeLogoUrl } from '@/lib/logo'
import type { SchoolSettings, Student } from '@/types/models'

const CM = 300 / 2.54
const CARD_W_MM = 50
const CARD_H_MM = 88
const CARD_W = Math.round((CARD_W_MM / 10) * CM)
const CARD_H = Math.round((CARD_H_MM / 10) * CM)
const DPR = 2

type CardSettings = CardBranding & {
  logoEl: HTMLImageElement | null
}

type CardData = {
  fullName: string
  nis: string | null
  nisn: string | null
  className: string | null
  department: string | null
}

type CardBranding = {
  appName: string
  schoolName: string
  academicYear: string | null
  primaryColor: string
  headmaster: string | null
  city: string | null
}

function resolveCardBranding(settings: SchoolSettings | null): { branding: CardBranding; logoSrc: string } {
  const primary = settings?.primary_color && /^#[0-9a-fA-F]{6}$/.test(settings.primary_color)
    ? settings.primary_color : '#0D868F'
  return {
    branding: {
      appName: settings?.app_name || 'Veyra CBT',
      schoolName: settings?.school_name || 'SMK AL-FATA',
      academicYear: settings?.academic_year ?? null,
      primaryColor: primary,
      headmaster: settings?.headmaster ?? null,
      city: settings?.city ?? null,
    },
    logoSrc: settings && sanitizeLogoUrl(settings.logo_url)
      ? resolveLogoUrl(settings.logo_url) : resolveLogoUrl(null),
  }
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rad = Math.min(Math.max(r, 0), Math.min(w, h) / 2)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
}

function initialsOf(fullName: string): string {
  const parts = fullName.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '-'
  const first = parts[0].slice(0, 1)
  const second = parts.length > 1 ? parts[parts.length - 1].slice(0, 1) : parts[0].slice(1, 2)
  return `${first}${second}`.toUpperCase()
}

function shade(hex: string, factor: number): string {
  const h = hex.replace('#', '').trim()
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return hex
  const mix = (c: number): number =>
    Math.round(factor >= 0 ? c + (255 - c) * factor : c * (1 + factor))
  const r = mix(parseInt(h.slice(0, 2), 16))
  const g = mix(parseInt(h.slice(2, 4), 16))
  const b = mix(parseInt(h.slice(4, 6), 16))
  return `rgb(${r}, ${g}, ${b})`
}

function ellipsis(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let out = text
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1)
  }
  return `${out}…`
}

function loadImage(src: string, timeoutMs = 6000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), timeoutMs)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { window.clearTimeout(timer); resolve(img) }
    img.onerror = () => { window.clearTimeout(timer); resolve(null) }
    img.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Gagal membuat gambar. Coba lagi di perangkat lain.'))
    }, 'image/png')
  })
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function mapStudentToCard(s: Pick<Student, 'profiles' | 'nis' | 'nisn' | 'classes'>): CardData {
  return {
    fullName: s.profiles?.full_name ?? '-',
    nis: s.nis ?? null,
    nisn: s.nisn ?? null,
    className: s.classes?.name ?? null,
    department: s.classes?.departments?.name ?? null,
  }
}

export function drawIdCard(
  ctx: CanvasRenderingContext2D,
  data: CardData,
  w: number,
  h: number,
  settings: CardSettings,
): void {
  const { appName, schoolName, academicYear, primaryColor, logoEl, headmaster, city } = settings
  const u = w / 100
  const R = Math.round(4.5 * u)
  const gold = '#c9a227'
  const ink = '#0f172a'
  const muted = '#64748b'
  const faint = '#94a3b8'
  const hairline = '#e2e8f0'
  const panelFill = '#f1f5f9'
  const deep = shade(primaryColor, -0.35)
  const tint = shade(primaryColor, 0.86)

  ctx.fillStyle = '#ffffff'
  rr(ctx, 0, 0, w, h, R)
  ctx.fill()

  const headerH = Math.round(43 * u)
  const bandH = Math.round(7 * u)
  const hdrGrad = ctx.createLinearGradient(0, 0, 0, headerH)
  hdrGrad.addColorStop(0, primaryColor)
  hdrGrad.addColorStop(1, deep)
  ctx.fillStyle = hdrGrad
  ctx.beginPath()
  ctx.moveTo(0, R)
  ctx.arcTo(0, 0, w, 0, R)
  ctx.arcTo(w, 0, w, headerH, R)
  ctx.lineTo(w, headerH)
  ctx.lineTo(0, headerH)
  ctx.closePath()
  ctx.fill()

  ctx.save()
  ctx.globalAlpha = 0.1
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(w + Math.round(7 * u), -Math.round(10 * u), Math.round(36 * u), 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(w - Math.round(20 * u), headerH + Math.round(14 * u), Math.round(18 * u), 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.translate(w - Math.round(28 * u), 0)
  ctx.rotate(-0.45)
  ctx.globalAlpha = 0.85
  ctx.fillStyle = gold
  ctx.fillRect(0, -Math.round(12 * u), Math.round(2.4 * u), headerH + Math.round(28 * u))
  ctx.restore()

  const bandY = headerH - bandH
  ctx.fillStyle = gold
  ctx.fillRect(0, bandY, w, bandH)
  ctx.fillStyle = ink
  ctx.font = `800 ${Math.round(4.4 * u)}px Inter, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('KARTU IDENTITAS SISWA', w / 2, bandY + bandH / 2)

  const badgeSize = Math.round(23 * u)
  const badgeX = Math.round(8.8 * u)
  const badgeY = Math.round(8.8 * u)
  const badgeR = Math.round(3.4 * u)
  ctx.fillStyle = '#ffffff'
  rr(ctx, badgeX, badgeY, badgeSize, badgeSize, badgeR)
  ctx.fill()
  ctx.save()
  rr(ctx, badgeX, badgeY, badgeSize, badgeSize, badgeR)
  ctx.clip()
  if (logoEl) {
    const pad = Math.round(3.6 * u)
    const iw = badgeSize - pad * 2
    const ih = (logoEl.height / Math.max(logoEl.width, 1)) * iw
    const dh = Math.min(ih, iw)
    ctx.drawImage(logoEl, badgeX + (badgeSize - iw) / 2, badgeY + (badgeSize - dh) / 2, iw, dh)
  } else {
    ctx.fillStyle = deep
    ctx.font = `800 ${Math.round(9.5 * u)}px Inter, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(appName.slice(0, 2).toUpperCase(), badgeX + badgeSize / 2, badgeY + badgeSize / 2)
  }
  ctx.restore()

  const textX = badgeX + badgeSize + Math.round(4 * u)
  const textMaxW = w - textX - Math.round(8 * u)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(255,255,255,0.78)'
  ctx.font = `700 ${Math.round(4.6 * u)}px Inter, system-ui, sans-serif`
  ctx.fillText(appName.toUpperCase(), textX, Math.round(11 * u))
  ctx.fillStyle = '#ffffff'
  ctx.font = `800 ${Math.round(6.8 * u)}px Inter, system-ui, sans-serif`
  ctx.fillText(ellipsis(ctx, schoolName, textMaxW), textX, Math.round(16.4 * u))
  if (academicYear) {
    const yearLabel = `T.A. ${academicYear}`
    ctx.font = `600 ${Math.round(4.9 * u)}px Inter, system-ui, sans-serif`
    const pillW = ctx.measureText(yearLabel).width + Math.round(9 * u)
    const pillH = Math.round(7 * u)
    const pillY = Math.round(26.8 * u)
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    rr(ctx, textX, pillY, pillW, pillH, pillH / 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(yearLabel, textX + pillW / 2, pillY + pillH / 2)
  }

  const avatarCy = Math.round(63 * u)
  const avatarR = Math.round(9.5 * u)
  ctx.fillStyle = tint
  ctx.beginPath()
  ctx.arc(w / 2, avatarCy, avatarR, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = primaryColor
  ctx.lineWidth = Math.max(3, Math.round(1.1 * u))
  ctx.beginPath()
  ctx.arc(w / 2, avatarCy, avatarR, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = deep
  ctx.font = `800 ${Math.round(9 * u)}px Inter, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(initialsOf(data.fullName), w / 2, avatarCy + Math.round(0.5 * u))

  const nameMaxW = w - Math.round(26 * u)
  ctx.textBaseline = 'top'
  const nameFontSize = Math.round(9.8 * u)
  ctx.fillStyle = ink
  ctx.font = `800 ${nameFontSize}px Inter, system-ui, sans-serif`

  const words = data.fullName.split(/\s+/).filter(Boolean)
  const nameLines: string[] = []
  let cur = ''
  for (const word of words) {
    const trial = cur ? `${cur} ${word}` : word
    if (ctx.measureText(trial).width <= nameMaxW) {
      cur = trial
    } else {
      if (cur) nameLines.push(cur)
      cur = word
      if (nameLines.length >= 2) break
    }
  }
  if (cur && nameLines.length < 2) nameLines.push(cur)
  if (nameLines.length === 0) nameLines.push(ellipsis(ctx, data.fullName, nameMaxW))
  else nameLines[nameLines.length - 1] = ellipsis(ctx, nameLines[nameLines.length - 1], nameMaxW)

  const nameLineH = nameFontSize + Math.round(2 * u)
  const nameStartY = avatarCy + avatarR + Math.round(4 * u)
  nameLines.forEach((line, i) => {
    ctx.fillText(line, w / 2, nameStartY + i * nameLineH)
  })
  const nameEndY = nameStartY + nameLines.length * nameLineH

  const infoRows = [
    data.nis ? { label: 'NIS', value: data.nis } : null,
    data.nisn ? { label: 'NISN', value: data.nisn } : null,
    data.className ? { label: 'KELAS', value: data.className } : null,
    data.department ? { label: 'JURUSAN', value: data.department } : null,
  ].filter((row): row is { label: string; value: string } => row !== null)

  const panelX = Math.round(8 * u)
  const panelW = w - panelX * 2
  const rowH = Math.round(7.8 * u)
  const panelTop = infoRows.length > 0 ? nameEndY + Math.round(3.4 * u) : nameEndY
  const panelH = infoRows.length > 0 ? infoRows.length * rowH + Math.round(5 * u) : 0
  if (infoRows.length > 0) {
    ctx.fillStyle = panelFill
    rr(ctx, panelX, panelTop, panelW, panelH, Math.round(3 * u))
    ctx.fill()
    ctx.strokeStyle = hairline
    ctx.lineWidth = 2
    rr(ctx, panelX, panelTop, panelW, panelH, Math.round(3 * u))
    ctx.stroke()
    ctx.textBaseline = 'middle'
    infoRows.forEach((row, i) => {
      const midY = panelTop + Math.round(2.5 * u) + i * rowH + rowH / 2
      ctx.textAlign = 'left'
      ctx.fillStyle = faint
      ctx.font = `700 ${Math.round(4.2 * u)}px Inter, system-ui, sans-serif`
      ctx.fillText(row.label, panelX + Math.round(5 * u), midY)
      const labelW = ctx.measureText(row.label).width
      ctx.textAlign = 'right'
      ctx.fillStyle = ink
      ctx.font = `700 ${Math.round(5.4 * u)}px Inter, system-ui, sans-serif`
      ctx.fillText(
        ellipsis(ctx, row.value, panelW - labelW - Math.round(14 * u)),
        panelX + panelW - Math.round(5 * u),
        midY,
      )
    })
  }

  const footerH = Math.round(9.5 * u)
  const footerY = h - footerH
  const today = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date())
  const sigRight = w - Math.round(8 * u)
  const sigName = headmaster && headmaster.trim() ? headmaster.trim() : null
  const sigTop = footerY - Math.round(2.7 * u) - Math.round(20 * u)
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  ctx.fillStyle = muted
  ctx.font = `500 ${Math.round(4.4 * u)}px Inter, system-ui, sans-serif`
  ctx.fillText(
    ellipsis(ctx, city && city.trim() ? `${city.trim()}, ${today}` : today, Math.round(60 * u)),
    sigRight,
    sigTop,
  )
  ctx.fillText('Kepala Sekolah', sigRight, sigTop + Math.round(5.2 * u))
  const ruleY = sigTop + Math.round(15.6 * u)
  if (sigName) {
    ctx.fillStyle = ink
    ctx.font = `800 ${Math.round(4.8 * u)}px Inter, system-ui, sans-serif`
    ctx.fillText(ellipsis(ctx, sigName, Math.round(52 * u)), sigRight, sigTop + Math.round(10.4 * u))
    const nameW = Math.min(ctx.measureText(sigName).width, Math.round(52 * u))
    ctx.fillStyle = ink
    ctx.fillRect(sigRight - nameW, ruleY, nameW, 3)
  } else {
    ctx.fillStyle = faint
    ctx.fillRect(sigRight - Math.round(32 * u), ruleY, Math.round(32 * u), 3)
  }

  const footerGrad = ctx.createLinearGradient(0, footerY, 0, h)
  footerGrad.addColorStop(0, deep)
  footerGrad.addColorStop(1, primaryColor)
  ctx.fillStyle = footerGrad
  ctx.beginPath()
  ctx.moveTo(0, footerY)
  ctx.lineTo(w, footerY)
  ctx.lineTo(w, h - R)
  ctx.arcTo(w, h, 0, h, R)
  ctx.arcTo(0, h, 0, footerY, R)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = gold
  ctx.fillRect(0, footerY, w, Math.round(0.7 * u))
  ctx.fillStyle = 'rgba(255,255,255,0.88)'
  ctx.font = `600 ${Math.round(4.5 * u)}px Inter, system-ui, sans-serif`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText(ellipsis(ctx, city && city.trim() ? city.trim() : schoolName, Math.round(52 * u)), Math.round(8 * u), footerY + footerH / 2)
  ctx.textAlign = 'right'
  ctx.fillText(academicYear ? `T.A. ${academicYear}` : appName, sigRight, footerY + footerH / 2)

  ctx.strokeStyle = hairline
  ctx.lineWidth = 2
  rr(ctx, 1, 1, w - 2, h - 2, R)
  ctx.stroke()
}

export async function downloadIdCard(student: Student, fileName?: string): Promise<void> {
  const settings = await fetchSchoolSettings().catch(() => null)
  const { branding, logoSrc } = resolveCardBranding(settings)
  const logoImg = await loadImage(logoSrc)

  const canvas = document.createElement('canvas')
  canvas.width = CARD_W * DPR
  canvas.height = CARD_H * DPR
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Browser tidak mendukung unduh gambar.')
  ctx.scale(DPR, DPR)

  drawIdCard(ctx, mapStudentToCard(student), CARD_W, CARD_H, { ...branding, logoEl: logoImg })

  const slug = ((fileName || (student.profiles?.full_name as string) || 'kartu').toString()
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'kartu')
  saveBlob(await canvasToBlob(canvas), `kartu-${slug}.png`)
}

export async function generateIdCardPreviewDataURL(student: Student): Promise<string> {
  const settings = await fetchSchoolSettings().catch(() => null)
  const { branding, logoSrc } = resolveCardBranding(settings)
  const logoImg = await loadImage(logoSrc)

  const previewW = CARD_W * 3
  const previewH = CARD_H * 3
  const canvas = document.createElement('canvas')
  canvas.width = previewW
  canvas.height = previewH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Browser tidak mendukung pratinjau.')
  ctx.scale(3, 3)
  drawIdCard(ctx, mapStudentToCard(student), CARD_W, CARD_H, { ...branding, logoEl: logoImg })
  try {
    return canvas.toDataURL('image/png')
  } catch {
    throw new Error('Gagal membuat pratinjau kartu. Coba lagi.')
  }
}

export async function generateIdCardPrintDataURLs(students: Student[]): Promise<string[]> {
  if (students.length === 0) throw new Error('Tidak ada data siswa untuk dicetak.')
  const settings = await fetchSchoolSettings().catch(() => null)
  const { branding, logoSrc } = resolveCardBranding(settings)
  const logoImg = await loadImage(logoSrc)

  const urls: string[] = []
  for (let i = 0; i < students.length; i++) {
    const canvas = document.createElement('canvas')
    canvas.width = CARD_W
    canvas.height = CARD_H
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Browser tidak mendukung cetak kartu.')
    drawIdCard(ctx, mapStudentToCard(students[i]), CARD_W, CARD_H, { ...branding, logoEl: logoImg })
    try {
      urls.push(canvas.toDataURL('image/png'))
    } catch {
      throw new Error('Gagal menyiapkan kartu untuk dicetak. Coba lagi.')
    }
    if (i % 25 === 24) await new Promise((resolve) => window.setTimeout(resolve, 0))
  }
  return urls
}
