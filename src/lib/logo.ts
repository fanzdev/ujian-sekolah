export function getDefaultLogo(): string {
  if (typeof window !== 'undefined') {
    const p = window.location.pathname
    if (p.startsWith('/ujian/')) return '/ujian/logo.webp'
    if (import.meta.env.BASE_URL === '/ujian/' && p === '/ujian') return '/ujian/logo.webp'
  }
  return `${import.meta.env.BASE_URL}logo.webp`
}

export function sanitizeLogoUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null
  const s = url.trim()
  if (!s) return null
  if (s.includes('vcbt')) return null
  if (s.includes('logo.svg') || s.includes('favicon.svg')) return null
  return s
}

export function resolveLogoUrl(url: string | null | undefined): string {
  const fallback = getDefaultLogo()
  const clean = sanitizeLogoUrl(url)
  if (!clean) return fallback
  if (/^https?:\/\//i.test(clean) || /^data:/i.test(clean) || /^blob:/i.test(clean)) return clean
  const normalized = clean.replace(/^\.\//, '/')
  if (
    normalized === '/logo.webp' ||
    normalized === 'logo.webp' ||
    normalized === '/ujian/logo.webp' ||
    normalized === 'ujian/logo.webp'
  ) {
    return fallback
  }
  if (fallback !== '/logo.webp' && normalized === '/logo.webp') return fallback
  if (fallback === '/logo.webp' && normalized === '/ujian/logo.webp') return fallback
  return clean
}
