export type Theme = 'light'

function getBrandingPrimary(): string {
  try {
    const raw = localStorage.getItem('cbt-branding')
    if (raw) {
      const b = JSON.parse(raw) as { primary_color?: string }
      if (b.primary_color && /^#[0-9a-fA-F]{6}$/.test(b.primary_color)) return b.primary_color
    }
  } catch { void 0 }
  return '#0D868F'
}

function applyLight(): void {
  const root = document.documentElement
  root.classList.remove('dark')
  root.style.colorScheme = 'light'
  root.style.removeProperty('--app-dark-bg')
  root.style.removeProperty('--app-dark-bg-soft')
  document.body.style.backgroundColor = ''
  try { localStorage.setItem('cbt-theme', 'light') } catch { void 0 }
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) {
    const primary = getBrandingPrimary()
    meta.content = primary || '#0D868F'
  }
}

export function syncThemeColorFromBranding(primaryColor: string): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta && /^#[0-9a-fA-F]{6}$/.test(primaryColor)) meta.content = primaryColor
}

export function initThemeEarly(): void {
  applyLight()
}

export function useTheme(): { theme: Theme; toggle: () => void; set: (t: Theme) => void } {
  return { theme: 'light', toggle: () => undefined, set: () => undefined }
}
