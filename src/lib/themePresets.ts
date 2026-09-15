export interface ThemePreset {
  id: string
  label: string
  description: string
  primary: string
  secondary: string
  extra?: string[]
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'bengkel-presisi',
    label: 'Teal Lembut',
    description: 'Teal bergradasi lembut — default aplikasi',
    primary: '#0D868F',
    secondary: '#2DD4BF',
  },
  {
    id: 'veyra-midnight',
    label: 'Veyra Midnight',
    description: 'Ink pekat + Amber — malam fokus',
    primary: '#0B3D4F',
    secondary: '#E8B86A',
  },
  {
    id: 'kertas-blueprint',
    label: 'Kertas Blueprint',
    description: 'Paper hangat + garis teknik',
    primary: '#1A6B7A',
    secondary: '#8EA7AD',
  },
  {
    id: 'graphite-slate',
    label: 'Graphite',
    description: 'Slate netral + Teal — minimal elegan',
    primary: '#334155',
    secondary: '#0D868F',
  },
]

export function findPreset(id: string | null | undefined): ThemePreset | null {
  if (!id) return null
  return THEME_PRESETS.find((p) => p.id === id) ?? null
}

export function getPresetOrFallback(id: string | null | undefined, primary: string | null | undefined, secondary: string | null | undefined): ThemePreset {
  const found = findPreset(id)
  if (found) return found
  return {
    id: 'custom',
    label: 'Kustom',
    description: 'Warna pilihan admin',
    primary: primary && /^#[0-9a-fA-F]{6}$/.test(primary) ? primary : '#0D868F',
    secondary: secondary && /^#[0-9a-fA-F]{6}$/.test(secondary) ? secondary : '#2DD4BF',
  }
}

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function luminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const l1 = luminance(a)
  const l2 = luminance(b)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

export function isContrastOk(fg: string, bg: string, min = 4.5): boolean {
  return contrastRatio(fg, bg) >= min
}

export function suggestSecondary(primary: string): string {
  const map: Record<string, string> = {
    '#0D868F': '#2DD4BF',
    '#0B3D4F': '#E8B86A',
    '#1A6B7A': '#8EA7AD',
    '#334155': '#0D868F',
  }
  if (map[primary.toUpperCase()]) return map[primary.toUpperCase()]
  return '#2DD4BF'
}
