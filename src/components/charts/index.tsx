import { useId, type ReactNode } from 'react'
import { cn, formatNumber } from '@/lib/utils'

/* ============================================================
   Kit grafik ringan berbasis SVG/CSS — tanpa dependency eksternal.
   Semua komponen responsif & mendukung dark mode via currentColor.
   ============================================================ */

export interface Datum {
  label: string
  value: number
}

export function ChartCard({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('card p-5 animate-fade-in', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

export function EmptyChart({ label = 'Belum ada data' }: { label?: string }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
      <p className="text-xs text-slate-300 dark:text-slate-600">{label}</p>
    </div>
  )
}

/* ---------------- Bar Chart (vertikal) ---------------- */

export function BarChart({
  data,
  height = 170,
  colorClass = 'from-primary-500 to-primary-400',
  suffix = '',
}: {
  data: Datum[]
  height?: number
  colorClass?: string
  suffix?: string
}) {
  const max = Math.max(1, ...data.map((d) => d.value))

  if (data.length === 0) return <EmptyChart />

  return (
    <div>
      <div className="flex items-end gap-1.5 sm:gap-2" style={{ height }}>
        {data.map((d) => {
          const pct = (d.value / max) * 100
          return (
            <div key={d.label} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
              <span
                className={cn(
                  'text-[10px] font-bold tabular-nums transition-opacity',
                  d.value > 0 ? 'text-slate-500 opacity-0 group-hover:opacity-100 dark:text-slate-300' : 'hidden',
                )}
              >
                {formatNumber(d.value, 0)}
                {suffix}
              </span>
              <div
                role="img"
                aria-label={`${d.label}: ${d.value}`}
                title={`${d.label} — ${d.value}${suffix}`}
                style={{ height: `${Math.max(pct, d.value > 0 ? 4 : 1.5)}%` }}
                className={cn(
                  'w-full max-w-[38px] rounded-t-lg bg-gradient-to-t transition-all group-hover:brightness-110',
                  d.value > 0 ? colorClass : 'bg-slate-200 dark:bg-slate-700',
                )}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex gap-1.5 sm:gap-2">
        {data.map((d) => (
          <span key={d.label} className="min-w-0 flex-1 truncate text-center text-[10px] font-medium text-slate-400">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ---------------- Area / Line Chart ---------------- */

export function AreaChart({
  points,
  height = 180,
  suffix = '',
  yMinZero = true,
}: {
  points: Datum[]
  height?: number
  suffix?: string
  yMinZero?: boolean
}) {
  const gradientId = useId().replace(/[:]/g, '')
  const valid = points.filter((p) => p.value !== null && Number.isFinite(p.value)) as Datum[]

  if (valid.length === 0) return <EmptyChart />
  if (valid.length === 1) valid.push({ ...valid[0], label: '' })

  const values = valid.map((p) => p.value)
  const rawMax = Math.max(...values)
  const rawMin = yMinZero ? 0 : Math.min(...values)
  const max = rawMax === rawMin ? rawMax + 1 : rawMax
  const min = rawMin

  const W = 100
  const H = 42
  const stepX = valid.length > 1 ? W / (valid.length - 1) : W
  const toX = (i: number) => i * stepX
  const toY = (v: number) => H - ((v - min) / (max - min)) * (H - 6) - 3

  const linePath = valid.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(2)},${toY(p.value).toFixed(2)}`).join(' ')
  const areaPath = `${linePath} L${toX(valid.length - 1).toFixed(2)},${H} L${toX(0).toFixed(2)},${H} Z`

  const last = valid[valid.length - 1]

  return (
    <div>
      <div className="relative" style={{ height }}>
        <div className="absolute top-0 right-0 text-right">
          <p className="text-xl font-extrabold tabular-nums text-slate-900 dark:text-white">
            {formatNumber(last.value, last.value % 1 === 0 ? 0 : 1)}
            <span className="text-xs font-semibold text-slate-400">{suffix}</span>
          </p>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">terakhir</p>
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="mt-8 h-[calc(100%-3.25rem)] w-full overflow-visible"
          aria-hidden
        >
          <defs>
            <linearGradient id={`grad-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(var(--c-primary-500))" stopOpacity="0.35" />
              <stop offset="100%" stopColor="rgb(var(--c-primary-500))" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="currentColor" strokeWidth="0.15" className="text-slate-200 dark:text-slate-700" />
          ))}
          <path d={areaPath} fill={`url(#grad-${gradientId})`} />
          <path d={linePath} fill="none" stroke="rgb(var(--c-primary-500))" strokeWidth="0.9" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ vectorEffect: 'non-scaling-stroke', strokeWidth: 2 }} />
        </svg>
      </div>

      <div className="mt-1 flex justify-between text-[10px] font-medium text-slate-400">
        <span>{points[0]?.label}</span>
        {points.length > 2 && <span className="hidden sm:inline">{points[Math.floor(points.length / 2)].label}</span>}
        <span>{last.label || points[points.length - 2]?.label}</span>
      </div>
    </div>
  )
}

/* ---------------- Donut Chart ---------------- */

export interface Segment extends Datum {
  color: string // hex
}

export function DonutChart({
  segments,
  centerTop,
  centerBottom,
  size = 150,
}: {
  segments: Segment[]
  centerTop: string
  centerBottom: string
  size?: number
}) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  const R = 40
  const C = 2 * Math.PI * R

  if (total === 0) return <EmptyChart />

  let offsetAcc = 0

  return (
    <div className="flex flex-wrap items-center justify-center gap-5 sm:gap-7">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" strokeWidth="11" className="stroke-slate-100 dark:stroke-slate-800" />
          {segments
            .filter((s) => s.value > 0)
            .map((s) => {
              const frac = s.value / total
              const dash = `${frac * C} ${C}`
              const el = (
                <circle
                  key={s.label}
                  cx="50"
                  cy="50"
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="11"
                  strokeDasharray={dash}
                  strokeDashoffset={-offsetAcc * C}
                  strokeLinecap="butt"
                >
                  <title>{`${s.label}: ${s.value}`}</title>
                </circle>
              )
              offsetAcc += frac
              return el
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white">{centerTop}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{centerBottom}</p>
        </div>
      </div>

      <ul className="space-y-2">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2.5 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="font-medium text-slate-600 dark:text-slate-300">{s.label}</span>
            <span className="ml-auto pl-3 font-bold tabular-nums text-slate-900 dark:text-white">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ---------------- Horizontal Bar List (ranking) ---------------- */

export function HBarList({
  items,
  suffix = '',
  colorClass = 'bg-primary-500',
}: {
  items: { label: string; value: number; hint?: string }[]
  suffix?: string
  colorClass?: string
}) {
  if (items.length === 0) return <EmptyChart />

  const max = Math.max(1, ...items.map((i) => i.value))

  return (
    <ul className="space-y-3">
      {items.map((item, idx) => {
        const pct = (item.value / max) * 100
        return (
          <li key={item.label + idx}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0 truncate font-medium text-slate-700 dark:text-slate-200">
                {idx === 0 && item.value >= max && <span className="mr-1">🏆</span>}
                {item.label}
                {item.hint && <span className="ml-1.5 text-slate-400">· {item.hint}</span>}
              </span>
              <span className="shrink-0 font-bold tabular-nums text-slate-900 dark:text-white">
                {formatNumber(item.value, item.value % 1 === 0 ? 0 : 1)}
                {suffix}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={cn('h-full rounded-full transition-all', colorClass)}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
