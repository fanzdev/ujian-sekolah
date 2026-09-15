import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './index.css'
import { AppRoutes } from './routes'
import { AuthProvider } from './hooks/useAuth'
import { ToastProvider } from './hooks/useToast'
import { ConfirmProvider } from './hooks/useConfirm'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { SplashScreen } from './components/ui/SplashScreen'
import { fetchSchoolSettings, applyBranding } from './services/settings.service'
import { initThemeEarly } from './hooks/useTheme'
import { getDefaultLogo, resolveLogoUrl, sanitizeLogoUrl } from './lib/logo'

initThemeEarly()

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined)
  })
}

function BrandingBoot({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const configured = Boolean(
      import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
    )
    if (!configured) return
    fetchSchoolSettings()
      .then((s) => {
        applyBranding(s)
        try {
          const cleanLogo = sanitizeLogoUrl(s.logo_url) ? resolveLogoUrl(s.logo_url) : getDefaultLogo()
          localStorage.setItem('cbt-branding', JSON.stringify({ app_name: s.app_name, school_name: s.school_name, logo_url: cleanLogo, primary_color: s.primary_color, secondary_color: s.secondary_color, login_color: (s as unknown as { login_color?: string }).login_color ?? '#0B1E24', sidebar_color: (s as unknown as { sidebar_color?: string }).sidebar_color ?? '#0D868F', app_bg_color: (s as unknown as { app_bg_color?: string }).app_bg_color ?? '#EDEDED', splash_bg_color: (s as unknown as { splash_bg_color?: string }).splash_bg_color ?? '#064247', extra_colors: (s as unknown as { extra_colors?: string[] }).extra_colors ?? [], card_gradients: (s as unknown as { card_gradients?: unknown }).card_gradients ?? {}, theme_preset: (s as unknown as { theme_preset?: string | null }).theme_preset ?? null }))
          if (s.app_name) document.title = s.app_name
          const metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]')
          if (metaDesc && s.school_name) metaDesc.content = `${s.school_name} - ${s.app_name} CBT`
        } catch (e: unknown) { void e }
      })
      .catch(() => undefined)
  }, [])
  return <>{children}</>
}

function AppShell() {
  const [splashVisible, setSplashVisible] = useState(true)
  useEffect(() => {
    const el = document.getElementById('static-splash')
    const minMs = 1100
    const start = Date.now()
    const fadeOutStatic = () => {
      if (el) {
        el.style.opacity = '0'
      el.style.pointerEvents = 'none'
        window.setTimeout(() => el.remove(), 700)
      }
    }
    const hide = () => {
      const elapsed = Date.now() - start
      const remain = Math.max(0, minMs - elapsed)
      window.setTimeout(() => setSplashVisible(false), remain)
    }
    const logoUrl = getDefaultLogo()
    const img = new Image()
    let settled = false
    const onLogoReady = () => {
      if (settled) return
      settled = true
      fadeOutStatic()
      if (document.readyState === 'complete') hide()
      else window.addEventListener('load', hide, { once: true })
    }
    img.onload = onLogoReady
    img.onerror = onLogoReady
    img.src = logoUrl
    const fallback = window.setTimeout(() => { if (!settled) { settled = true; fadeOutStatic(); hide() } }, minMs + 1200)
    return () => {
      window.clearTimeout(fallback)
      window.removeEventListener('load', hide)
    }
  }, [])
  return (
    <>
      <SplashScreen visible={splashVisible} />
      <AppRoutes />
    </>
  )
}

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element tidak ditemukan')

createRoot(rootEl).render(
  <AppErrorBoundary>
    <ToastProvider>
      <AuthProvider>
        <ConfirmProvider>
          <BrandingBoot>
            <AppShell />
          </BrandingBoot>
        </ConfirmProvider>
      </AuthProvider>
    </ToastProvider>
  </AppErrorBoundary>,
)
