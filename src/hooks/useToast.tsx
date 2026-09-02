import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastItem {
  id: number
  type: ToastType
  message: string
}

interface ToastState {
  toast: (type: ToastType, message: string) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
  warning: (message: string) => void
}

const ToastContext = createContext<ToastState>({
  toast: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
  warning: () => {},
})

const ICONS: Record<ToastType, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: TriangleAlert,
}

const STYLES: Record<ToastType, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
  info: 'border-sky-200 bg-sky-50 text-sky-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
}

const ICON_COLORS: Record<ToastType, string> = {
  success: 'text-emerald-500',
  error: 'text-rose-500',
  info: 'text-sky-500',
  warning: 'text-amber-500',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (type: ToastType, message: string) => {
      const id = ++idRef.current
      setItems((prev) => [...prev.slice(-4), { id, type, message }])
      window.setTimeout(() => remove(id), type === 'error' ? 6000 : 4000)
    },
    [remove],
  )

  const api = {
    toast,
    success: (m: string) => toast('success', m),
    error: (m: string) => toast('error', m),
    info: (m: string) => toast('info', m),
    warning: (m: string) => toast('warning', m),
  } satisfies ToastState

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {items.map((item) => {
          const Icon = ICONS[item.type]
          return (
            <div
              key={item.id}
              role="alert"
              className={cn(
                'pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-lg backdrop-blur animate-slide-in-right',
                STYLES[item.type],
              )}
            >
              <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', ICON_COLORS[item.type])} />
              <p className="flex-1 text-sm font-medium leading-snug">{item.message}</p>
              <button
                onClick={() => remove(item.id)}
                aria-label="Tutup notifikasi"
                className="rounded-md p-0.5 opacity-60 transition-opacity hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastState {
  return useContext(ToastContext)
}
