import { useEffect, useRef, useState } from 'react'
import { Send, Bot, User, Trash2, Loader2, ChevronDown, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase, invokeEdge } from '@/services/client'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export function ChatAiCard({
  open,
  onClose,
  anchorRef,
}: {
  open: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement>
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [size, setSize] = useState({ w: 380, h: 480 })
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'Halo! Saya asisten AI SMK AL-FATA CBT. Tanya apa saja tentang ujian, materi, atau bantuan belajar.' },
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [model, setModel] = useState('')
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const modelMenuRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ dragging: boolean; offsetX: number; offsetY: number } | null>(null)
  const resizeRef = useRef<{
    dir: ResizeDir
    startW: number
    startH: number
    startX: number
    startY: number
    startPosX: number
    startPosY: number
  } | null>(null)

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { data: cfg } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'ai')
          .maybeSingle()
        const cfgVal = cfg?.value as { model?: string; models?: string[] } | undefined
        const list = Array.isArray(cfgVal?.models) && cfgVal.models.length ? cfgVal.models : cfgVal?.model ? [cfgVal.model] : []
        setAvailableModels(list)
        setModel((prev) => {
          if (prev && list.includes(prev)) return prev
          return list[0] ?? cfgVal?.model ?? ''
        })
        const selectedModel = list[0] ?? cfgVal?.model ?? ''
        if (!selectedModel) {
          setMessages((m) => {
            const already = m.some((x) => x.content.includes('Silakan setup model AI'))
            if (already) return m
            return [...m, { role: 'assistant', content: 'Silakan setup model AI terlebih dahulu di pengaturan AI Grading.' }]
          })
        }
      } catch {
        setAvailableModels([])
        setModel('')
      }
    }
    if (open) loadSettings()
  }, [open])

  useEffect(() => {
    if (!modelMenuOpen) return
    const onDown = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) setModelMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [modelMenuOpen])

  const hasPositioned = useRef(false)
  useEffect(() => {
    if (!open) {
      hasPositioned.current = false
      return
    }
    if (hasPositioned.current) return
    const rect = anchorRef.current?.getBoundingClientRect()
    const w = size.w
    const h = size.h
    const pad = 8
    const minY = 72
    let x = rect ? rect.right - w : window.innerWidth - w - 16
    let y = rect ? rect.bottom + 8 : 72
    x = Math.max(pad, Math.min(x, window.innerWidth - w - pad))
    y = Math.max(minY, Math.min(y, window.innerHeight - h - pad))
    setPos({ x, y })
    hasPositioned.current = true
  }, [open, anchorRef, size.w, size.h])

  useEffect(() => {
    if (!open || !pos) return
    const onResizeWindow = () => {
      const w = cardRef.current?.offsetWidth ?? size.w
      const h = cardRef.current?.offsetHeight ?? size.h
      const pad = 8
      const minY = 72
      let nx = pos.x
      let ny = pos.y
      nx = Math.max(pad, Math.min(nx, window.innerWidth - w - pad))
      ny = Math.max(minY, Math.min(ny, window.innerHeight - h - pad))
      if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny })
    }
    window.addEventListener('resize', onResizeWindow)
    return () => window.removeEventListener('resize', onResizeWindow)
  }, [open, pos, size.h, size.w])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  useEffect(() => {
    if (!open) return
    const onDownOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (cardRef.current?.contains(target) || anchorRef.current?.contains(target)) return
    }
    void onDownOutside
  }, [open, anchorRef])

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    const isTouch = 'touches' in e
    const clientX = isTouch ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX
    const clientY = isTouch ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY
    if (!pos) return
    dragRef.current = { dragging: true, offsetX: clientX - pos.x, offsetY: clientY - pos.y }
    const onMove = (ev: MouseEvent | TouchEvent) => {
      const cx = 'touches' in ev ? (ev as TouchEvent).touches[0].clientX : (ev as MouseEvent).clientX
      const cy = 'touches' in ev ? (ev as TouchEvent).touches[0].clientY : (ev as MouseEvent).clientY
      const cur = dragRef.current
      if (!cur?.dragging) return
      const w = cardRef.current?.offsetWidth ?? size.w
      const h = cardRef.current?.offsetHeight ?? size.h
      const pad = 8
      const minY = 72
      let nx = cx - cur.offsetX
      let ny = cy - cur.offsetY
      nx = Math.max(pad, Math.min(nx, window.innerWidth - w - pad))
      ny = Math.max(minY, Math.min(ny, window.innerHeight - h - pad))
      setPos({ x: nx, y: ny })
    }
    const onUp = () => {
      if (dragRef.current) dragRef.current.dragging = false
      window.removeEventListener('mousemove', onMove as never)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove as never)
      window.removeEventListener('touchend', onUp)
    }
    window.addEventListener('mousemove', onMove as never)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove as never, { passive: false } as never)
    window.addEventListener('touchend', onUp)
  }

  const handleResizeStart = (e: React.MouseEvent | React.TouchEvent, dir: ResizeDir) => {
    e.preventDefault()
    e.stopPropagation()
    const isTouch = 'touches' in e
    const clientX = isTouch ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX
    const clientY = isTouch ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY
    resizeRef.current = {
      dir,
      startW: size.w,
      startH: size.h,
      startX: clientX,
      startY: clientY,
      startPosX: pos?.x ?? 0,
      startPosY: pos?.y ?? 72,
    }
    const onMove = (ev: MouseEvent | TouchEvent) => {
      const cx = 'touches' in ev ? (ev as TouchEvent).touches[0].clientX : (ev as MouseEvent).clientX
      const cy = 'touches' in ev ? (ev as TouchEvent).touches[0].clientY : (ev as MouseEvent).clientY
      const cur = resizeRef.current
      if (!cur) return
      const minW = 320
      const minH = 380
      const maxW = 560
      const maxH = 720
      const dx = cx - cur.startX
      const dy = cy - cur.startY
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

      let nw = cur.startW
      let nh = cur.startH
      let nx = cur.startPosX
      let ny = cur.startPosY

      switch (cur.dir) {
        case 'e':
          nw = clamp(cur.startW + dx, minW, maxW)
          nw = Math.min(nw, window.innerWidth - cur.startPosX - 8)
          break
        case 'w':
          nw = clamp(cur.startW - dx, minW, maxW)
          nx = cur.startPosX + cur.startW - nw
          nx = Math.max(8, nx)
          nw = cur.startPosX + cur.startW - nx
          break
        case 's':
          nh = clamp(cur.startH + dy, minH, maxH)
          nh = Math.min(nh, window.innerHeight - cur.startPosY - 8)
          break
        case 'n':
          nh = clamp(cur.startH - dy, minH, maxH)
          ny = cur.startPosY + cur.startH - nh
          ny = Math.max(72, ny)
          nh = cur.startPosY + cur.startH - ny
          break
        case 'se':
          nw = clamp(cur.startW + dx, minW, maxW)
          nw = Math.min(nw, window.innerWidth - cur.startPosX - 8)
          nh = clamp(cur.startH + dy, minH, maxH)
          nh = Math.min(nh, window.innerHeight - cur.startPosY - 8)
          break
        case 'sw':
          nw = clamp(cur.startW - dx, minW, maxW)
          nx = cur.startPosX + cur.startW - nw
          nx = Math.max(8, nx)
          nw = cur.startPosX + cur.startW - nx
          nh = clamp(cur.startH + dy, minH, maxH)
          nh = Math.min(nh, window.innerHeight - cur.startPosY - 8)
          break
        case 'ne':
          nw = clamp(cur.startW + dx, minW, maxW)
          nw = Math.min(nw, window.innerWidth - cur.startPosX - 8)
          nh = clamp(cur.startH - dy, minH, maxH)
          ny = cur.startPosY + cur.startH - nh
          ny = Math.max(72, ny)
          nh = cur.startPosY + cur.startH - ny
          break
        case 'nw':
          nw = clamp(cur.startW - dx, minW, maxW)
          nx = cur.startPosX + cur.startW - nw
          nx = Math.max(8, nx)
          nw = cur.startPosX + cur.startW - nx
          nh = clamp(cur.startH - dy, minH, maxH)
          ny = cur.startPosY + cur.startH - nh
          ny = Math.max(72, ny)
          nh = cur.startPosY + cur.startH - ny
          break
      }
      setSize({ w: nw, h: nh })
      setPos({ x: nx, y: ny })
    }
    const onUp = () => {
      resizeRef.current = null
      window.removeEventListener('mousemove', onMove as never)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove as never)
      window.removeEventListener('touchend', onUp)
    }
    window.addEventListener('mousemove', onMove as never)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove as never, { passive: false } as never)
    window.addEventListener('touchend', onUp)
  }

  const send = async () => {
    if (!model) {
      setMessages((m) => [...m, { role: 'assistant', content: 'Silakan setup model AI terlebih dahulu di pengaturan AI Grading.' }])
      return
    }
    const text = input.trim()
    if (!text || sending) return
    setMessages((m) => [...m, { role: 'user', content: text }])
    setInput('')
    setSending(true)
    try {
      let reply = ''
      try {
        const result = await invokeEdge<{ reply: string; model: string }>('chat-ai', {
          messages: [{ role: 'user', content: text }],
          model,
          max_tokens: 500,
        })
        reply = result.reply ?? ''
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('tidak tersedia') || msg.includes('Failed to fetch')) {
          reply = `Edge Function chat-ai belum ter-deploy. Deploy dengan: supabase functions deploy chat-ai. Pesan: "${text.slice(0, 80)}"`
        } else {
          reply = `Maaf, AI belum bisa menjawab (model: ${model}). Detail: ${msg.slice(0, 200)}`
        }
      }
      if (!reply) reply = `Maaf, saya belum bisa terhubung ke AI saat ini (model: ${model}). Coba lagi nanti atau hubungi admin untuk cek API Key.`
      setMessages((m) => [...m, { role: 'assistant', content: reply }])
    } finally {
      setSending(false)
    }
  }

  if (!open) return null

  return (
    <div
      ref={cardRef}
      style={{
        left: pos?.x ?? 0,
        top: pos?.y ?? 0,
        width: size.w,
        height: size.h,
        position: 'fixed',
      }}
      className="z-50 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 animate-scale-in"
    >
      <div
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        className="flex cursor-grab select-none items-center justify-between border-b border-slate-100 px-4 py-3 text-white active:cursor-grabbing dark:border-slate-800"
        style={{ touchAction: 'none', background: 'var(--app-gradient, linear-gradient(to right, rgb(var(--c-primary-600)), rgb(var(--c-accent-600))))', color: 'white' }}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 backdrop-blur">
            <Bot className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-bold leading-none">Chat AI</p>
            <p className="text-[11px] opacity-80">Asisten CBT &bull; geser untuk pindah</p>
          </div>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => setMessages([{ role: 'assistant', content: 'Riwayat dibersihkan. Ada yang bisa dibantu?' }])} className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 dark:hover:bg-slate-800" aria-label="Bersihkan chat">
            <Trash2 className="h-4 w-4" />
          </button>
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 dark:hover:bg-slate-800" aria-label="Tutup">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3 scrollbar-thin dark:bg-slate-950">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-500/20 dark:text-white"><Bot className="h-3.5 w-3.5" /></span>}
            <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm ${m.role === 'user' ? 'bg-primary-600 text-white rounded-br-sm' : 'bg-white text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 rounded-bl-sm'}`}>
              {m.content}
            </div>
            {m.role === 'user' && <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"><User className="h-3.5 w-3.5" /></span>}
          </div>
        ))}
        {sending && (
          <div className="flex gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-500/20 dark:text-white"><Bot className="h-3.5 w-3.5" /></span>
            <div className="rounded-2xl bg-white px-3.5 py-2.5 text-xs text-slate-400 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Mengetik&hellip;
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            placeholder="Tanyakan apa saja..."
            rows={1}
            className="max-h-24 min-h-[40px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <Button onClick={send} disabled={!input.trim() || sending || !model} icon={<Send className="h-4 w-4" />} size="sm" className="shrink-0">
            Kirim
          </Button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div ref={modelMenuRef} className="relative min-w-0 flex-1">
            {availableModels.length > 0 && model ? (
              <>
                <button
                  type="button"
                  onClick={() => setModelMenuOpen((o) => !o)}
                  aria-haspopup="listbox"
                  aria-expanded={modelMenuOpen}
                  className="flex w-full items-center justify-between gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:bg-slate-800"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Sparkles className="h-3 w-3 shrink-0 text-primary-500" />
                    <span className="truncate font-mono text-[11px]">{model || 'Pilih model'}</span>
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${modelMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {modelMenuOpen && (
                  <div className="absolute bottom-full left-0 z-20 mb-1.5 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl scrollbar-thin dark:border-slate-700 dark:bg-slate-900">
                    <div className="sticky top-0 bg-white px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:bg-slate-900 dark:text-slate-500">
                      Model terpilih di pengaturan · {availableModels.length}
                    </div>
                    {availableModels.map((m) => (
                      <button
                        key={m}
                        type="button"
                        role="option"
                        aria-selected={m === model}
                        onClick={() => {
                          setModel(m)
                          setModelMenuOpen(false)
                        }}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${m === model ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300' : 'text-slate-600 dark:text-slate-300'}`}
                      >
                        <span className="truncate font-mono">{m}</span>
                        {m === model && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" />}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <span className="text-[10px] text-slate-400 dark:text-slate-500">Belum ada model terpilih di pengaturan</span>
            )}
          </div>
          <span className="flex shrink-0 items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
            <Bot className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400" />
            Chat AI
          </span>
        </div>
      </div>

      {/* Resize handles - 4 edges + 4 corners */}
      <div
        onMouseDown={(e) => handleResizeStart(e, 'n')}
        onTouchStart={(e) => handleResizeStart(e, 'n')}
        className="absolute left-1/2 top-0 -translate-x-1/2 h-1.5 w-16 cursor-n-resize z-20"
        style={{ touchAction: 'none' }}
        aria-label="Ubah ukuran"
        title="Tarik untuk ubah ukuran"
      />
      <div
        onMouseDown={(e) => handleResizeStart(e, 's')}
        onTouchStart={(e) => handleResizeStart(e, 's')}
        className="absolute bottom-0 left-1/2 -translate-x-1/2 h-1.5 w-16 cursor-s-resize z-20"
        style={{ touchAction: 'none' }}
        aria-label="Ubah ukuran"
        title="Tarik untuk ubah ukuran"
      />
      <div
        onMouseDown={(e) => handleResizeStart(e, 'e')}
        onTouchStart={(e) => handleResizeStart(e, 'e')}
        className="absolute right-0 top-1/2 -translate-y-1/2 h-16 w-1.5 cursor-e-resize z-20"
        style={{ touchAction: 'none' }}
        aria-label="Ubah ukuran"
        title="Tarik untuk ubah ukuran"
      />
      <div
        onMouseDown={(e) => handleResizeStart(e, 'w')}
        onTouchStart={(e) => handleResizeStart(e, 'w')}
        className="absolute left-0 top-1/2 -translate-y-1/2 h-16 w-1.5 cursor-w-resize z-20"
        style={{ touchAction: 'none' }}
        aria-label="Ubah ukuran"
        title="Tarik untuk ubah ukuran"
      />
      {/* Corners */}
      <div
        onMouseDown={(e) => handleResizeStart(e, 'ne')}
        onTouchStart={(e) => handleResizeStart(e, 'ne')}
        className="absolute right-0 top-0 h-5 w-5 cursor-ne-resize z-20"
        style={{ touchAction: 'none' }}
        aria-label="Ubah ukuran"
        title="Tarik pojok kanan atas"
      />
      <div
        onMouseDown={(e) => handleResizeStart(e, 'nw')}
        onTouchStart={(e) => handleResizeStart(e, 'nw')}
        className="absolute left-0 top-0 h-5 w-5 cursor-nw-resize z-20"
        style={{ touchAction: 'none' }}
        aria-label="Ubah ukuran"
        title="Tarik pojok kiri atas"
      />
      <div
        onMouseDown={(e) => handleResizeStart(e, 'se')}
        onTouchStart={(e) => handleResizeStart(e, 'se')}
        className="absolute bottom-0 right-0 h-5 w-5 cursor-se-resize z-20"
        style={{ touchAction: 'none' }}
        aria-label="Ubah ukuran"
        title="Tarik pojok kanan bawah (320×380 — 560×720)"
      >
        <div className="pointer-events-none absolute bottom-0.5 right-0.5 h-2 w-2 border-b-2 border-r-2 border-slate-400 dark:border-slate-500 rounded-br-sm opacity-60" />
      </div>
      <div
        onMouseDown={(e) => handleResizeStart(e, 'sw')}
        onTouchStart={(e) => handleResizeStart(e, 'sw')}
        className="absolute bottom-0 left-0 h-5 w-5 cursor-sw-resize z-20"
        style={{ touchAction: 'none' }}
        aria-label="Ubah ukuran"
        title="Tarik pojok kiri bawah"
      />
    </div>
  )
}
