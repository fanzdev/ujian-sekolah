import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Search, Sparkles, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModelItem {
  id: string
  name: string
  free: boolean
  context?: number
}

let cachePromise: Promise<ModelItem[]> | null = null

/** Ambil daftar model dari OpenRouter (endpoint publik, tanpa API key). */
export function loadOpenRouterModels(): Promise<ModelItem[]> {
  if (cachePromise) return cachePromise

  cachePromise = fetch('https://openrouter.ai/api/v1/models')
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })
    .then((j) => {
      const items: ModelItem[] = ((j?.data ?? []) as Record<string, unknown>[]).map((m) => {
        const pricing = (m.pricing ?? {}) as { prompt?: string; completion?: string }
        const id = String(m.id ?? '')
        const pricingFree = Number(pricing.prompt ?? 1) === 0 && Number(pricing.completion ?? 1) === 0
        const labelFree = id.toLowerCase().endsWith(':free') || id.includes(':free')
        return {
          id,
          name: String(m.name ?? id),
          free: pricingFree || labelFree,
          context: Number(m.context_length ?? 0),
        }
      }).filter((m) => m.id)

      items.sort((a, b) => {
        if (a.free !== b.free) return a.free ? -1 : 1
        return a.id.localeCompare(b.id)
      })
      return items
    })
    .catch(() => [] as ModelItem[])

  return cachePromise
}

export function ModelDropdown({
  value,
  onChange,
  placeholder = 'Pilih model…',
  freeOnly = false,
}: {
  value: string
  onChange: (id: string) => void
  placeholder?: string
  freeOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [models, setModels] = useState<ModelItem[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    loadOpenRouterModels().then((items) => {
      if (!active) return
      setModels(items)
      setLoading(false)
      setFailed(items.length === 0)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.setTimeout(() => searchRef.current?.focus(), 30)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const filtered = models.filter(
    (m) =>
      (!freeOnly || m.free) &&
      (!search ||
        m.id.toLowerCase().includes(search.toLowerCase()) ||
        m.name.toLowerCase().includes(search.toLowerCase())),
  )

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'input-base flex cursor-pointer items-center justify-between gap-2 text-left',
          open && 'border-primary-500 ring-4 ring-primary-500/10',
        )}
      >
        <span className={cn('min-w-0 truncate font-mono text-xs', value ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400')}>
          {value || placeholder}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-[100] mt-1.5 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl animate-scale-in dark:border-slate-700 dark:bg-slate-900">
          <div className="sticky top-0 border-b border-slate-100 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari model…"
                className="w-full rounded-lg bg-slate-50 py-2 pl-8 pr-2 text-xs outline-none dark:bg-slate-800"
              />
            </div>
          </div>

          <ul role="listbox" className="max-h-72 overflow-y-auto scrollbar-thin">
            {loading && <li className="px-4 py-6 text-center text-xs text-slate-400">Memuat daftar model…</li>}
            {!loading && failed && (
              <li className="px-4 py-5 text-center text-xs leading-relaxed text-slate-400">
                Gagal memuat daftar model (cek internet).
                <br />
                Ketik manual di bawah:
                <input
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder="provider/model-id"
                  className="mt-2 w-full rounded-lg bg-slate-50 px-2 py-1.5 font-mono text-[11px] outline-none dark:bg-slate-800"
                />
              </li>
            )}
            {!loading && !failed && filtered.length === 0 && (
              <li className="px-4 py-5 text-center text-xs text-slate-400">Tidak ada model cocok.</li>
            )}
            {filtered.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={m.id === value}
                  onClick={() => {
                    onChange(m.id)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-primary-50/60 dark:hover:bg-slate-800',
                    m.id === value && 'bg-primary-50 dark:bg-primary-500/10',
                  )}
                >
                  {m.free ? (
                    <Zap className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-600" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{m.name}</span>
                    <span className="block truncate font-mono text-[10px] text-slate-400">{m.id}</span>
                  </span>
                  {m.free && (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                      Gratis
                    </span>
                  )}
                  {m.id === value && <Check className="h-4 w-4 shrink-0 text-primary-600" />}
                </button>
              </li>
            ))}
          </ul>

          <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[10px] text-slate-400 dark:border-slate-700 dark:bg-slate-800/50">
            {models.filter((m) => m.free).length} model gratis tersedia · sumber: openrouter.ai/models
          </div>
        </div>
      )}
    </div>
  )
}
