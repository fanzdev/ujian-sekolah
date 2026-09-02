import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: React.ReactNode
  leftIcon?: React.ReactNode
  rightSlot?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftIcon, rightSlot, className, id, ...props }, ref) => {
    const inputId = id ?? props.name
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="label-base">
            {label}
            {props.required && <span className="ml-0.5 text-rose-500">*</span>}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${inputId}-err` : undefined}
            className={cn(
              'input-base',
              leftIcon && 'pl-10',
              rightSlot && 'pr-20',
              error && 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/10',
              className,
            )}
            {...props}
          />
          {rightSlot && <div className="absolute top-1/2 right-2 -translate-y-1/2">{rightSlot}</div>}
        </div>
        {error ? (
          <p id={`${inputId}-err`} role="alert" className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-600">
            <AlertCircle className="h-3.5 w-3.5" /> {error}
          </p>
        ) : hint ? (
          <p className="mt-1.5 text-xs text-slate-400">{hint}</p>
        ) : null}
      </div>
    )
  },
)
Input.displayName = 'Input'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: React.ReactNode
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id ?? props.name
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="label-base">
            {label}
            {props.required && <span className="ml-0.5 text-rose-500">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          className={cn('input-base min-h-[90px] resize-y', error && 'border-rose-400', className)}
          {...props}
        />
        {error ? (
          <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-600">
            <AlertCircle className="h-3.5 w-3.5" /> {error}
          </p>
        ) : hint ? (
          <p className="mt-1.5 text-xs text-slate-400">{hint}</p>
        ) : null}
      </div>
    )
  },
)
Textarea.displayName = 'Textarea'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string; disabled?: boolean }[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className, id, ...props }, ref) => {
    const inputId = id ?? props.name
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="label-base">
            {label}
            {props.required && <span className="ml-0.5 text-rose-500">*</span>}
          </label>
        )}
        <select
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          className={cn('input-base cursor-pointer appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 24 24%27 stroke=%27%2364748b%27 stroke-width=%272%27%3E%3Cpath stroke-linecap=%27round%27 stroke-linejoin=%27round%27 d=%27m19.5 8.25-7.5 7.5-7.5-7.5%27/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-10', error && 'border-rose-400', className)}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && (
          <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-600">
            <AlertCircle className="h-3.5 w-3.5" /> {error}
          </p>
        )}
      </div>
    )
  },
)
Select.displayName = 'Select'
