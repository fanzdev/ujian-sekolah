import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'success'
type Size = 'xs' | 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: React.ReactNode
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary-600 text-white shadow-sm hover:bg-primary-700 active:bg-primary-800 disabled:bg-primary-300',
  secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100',
  danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700 active:bg-rose-800',
  outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:border-slate-500',
  success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700',
}

const SIZES: Record<Size, string> = {
  xs: 'h-8 sm:h-7 px-3 sm:px-2.5 text-xs gap-1 rounded-xl sm:rounded-md',
  sm: 'h-11 sm:h-9 px-4 sm:px-3 text-[14px] sm:text-[13px] gap-1.5 rounded-xl sm:rounded-lg',
  md: 'h-11 sm:h-10 px-5 sm:px-4 text-[15px] sm:text-sm gap-2 rounded-xl sm:rounded-lg',
  lg: 'h-12 sm:h-12 px-6 text-[15px] sm:text-base gap-2 rounded-2xl sm:rounded-xl',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, icon, className, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center font-semibold transition-all',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-500/30',
        'disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'
