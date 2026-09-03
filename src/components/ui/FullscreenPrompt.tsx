import { useState, useEffect, useCallback } from 'react'
import { Maximize } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { UserRole } from '@/types/models'

function getFullscreenElement(): Element | null {
  return document.fullscreenElement || ((document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement ?? null)
}

function requestFs(): Promise<void> | void {
  const el = document.documentElement
  const rfs = el.requestFullscreen || (el as unknown as { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen
  if (rfs) return rfs.call(el)
}

export function FullscreenPrompt({ role }: { role: UserRole }) {
  const [show, setShow] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const enterFs = useCallback(() => {
    const p = requestFs()
    if (p && typeof p.catch === 'function') {
      p.catch(() => {})
    }
    setShow(false)
  }, [])

  const dismiss = useCallback(() => {
    setDismissed(true)
    setShow(false)
  }, [])

  useEffect(() => {
    if (role !== 'student') return

    const check = () => {
      if (!getFullscreenElement()) {
        setShow(true)
      } else {
        setShow(false)
      }
    }

    check()

    const onFsChange = () => {
      if (getFullscreenElement()) {
        setShow(false)
        setDismissed(false)
      } else {
        setShow(true)
      }
    }

    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)

    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange)
    }
  }, [role])

  if (role !== 'student' || !show || dismissed) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="mx-4 w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-2xl dark:bg-slate-900 animate-scale-in">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-white">
          <Maximize className="h-6 w-6" />
        </div>
        <h2 className="mt-3 text-base font-bold text-slate-900 dark:text-slate-100">Mode Layar Penuh</h2>
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          Aktifkan layar penuh untuk pengalaman ujian yang lebih fokus.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button size="sm" onClick={enterFs} icon={<Maximize className="h-4 w-4" />}>
            Aktifkan
          </Button>
          <Button size="sm" variant="ghost" onClick={dismiss}>
            Nanti Saja
          </Button>
        </div>
      </div>
    </div>
  )
}
