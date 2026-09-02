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
      .then(applyBranding)
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
