import { supabase } from './client'
import type { SchoolSettings, SystemSettingsMap } from '@/types/models'

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
      app_name: 'SMK AL-FATA CBT',
      school_name: 'SMK AL-FATA',
      logo_url: null,
      favicon_url: null,
      primary_color: '#2563eb',
      secondary_color: '#0ea5e9',
      extra_colors: [],
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
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return '37 99 235'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const triplet = `${r} ${g} ${b}`
  RGB_CACHE[hex] = triplet
  return triplet
}

export function applyBranding(settings: SchoolSettings): void {
  const root = document.documentElement.style
  const html = document.documentElement

  if (settings.primary_color && /^#/.test(settings.primary_color)) {
    const t = hexToRgbTriplet(settings.primary_color)
    for (let shade = 50; shade <= 900; shade += 1) {
      const factor = ({ 50: 0.95, 100: 0.88, 200: 0.75, 300: 0.55, 400: 0.3, 500: 0.1, 600: 0, 700: -0.12, 800: -0.24, 900: -0.36 } as Record<number, number>)[shade]!
      const [r, g, b] = t.split(' ').map(Number)
      const mix = (c: number): number =>
        Math.round(factor >= 0 ? c + (255 - c) * factor : c * (1 + factor))
      root.setProperty(`--c-primary-${shade}`, `${mix(r)} ${mix(g)} ${mix(b)}`)
    }
  }
  if (settings.secondary_color) {
    const t = hexToRgbTriplet(settings.secondary_color)
    root.setProperty('--c-accent-600', t)
    root.setProperty('--c-accent-50', `rgb(${t.split(' ').map((n) => Math.min(255, Number(n) + 230)).join(' ')})`)
  }

  const palette = [settings.primary_color, settings.secondary_color, ...((settings.extra_colors ?? []) as string[])]
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

  document.title = settings.app_name || 'SMK AL-FATA CBT'

  let faviconLink = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
  if (!faviconLink) {
    faviconLink = document.createElement('link')
    faviconLink.rel = 'icon'
    document.head.appendChild(faviconLink)
  }
  faviconLink.href = settings.favicon_url || settings.logo_url || `${import.meta.env.BASE_URL}favicon.svg`
}
