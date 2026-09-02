import { initials } from '@/lib/utils'
import { cn } from '@/lib/utils'

const SIZES = {
  xs: 'h-7 w-7 text-[10px]',
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-16 w-16 text-lg',
}

export function Avatar({
  name,
  src,
  size = 'md',
  shape = 'full',
  className,
}: {
  name: string
  src?: string | null
  size?: keyof typeof SIZES
  shape?: 'full' | 'xl'
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-primary-500 to-primary-700 font-semibold text-white',
        shape === 'full' ? 'rounded-full' : 'rounded-xl',
        SIZES[size],
        className,
      )}
      title={name}
    >
      {src ? (
        <img src={src} alt={name} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        initials(name || '?')
      )}
    </div>
  )
}
