import { forwardRef, useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export const SearchInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <div className={cn('relative w-full sm:w-72', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={ref}
        type="search"
        aria-label="Cari"
        className="input-base pl-9 [&::-webkit-search-cancel-button]:appearance-none"
        {...props}
      />
    </div>
  ),
)
SearchInput.displayName = 'SearchInput'

export function PasswordInput({
  label,
  error,
  name,
  value,
  onChange,
  required,
  placeholder,
  autoComplete,
}: {
  label?: string
  error?: string
  name?: string
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  required?: boolean
  placeholder?: string
  autoComplete?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={name} className="label-base">
          {label} {required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          id={name}
          name={name}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          required={required}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          className={cn('input-base pr-11', error && 'border-rose-400')}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'}
          className="absolute top-1/2 right-3 -translate-y-1/2 rounded-md p-1 text-slate-400 transition-colors hover:text-slate-600"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>}
    </div>
  )
}

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
  className,
}: {
  label: React.ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3', disabled && 'cursor-not-allowed opacity-60', className)}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4.5 w-4.5 shrink-0 rounded border-slate-300 text-primary-600 accent-primary-600 focus-visible:ring-4 focus-visible:ring-primary-500/20"
        style={{ width: '1.125rem', height: '1.125rem' }}
      />
      <span className="text-sm leading-snug text-slate-700">{label}</span>
    </label>
  )
}

export function ToggleSwitch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  description?: string
  disabled?: boolean
}) {
  return (
    <label className={cn('flex items-center justify-between gap-4', disabled ? 'opacity-60' : 'cursor-pointer')}>
      {(label || description) && (
        <span>
          {label && <span className="block text-sm font-medium text-slate-700">{label}</span>}
          {description && <span className="mt-0.5 block text-xs text-slate-400">{description}</span>}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label ?? 'toggle'}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:ring-4 focus-visible:ring-primary-500/20',
          checked ? 'bg-primary-600' : 'bg-slate-300',
        )}
      >
        <span
          className={cn(
            'inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
          style={{ width: '1.125rem', height: '1.125rem' }}
        />
      </button>
    </label>
  )
}
