import { createContext, useCallback, useContext, useRef, useState, type ReactNode, type TouchEvent as RCTouchEvent } from 'react'
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

const ICON_COLORS: Record<ToastType, string> = {
  success: 'text-emerald-500',
  error: 'text-rose-500',
  info: 'text-sky-500',
  warning: 'text-amber-500',
}

const BG_COLORS: Record<ToastType, string> = {
  success: 'bg-emerald-500/10',
  error: 'bg-rose-500/10',
  info: 'bg-sky-500/10',
  warning: 'bg-amber-500/10',
}

const BAR_COLORS: Record<ToastType, string> = {
  success: 'bg-emerald-500',
  error: 'bg-rose-500',
  info: 'bg-sky-500',
  warning: 'bg-amber-500',
}

function SwipeableToast({ item, onRemove }: { item: ToastItem; onRemove: (id: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; currentX: number } | null>(null)

  const handleTouchStart = (e: RCTouchEvent) => {
    dragRef.current = { startX: e.touches[0].clientX, currentX: 0 }
  }

  const handleTouchMove = (e: RCTouchEvent) => {
    if (!dragRef.current || !ref.current) return
    const dx = e.touches[0].clientX - dragRef.current.startX
    dragRef.current.currentX = dx
    const opacity = Math.max(0, 1 - Math.abs(dx) / 150)
    ref.current.style.transform = `translateX(${dx}px)`
    ref.current.style.opacity = String(opacity)
  }

  const handleTouchEnd = () => {
    if (!dragRef.current || !ref.current) return
    const dx = dragRef.current.currentX
    if (Math.abs(dx) > 80) {
      ref.current.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out'
      ref.current.style.transform = `translateX(${dx > 0 ? 300 : -300}px)`
      ref.current.style.opacity = '0'
      window.setTimeout(() => onRemove(item.id), 200)
    } else if (ref.current) {
      ref.current.style.transition = 'transform 0.25s ease-out, opacity 0.25s ease-out'
      ref.current.style.transform = 'translateX(0)'
      ref.current.style.opacity = '1'
      window.setTimeout(() => { if (ref.current) ref.current.style.transition = '' }, 250)
    }
    dragRef.current = null
  }

  const Icon = ICONS[item.type]
  const duration = item.type === 'error' ? 6000 : 4000

  return (
    <div
      ref={ref}
      role="alert"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={cn(
        'pointer-events-auto relative overflow-hidden rounded-2xl border border-white/60 bg-white shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl animate-slide-in-top sm:animate-slide-in-right dark:bg-[#0F1D24] dark:border-white/8',
      )}
    >
      <div className="flex items-center gap-3 p-3.5 sm:p-4">
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', BG_COLORS[item.type], ICON_COLORS[item.type])}>
          <Icon className="h-4.5 w-4.5" />
        </span>
        <p className="flex-1 text-[13px] font-medium leading-snug text-slate-700 dark:text-slate-200">{item.message}</p>
        <button
          onClick={() => onRemove(item.id)}
          aria-label="Tutup notifikasi"
          className="hidden sm:flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:text-slate-500"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="h-[3px] w-full bg-slate-100 dark:bg-white/5">
        <div
          className={cn('h-full rounded-full', BAR_COLORS[item.type])}
          style={{ animation: `toastProgress ${duration}ms linear forwards` }}
        />
      </div>
    </div>
  )
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
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-3 sm:items-end sm:px-4"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}
      >
        <div className="hidden h-[56px] w-full shrink-0 sm:block lg:h-16" aria-hidden />
        <div className="flex w-full max-w-sm flex-col gap-2">
          {items.map((item) => (
            <SwipeableToast key={item.id} item={item} onRemove={remove} />
          ))}
        </div>
      </div>
      <style>{`@keyframes toastProgress{from{width:100%}to{width:0%}}`}</style>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastState {
  return useContext(ToastContext)
}
