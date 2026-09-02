import { useEffect, useRef, useState } from 'react'
import { Bold, Italic, Underline, List, ListOrdered, Link2, Code, Eraser, X, Check } from 'lucide-react'
import { sanitizeHtml } from '@/lib/sanitize'
import { cn } from '@/lib/utils'

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
}

export function RichTextEditor({ value, onChange, placeholder, minHeight = 120 }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkError, setLinkError] = useState('')

  useEffect(() => {
    const el = editorRef.current
    if (el && !focused && el.innerHTML !== value) {
      el.innerHTML = value ?? ''
    }
  }, [value, focused])

  const exec = (command: string) => {
    editorRef.current?.focus()
    document.execCommand(command)
    emitChange()
  }

  const emitChange = () => {
    if (editorRef.current) {
      onChange(sanitizeHtml(editorRef.current.innerHTML))
    }
  }

  const insertLink = () => {
    setLinkUrl('')
    setLinkError('')
    setLinkOpen(true)
  }

  const confirmLink = () => {
    const url = linkUrl.trim()
    if (!url) {
      setLinkError('URL wajib diisi.')
      return
    }
    if (!/^https?:\/\//i.test(url)) {
      setLinkError('URL harus dimulai dengan http:// atau https://')
      return
    }
    editorRef.current?.focus()
    document.execCommand('createLink', false, url)
    emitChange()
    setLinkOpen(false)
    setLinkUrl('')
    setLinkError('')
  }

  const TOOLS: { icon: React.ReactNode; label: string; action: () => void }[] = [
    { icon: <Bold className="h-4 w-4" />, label: 'Tebal', action: () => exec('bold') },
    { icon: <Italic className="h-4 w-4" />, label: 'Miring', action: () => exec('italic') },
    { icon: <Underline className="h-4 w-4" />, label: 'Garis Bawah', action: () => exec('underline') },
    { icon: <List className="h-4 w-4" />, label: 'Daftar', action: () => exec('insertUnorderedList') },
    { icon: <ListOrdered className="h-4 w-4" />, label: 'Nomor', action: () => exec('insertOrderedList') },
    { icon: <Link2 className="h-4 w-4" />, label: 'Tautan', action: insertLink },
    { icon: <Code className="h-4 w-4" />, label: 'Kode', action: () => exec('formatBlock') },
    {
      icon: <Eraser className="h-4 w-4" />,
      label: 'Hapus Format',
      action: () => exec('removeFormat'),
    },
  ]

  return (
    <div className="relative">
      <div
        className={cn(
          'overflow-hidden rounded-lg border bg-white transition-colors dark:bg-slate-900',
          focused ? 'border-primary-500 ring-4 ring-primary-500/10' : 'border-slate-300 dark:border-slate-600',
        )}
      >
        <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-1.5 py-1.5 dark:border-slate-700 dark:bg-slate-800">
          {TOOLS.map((tool) => (
            <button
              key={tool.label}
              type="button"
              title={tool.label}
              aria-label={tool.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={tool.action}
              className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              {tool.icon}
            </button>
          ))}
        </div>
        <div
          ref={editorRef}
          role="textbox"
          aria-multiline="true"
          contentEditable
          suppressContentEditableWarning
          data-placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            emitChange()
          }}
          onInput={emitChange}
          className="rich-content max-w-none overflow-auto px-3.5 py-2.5 text-sm outline-none scrollbar-thin [&:empty]:before:text-slate-400 [&:empty]:before:content-[attr(data-placeholder)]"
          style={{ minHeight }}
        />
      </div>

      {linkOpen && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-slate-900/50 backdrop-blur-sm dark:bg-slate-950/70">
          <div className="mx-4 w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Sisipkan Tautan</p>
              <button onClick={() => setLinkOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300" aria-label="Tutup">
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => { setLinkUrl(e.target.value); setLinkError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmLink() } }}
              placeholder="https://contoh.com"
              autoFocus
              className="mt-3 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            {linkError && <p className="mt-1.5 text-xs text-rose-500 dark:text-rose-400">{linkError}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setLinkOpen(false)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
                Batal
              </button>
              <button onClick={confirmLink} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700">
                <Check className="h-3.5 w-3.5" /> Tambahkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function RichContent({ html, className }: { html: string | null | undefined; className?: string }) {
  return (
    <div
      className={cn('rich-content text-sm leading-relaxed', className)}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  )
}
