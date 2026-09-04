import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'cbt-theme'

function getStored(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* storage blocked */
  }
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

function getBrandingPrimary(): string | null {
  try {
    const raw = localStorage.getItem('cbt-branding')
    if (raw) {
      const b = JSON.parse(raw) as { primary_color?: string }
      if (b.primary_color && /^#[0-9a-fA-F]{6}$/.test(b.primary_color)) return b.primary_color
    }
  } catch {
    /* parse blocked */
  }
  return null
}

function apply(theme: Theme): void {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) {
    const branding = getBrandingPrimary()
    if (branding) meta.content = branding
    else meta.content = theme === 'dark' ? '#020617' : '#2563eb'
  }
}

export function syncThemeColorFromBranding(primaryColor: string): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta && /^#[0-9a-fA-F]{6}$/.test(primaryColor)) meta.content = primaryColor
}

/** Terapkan tema sebelum paint pertama (dipanggil dari main.tsx). */
export function initThemeEarly(): void {
  apply(getStored())
}

export function useTheme(): { theme: Theme; toggle: () => void; set: (t: Theme) => void } {
  const [theme, setTheme] = useState<Theme>(getStored)

  useEffect(() => {
    apply(theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* storage blocked */
    }
  }, [theme])

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])
  return { theme, toggle, set: setTheme }
}
