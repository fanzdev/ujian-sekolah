import { createContext, useContext, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

export interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

interface ConfirmState {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmState>({ confirm: async () => false })

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const [resolver, setResolver] = useState<((v: boolean) => void) | null>(null)

  const confirm = (opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts)
    return new Promise<boolean>((resolve) => setResolver(() => resolve))
  }

  const close = (value: boolean) => {
    resolver?.(value)
    setResolver(null)
    setOptions(null)
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <Modal
        open={options !== null}
        onClose={() => close(false)}
        size="sm"
        ariaLabel={options?.title ?? ''}
      >
        <div className="flex items-start gap-4 p-6">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
              options?.danger ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
            }`}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-slate-900">{options?.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">{options?.message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:bg-slate-800 dark:text-slate-200">
          <Button variant="ghost" onClick={() => close(false)}>
            {options?.cancelText ?? 'Batal'}
          </Button>
          <Button variant={options?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
            {options?.confirmText ?? 'Ya, Lanjutkan'}
          </Button>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmState {
  return useContext(ConfirmContext)
}
