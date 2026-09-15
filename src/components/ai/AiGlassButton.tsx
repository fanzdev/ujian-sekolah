import { Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'

export function AiGlassButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11 select-none items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-[15px] font-semibold text-slate-700 transition-all hover:border-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-500/30 active:scale-[0.98] motion-safe:animate-ai-shadow sm:h-10 sm:rounded-lg sm:px-4 sm:text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:text-white"
    >
      <Sparkles className="h-4 w-4 text-primary-600 dark:text-primary-400" />
      <span>{children}</span>
    </button>
  )
}
