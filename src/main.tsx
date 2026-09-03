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
          localStorage.setItem('cbt-branding', JSON.stringify({ app_name: s.app_name, school_name: s.school_name, logo_url: s.logo_url, primary_color: s.primary_color, secondary_color: s.secondary_color }))
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
    if (el) {
      el.style.opacity = '0'
      el.style.pointerEvents = 'none'
      window.setTimeout(() => el.remove(), 700)
    }
    const minMs = 1100
    const start = Date.now()
    const hide = () => {
      const elapsed = Date.now() - start
      const remain = Math.max(0, minMs - elapsed)
      window.setTimeout(() => setSplashVisible(false), remain)
    }
    if (document.readyState === 'complete') hide()
    else window.addEventListener('load', hide, { once: true })
    const fallback = window.setTimeout(() => setSplashVisible(false), minMs + 1200)
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
