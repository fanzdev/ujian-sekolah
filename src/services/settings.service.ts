import { supabase } from './client'
import type { SchoolSettings, SystemSettingsMap } from '@/types/models'
import { getDefaultLogo, resolveLogoUrl, sanitizeLogoUrl } from '@/lib/logo'
import { findPreset } from '@/lib/themePresets'

export async function fetchSchoolSettings(): Promise<SchoolSettings> {
  const { data, error } = await supabase
    .from('school_settings')
    .select('*')
    .eq('id', true)
    .maybeSingle()
  if (error) throw error
  const normalized = data as SchoolSettings | null
  if (normalized && !Array.isArray((normalized as unknown as { extra_colors?: unknown }).extra_colors)) {
    ;(normalized as unknown as { extra_colors: string[] }).extra_colors = []
  }
  return (
    normalized ?? {
      app_name: 'Veyra CBT',
      school_name: 'SMK AL-FATA',
      logo_url: getDefaultLogo(),
      favicon_url: getDefaultLogo(),
      primary_color: '#0D868F',
      secondary_color: '#0CBCC9',
      extra_colors: [],
      theme_preset: 'bengkel-presisi',
      address: null,
      city: null,
      headmaster: null,
      academic_year: null,
      semester: null,
    }
  )
}

export async function updateSchoolSettings(fields: Partial<SchoolSettings>): Promise<SchoolSettings> {
  const { data, error } = await supabase
    .from('school_settings')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', true)
    .select()
    .single()
  if (error) throw error
  void import('./audit.service').then((m) => m.logAudit('CHANGE_SETTINGS', 'school_settings'))
  return data as SchoolSettings
}

export async function fetchSystemSettings(): Promise<Partial<SystemSettingsMap>> {
  const { data, error } = await supabase.from('system_settings').select('key, value')
  if (error) throw error
  const map: Record<string, unknown> = {}
  for (const row of data ?? []) map[row.key] = row.value
  return map as Partial<SystemSettingsMap>
}

export async function upsertSystemSetting(key: string, value: Record<string, unknown>): Promise<void> {
  const { error } = await supabase
    .from('system_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw error
  void import('./audit.service').then((m) => m.logAudit('CHANGE_SETTINGS', 'system_setting', key))
}

const RGB_CACHE: Record<string, string> = {}

export function hexToRgbTriplet(hex: string): string {
  if (RGB_CACHE[hex]) return RGB_CACHE[hex]
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return '13 134 143'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const triplet = `${r} ${g} ${b}`
  RGB_CACHE[hex] = triplet
  return triplet
}

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let hh = 0
  let ss = 0
  const ll = (max + min) / 2
  if (max !== min) {
    const d = max - min
    ss = ll > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: hh = (g - b) / d + (g < b ? 6 : 0); break
      case g: hh = (b - r) / d + 2; break
      case b: hh = (r - g) / d + 4; break
    }
    hh /= 6
  }
  return { h: hh * 360, s: ss * 100, l: ll * 100 }
}

function hslToHex(h: number, s: number, l: number): string {
  const hh = h / 360
  const ss = s / 100
  const ll = l / 100
  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  let r: number, g: number, b: number
  if (ss === 0) {
    r = g = b = ll
  } else {
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss
    const p = 2 * ll - q
    r = hue2rgb(p, q, hh + 1 / 3)
    g = hue2rgb(p, q, hh)
    b = hue2rgb(p, q, hh - 1 / 3)
  }
  const toHex = (x: number): string => {
    const v = Math.round(x * 255).toString(16)
    return v.length === 1 ? '0' + v : v
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function darkenColor(hex: string, amount = 0.62): string {
  const hsl = hexToHsl(hex)
  if (!hsl) return '#0B1E24'
  const l = Math.max(6, hsl.l * (1 - amount))
  const s = Math.min(100, hsl.s * 0.9 + 10)
  return hslToHex(hsl.h, s, l)
}

export function applyBranding(settings: SchoolSettings): void {
  const root = document.documentElement.style
  const html = document.documentElement
  html.classList.remove('dark')
  html.style.colorScheme = 'light'
  root.removeProperty('--app-dark-bg')
  root.removeProperty('--app-dark-bg-soft')
  document.body.style.backgroundColor = ''
  try { localStorage.setItem('cbt-theme', 'light') } catch { void 0 }

  const preset = findPreset((settings as unknown as { theme_preset?: string | null }).theme_preset)
  const effectivePrimary = preset ? preset.primary : settings.primary_color
  const effectiveSecondary = preset ? preset.secondary : settings.secondary_color

  if (effectivePrimary && /^#/.test(effectivePrimary)) {
    const t = hexToRgbTriplet(effectivePrimary)
    for (let shade = 50; shade <= 900; shade += 1) {
      const factor = ({ 50: 0.95, 100: 0.88, 200: 0.75, 300: 0.55, 400: 0.3, 500: 0.1, 600: 0, 700: -0.12, 800: -0.24, 900: -0.36 } as Record<number, number>)[shade]!
      const [r, g, b] = t.split(' ').map(Number)
      const mix = (c: number): number =>
        Math.round(factor >= 0 ? c + (255 - c) * factor : c * (1 + factor))
      root.setProperty(`--c-primary-${shade}`, `${mix(r)} ${mix(g)} ${mix(b)}`)
    }
  }
  if (effectiveSecondary) {
    const t = hexToRgbTriplet(effectiveSecondary)
    root.setProperty('--c-accent-600', t)
    root.setProperty('--c-accent-50', `rgb(${t.split(' ').map((n) => Math.min(255, Number(n) + 230)).join(' ')})`)
  }

  const palette = [effectivePrimary, effectiveSecondary, ...((settings.extra_colors ?? []) as string[])]
    .filter((c): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c))
  let gradientStyle = document.getElementById('branding-gradient-style') as HTMLStyleElement | null
  if (palette.length > 1) {
    const gradient = `linear-gradient(135deg, ${palette.join(', ')})`
    root.setProperty('--app-gradient', gradient)
    html.setAttribute('data-gradient', 'true')
    if (!gradientStyle) {
      gradientStyle = document.createElement('style')
      gradientStyle.id = 'branding-gradient-style'
      document.head.appendChild(gradientStyle)
    }
    gradientStyle.textContent = `
      .btn-gradient, html[data-gradient="true"] .bg-primary-600 { background: var(--app-gradient) !important; border-color: transparent !important; }
      html[data-gradient="true"] .bg-primary-50 { background: linear-gradient(135deg, color-mix(in srgb, ${palette[0]} 12%, white), color-mix(in srgb, ${palette[1] ?? palette[0]} 12%, white)) !important; }
      html[data-gradient="true"] header { background: color-mix(in srgb, var(--app-gradient) 8%, white) !important; }
      html.dark[data-gradient="true"] header { background: color-mix(in srgb, var(--app-gradient) 18%, #0f172a) !important; }
      html[data-gradient="true"] .nav-item-active { background: var(--app-gradient) !important; color: white !important; }
      html[data-gradient="true"] .nav-item-active svg { color: white !important; }
    `
  } else {
    root.removeProperty('--app-gradient')
    html.removeAttribute('data-gradient')
    if (gradientStyle) gradientStyle.remove()
  }

  document.title = settings.app_name || 'Veyra CBT'

  const cleanLogo = resolveLogoUrl(settings.logo_url)
  const cleanFavicon = sanitizeLogoUrl(settings.favicon_url) ? resolveLogoUrl(settings.favicon_url) : cleanLogo

  let faviconLink = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
  if (!faviconLink) {
    faviconLink = document.createElement('link')
    faviconLink.rel = 'icon'
    document.head.appendChild(faviconLink)
  }
  faviconLink.href = cleanFavicon

  const metaTheme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (metaTheme && effectivePrimary && /^#[0-9a-fA-F]{6}$/.test(effectivePrimary)) {
    metaTheme.content = effectivePrimary
  }

  try {
    const raw = localStorage.getItem('cbt-branding')
    const prev = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    const fallbackLogo2 = getDefaultLogo()
    localStorage.setItem(
      'cbt-branding',
      JSON.stringify({
        ...prev,
        app_name: settings.app_name,
        school_name: settings.school_name,
        logo_url: sanitizeLogoUrl(settings.logo_url) ? resolveLogoUrl(settings.logo_url) : fallbackLogo2,
        primary_color: effectivePrimary,
        secondary_color: effectiveSecondary,
        theme_preset: (settings as unknown as { theme_preset?: string | null }).theme_preset ?? null,
      }),
    )
  } catch {
    /* storage blocked */
  }
}
