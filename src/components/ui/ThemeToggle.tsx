import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
      title={isDark ? 'Mode terang' : 'Mode gelap'}
      className={cn(
        'group relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-700 active:scale-90 sm:rounded-xl sm:border sm:border-slate-200 sm:bg-white sm:hover:border-slate-300 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 sm:dark:border-slate-700 sm:dark:bg-slate-900 sm:dark:hover:border-slate-600',
        className,
      )}
    >
      {isDark ? (
        <Moon className="h-[18px] w-[18px] text-amber-300 transition-transform duration-300 group-hover:rotate-12" />
      ) : (
        <Sun className="h-[18px] w-[18px] text-slate-500 transition-transform duration-300 group-hover:rotate-45 group-hover:text-amber-500" />
      )}
    </button>
  )
}
