import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  title?: string
  ariaLabel?: string
}

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export function Modal({ open, onClose, children, size = 'md', title, ariaLabel }: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title}
    >
      <button
        aria-label="Tutup dialog"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in"
      />
      <div
        ref={contentRef}
        className={cn(
          'relative max-h-[92dvh] w-full overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:rounded-2xl animate-scale-in flex flex-col dark:bg-slate-900',
          SIZES[size],
        )}
      >
          <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700 sm:hidden" aria-hidden />
        {title !== undefined && (
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700 sm:px-6">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Tutup"
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="overflow-y-auto scrollbar-thin">{children}</div>
      </div>
    </div>
  )
}
