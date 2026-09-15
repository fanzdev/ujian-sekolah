import { fetchSchoolSettings } from './settings.service'
import { getDefaultLogo, resolveLogoUrl, sanitizeLogoUrl } from '@/lib/logo'

export interface Top3Row {
  rank: number
  student_name: string
  nis: string | null
  class_name: string | null
  final_score: number | null
}

const W = 1080
const H = 1350

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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
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
    img.onload = () => {
      window.clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      window.clearTimeout(timer)
      resolve(null)
    }
    img.src = src
  })
}

function drawMedal(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, rank: number): void {
  const fills = ['#F59E0B', '#94A3B8', '#D97706']
  const fill = fills[Math.min(Math.max(rank - 1, 0), 2)]
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = 6
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.font = `800 ${Math.round(radius * 1.05)}px Inter, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(rank), cx, cy + 2)
  ctx.restore()
}

export async function downloadTop3Image(input: {
  examTitle: string
  classLabel: string
  rows: Top3Row[]
  fileName?: string
}): Promise<void> {
  const settings = await fetchSchoolSettings().catch(() => null)
  const primary = settings?.primary_color && /^#[0-9a-fA-F]{6}$/.test(settings.primary_color) ? settings.primary_color : '#0D868F'
  const secondary = settings?.secondary_color && /^#[0-9a-fA-F]{6}$/.test(settings.secondary_color) ? settings.secondary_color : '#2DD4BF'
  const schoolName = settings?.school_name || 'SMK AL-FATA'
  const appName = settings?.app_name || 'Veyra CBT'
  const logoSrc = settings && sanitizeLogoUrl(settings.logo_url) ? resolveLogoUrl(settings.logo_url) : getDefaultLogo()

  const top = [...input.rows]
    .sort((a, b) => Number(b.final_score ?? 0) - Number(a.final_score ?? 0))
    .slice(0, 3)
  if (top.length === 0) throw new Error('Belum ada data peringkat untuk diunduh.')

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Browser tidak mendukung unduh gambar.')

  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, shade(secondary, -0.25))
  bg.addColorStop(0.45, primary)
  bg.addColorStop(1, shade(primary, -0.55))
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  ctx.save()
  ctx.globalAlpha = 0.08
  ctx.fillStyle = '#ffffff'
  for (let y = 40; y < H; y += 56) {
    for (let x = 24; x < W; x += 56) {
      ctx.beginPath()
      ctx.arc(x, y, 2.4, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()

  ctx.fillStyle = 'rgba(255,255,255,0.10)'
  ctx.beginPath()
  ctx.arc(940, 120, 220, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.07)'
  ctx.beginPath()
  ctx.arc(120, 1180, 260, 0, Math.PI * 2)
  ctx.fill()

  const logo = await loadImage(logoSrc)
  const logoSize = 120
  const logoX = (W - logoSize) / 2
  ctx.save()
  roundRect(ctx, logoX, 84, logoSize, logoSize, 30)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  if (logo) {
    const pad = 16
    const iw = logoSize - pad * 2
    const ih = (logo.height / Math.max(logo.width, 1)) * iw
    const dh = Math.min(ih, iw)
    ctx.save()
    roundRect(ctx, logoX, 84, logoSize, logoSize, 30)
    ctx.clip()
    ctx.drawImage(logo, logoX + pad, 84 + (logoSize - dh) / 2, iw, dh)
    ctx.restore()
  } else {
    ctx.fillStyle = primary
    ctx.font = '800 44px Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(appName.slice(0, 2).toUpperCase(), W / 2, 84 + logoSize / 2)
  }
  ctx.restore()

  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = '700 30px Inter, system-ui, sans-serif'
  ctx.fillText(schoolName.toUpperCase(), W / 2, 262)
  ctx.fillStyle = '#ffffff'
  ctx.font = '800 62px Inter, system-ui, sans-serif'
  ctx.fillText('TOP 3 PERINGKAT', W / 2, 330)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.font = '600 34px Inter, system-ui, sans-serif'
  ctx.fillText(ellipsis(ctx, input.examTitle, W - 160), W / 2, 382)
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.font = '500 28px Inter, system-ui, sans-serif'
  ctx.fillText(input.classLabel, W / 2, 424)

  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(W / 2 - 160, 458)
  ctx.lineTo(W / 2 + 160, 458)
  ctx.stroke()

  const order = [top[1], top[0], top[2]].filter(Boolean) as Top3Row[]
  const cardW = 300
  const gap = 28
  const totalW = order.length * cardW + (order.length - 1) * gap
  let cx = (W - totalW) / 2
  const baseY = 520
  order.forEach((row) => {
    const isFirst = row.rank === 1
    const cardH = isFirst ? 560 : 480
    const cy = isFirst ? baseY : baseY + 80
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.30)'
    ctx.shadowBlur = 40
    ctx.shadowOffsetY = 18
    roundRect(ctx, cx, cy, cardW, cardH, 32)
    ctx.fillStyle = 'rgba(255,255,255,0.96)'
    ctx.fill()
    ctx.restore()

    drawMedal(ctx, cx + cardW / 2, cy + (isFirst ? 96 : 88), isFirst ? 56 : 48, row.rank)

    ctx.textAlign = 'center'
    ctx.fillStyle = '#0f172a'
    ctx.font = `800 ${isFirst ? 40 : 34}px Inter, system-ui, sans-serif`
    const nameLines = splitName(ctx, row.student_name, cardW - 56, isFirst ? 2 : 2)
    nameLines.forEach((line, i) => {
      ctx.fillText(line, cx + cardW / 2, cy + (isFirst ? 200 : 182) + i * (isFirst ? 48 : 42))
    })
    const metaY = cy + (isFirst ? 200 : 182) + nameLines.length * (isFirst ? 48 : 42) + 6
    ctx.fillStyle = '#64748b'
    ctx.font = '500 25px Inter, system-ui, sans-serif'
    ctx.fillText(ellipsis(ctx, `NIS ${row.nis ?? '-'}`, cardW - 56), cx + cardW / 2, metaY)
    ctx.fillText(ellipsis(ctx, row.class_name ?? 'Tanpa kelas', cardW - 56), cx + cardW / 2, metaY + 36)

    ctx.fillStyle = primary
    ctx.font = `800 ${isFirst ? 84 : 68}px Inter, system-ui, sans-serif`
    ctx.fillText(formatScore(row.final_score), cx + cardW / 2, cy + cardH - (isFirst ? 78 : 66))
    ctx.fillStyle = '#94a3b8'
    ctx.font = '600 24px Inter, system-ui, sans-serif'
    ctx.fillText('skala 0–100', cx + cardW / 2, cy + cardH - (isFirst ? 40 : 32))

    cx += cardW + gap
  })

  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.font = '500 26px Inter, system-ui, sans-serif'
  const today = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date())
  ctx.fillText(`${appName} · ${today}`, W / 2, H - 64)

  const url = canvas.toDataURL('image/png')
  const a = document.createElement('a')
  const slug = (input.fileName || input.examTitle).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'peringkat'
  a.href = url
  a.download = `top3-${slug}.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function splitName(ctx: CanvasRenderingContext2D, name: string, maxWidth: number, maxLines: number): string[] {
  const words = name.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word
    if (ctx.measureText(trial).width <= maxWidth) {
      current = trial
    } else {
      if (current) lines.push(current)
      current = word
      if (lines.length >= maxLines) break
    }
  }
  if (current && lines.length < maxLines) lines.push(current)
  if (lines.length > 0) lines[lines.length - 1] = ellipsis(ctx, lines[lines.length - 1], maxWidth)
  return lines.length > 0 ? lines : [ellipsis(ctx, name, maxWidth)]
}

function formatScore(score: number | null): string {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return '-'
  const n = Number(score)
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10)
}
