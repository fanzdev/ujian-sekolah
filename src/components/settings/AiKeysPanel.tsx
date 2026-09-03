import { useEffect, useState } from 'react'
import {
  Sparkles, Plus, Pencil, Trash2,
  ExternalLink, AlertCircle, CheckCircle2, KeyRound, Save,
  FlaskConical, Loader2, Zap,
} from 'lucide-react'
import { useAsync } from '@/hooks/useAsync'
import { useToast } from '@/hooks/useToast'
import { useConfirm } from '@/hooks/useConfirm'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { ToggleSwitch } from '@/components/ui/FormControls'
import { loadOpenRouterModels } from '@/components/settings/ModelDropdown'
import { EmptyState, Spinner } from '@/components/ui/Feedback'
import {
  listAiKeys, createAiKey, updateAiKey, deleteAiKey, moveAiKey,
  type AiKeyInput,
} from '@/services/ai-keys.service'
import { fetchSystemSettings, upsertSystemSetting } from '@/services/settings.service'
import { friendlyError } from '@/lib/errors'
import { relativeTime } from '@/lib/datetime'
import { maskSecret } from '@/lib/utils'
import type { AiProviderKey } from '@/types/models'

const FALLBACK_FREE_MODEL = 'meta-llama/llama-3.2-3b-instruct:free'

interface TestState {
  loading: boolean
  ok?: boolean
  message?: string
}

export default function AiKeysPanel() {
  const toast = useToast()
  const confirmDialog = useConfirm()

  const keysQuery = useAsync(() => listAiKeys(), [])

  const [formOpen, setFormOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<AiProviderKey | null>(null)
  const [testStates, setTestStates] = useState<Record<string, TestState>>({})
  const [allModelItems, setAllModelItems] = useState<{ id: string; name: string; free: boolean }[]>([])
  const [freeModels, setFreeModels] = useState<string[]>([])
  const [freeLoading, setFreeLoading] = useState(true)
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [modelLoaded, setModelLoaded] = useState(false)
  const [savingModel, setSavingModel] = useState(false)
  const [modelTest, setModelTest] = useState<TestState | null>(null)
  const [modelSearch, setModelSearch] = useState('')
  const [freeOnly, setFreeOnly] = useState(false)

  const keys = keysQuery.data ?? []
  const hasActiveKey = keys.some((k) => k.is_active)

  const configQuery = useAsync(() => fetchSystemSettings().then((s) => s.ai ?? { provider: 'openrouter', model: '', models: [] as string[] }), [])

  useEffect(() => {
    let active = true
    setFreeLoading(true)
    loadOpenRouterModels().then((items) => {
      if (!active) return
      setAllModelItems(items.map((m) => ({ id: m.id, name: m.name, free: m.free })))
      const frees = items.filter((m) => m.free)
      setFreeModels(frees.map((m) => m.id))
      setFreeLoading(false)
    }).catch(() => active && setFreeLoading(false))
    return () => { active = false }
  }, [])

  const fallbackModel = freeModels[0] ?? allModelItems[0]?.id ?? FALLBACK_FREE_MODEL

  useEffect(() => {
    if (modelLoaded) return
    const cfg = configQuery.data as { model?: string; models?: string[] } | undefined
    if (cfg) {
      const arr = (Array.isArray(cfg.models) && cfg.models.length ? cfg.models : cfg.model ? [cfg.model] : []) as string[]
      const allIds = allModelItems.map((m) => m.id)
      const valid = arr.filter((id) => (allIds.length ? allIds.includes(id) : true))
      if (valid.length) {
        setSelectedModels(valid)
        setModelLoaded(true)
        return
      }
      setModelLoaded(true)
      return
    }
    if (!freeLoading) {
      setModelLoaded(true)
    }
  }, [configQuery.data, freeLoading, fallbackModel, modelLoaded, freeModels, allModelItems])

  const displayedModel = selectedModels[0] || fallbackModel
  const resolveModelForKey = (key: AiProviderKey) => key.model?.trim() || displayedModel

  const toggleModel = (id: string) => {
    setSelectedModels((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    setModelTest(null)
  }

  const saveSelectedModels = async () => {
    if (!hasActiveKey) {
      toast.error('Tambahkan API Key terlebih dahulu.')
      return
    }
    setSavingModel(true)
    try {
      if (selectedModels.length === 0) {
        await upsertSystemSetting('ai', { provider: 'openrouter', model: '', models: [], temperature: 0.2 } as unknown as Record<string, unknown>)
        toast.success('Disimpan tanpa model terpilih — sistem akan pakai model fallback otomatis saat grading.')
      } else {
        await upsertSystemSetting('ai', { provider: 'openrouter', model: selectedModels[0], models: selectedModels, temperature: 0.2 } as unknown as Record<string, unknown>)
        toast.success(`${selectedModels.length} model tersimpan. Rotasi otomatis saat limit akan aktif.`)
      }
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setSavingModel(false)
    }
  }

  const runModelTest = async () => {
    const active = keys.filter((k) => k.is_active)
    if (active.length === 0) {
      toast.error('Tidak ada API Key aktif.')
      return
    }
    const model = selectedModels[0] || fallbackModel
    if (!model) {
      toast.error('Pilih model terlebih dahulu.')
      return
    }
    const key = active[0]
    setModelTest({ loading: true })
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key.api_key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 10, messages: [{ role: 'user', content: 'Balas hanya satu kata: OK' }] }),
      })
      const j = await res.json().catch(() => ({}) as Record<string, unknown>)
      if (!res.ok) throw new Error(String((j.error as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`))
      setModelTest({ loading: false, ok: true, message: `OK · ${model}` })
      toast.success('Tes berhasil.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal.'
      setModelTest({ loading: false, ok: false, message: msg })
      toast.error(`Tes gagal: ${msg}`)
    }
  }

  const runKeyTest = async (key: AiProviderKey) => {
    const model = resolveModelForKey(key)
    setTestStates((prev) => ({ ...prev, [key.id]: { loading: true } }))
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key.api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Balas hanya satu kata: OK' }],
        }),
      })
      const j = await res.json().catch(() => ({}) as Record<string, unknown>)
      if (!res.ok) {
        const msg = String((j.error as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`)
        throw new Error(msg)
      }
      setTestStates((prev) => ({ ...prev, [key.id]: { loading: false, ok: true, message: `OK · ${model}` } }))
      toast.success(`API Key "${key.label || maskSecret(key.api_key)}" BERFUNGSI.`)
      keysQuery.reload()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menghubungi OpenRouter.'
      setTestStates((prev) => ({ ...prev, [key.id]: { loading: false, ok: false, message } }))
      toast.error(`Tes gagal: ${message}`)
    }
  }

  async function handleToggle(key: AiProviderKey, active: boolean) {
    try {
      await updateAiKey(key.id, { is_active: active })
      keysQuery.reload()
    } catch (err) {
      toast.error(friendlyError(err))
    }
  }

  async function handleMove(id: string, dir: -1 | 1) {
    try {
      await moveAiKey(id, dir, keys)
      keysQuery.reload()
    } catch (err) {
      toast.error(friendlyError(err))
    }
  }

  return (
    <div className="space-y-5">
      <Card className="!rounded-2xl border-primary-100 bg-primary-50/40 dark:border-primary-800/40 dark:bg-primary-500/5">
        <CardBody>
          <h3 className="flex items-center gap-2 text-sm font-bold text-primary-800 dark:text-primary-200">
            <Sparkles className="h-4 w-4" /> Cara Kerja Pool API Key
          </h3>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-primary-900/80 dark:text-primary-100/80">
            <li>Saat guru menekan <strong>"Saran Nilai AI"</strong>, sistem memakai key urutan teratas.</li>
            <li>Key kena <strong>rate-limit (429)</strong> / kuota habis (402) / invalid → otomatis pindah ke key berikutnya.</li>
            <li>Gunakan tombol <strong>Tes</strong> untuk memastikan tiap key aktif sebelum dipakai ujian.</li>
            <li>Model AI dipilih otomatis dari daftar berlabel <strong>Gratis</strong> milik API Key tersebut. Tanpa override, sistem memakai model gratis teratas.</li>
          </ol>
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noreferrer noopener"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:text-primary-800 dark:text-primary-300"
          >
            Buat API Key baru di openrouter.ai/keys <ExternalLink className="h-3.5 w-3.5" />
          </a>
          {hasActiveKey && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200/60 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-500/10 dark:text-emerald-300">
              <Zap className="h-3.5 w-3.5 shrink-0" />
              {freeLoading ? (
                <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Membaca model gratis dari API Key…</span>
              ) : (
                <span><strong>{freeModels.length}</strong> model berlabel Gratis terdeteksi otomatis dari OpenRouter{fallbackModel ? <span className="font-mono text-[11px]"> · default: {fallbackModel}</span> : null}</span>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <Card className="!rounded-2xl">
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary-600" /> Pool API Key
            </span>
          }
          subtitle={`Urutan atas = prioritas pertama · ${keys.filter((k) => k.is_active).length} aktif dari ${keys.length}${freeModels.length ? ` · ${freeModels.length} model Gratis tersedia` : ''}`}
          action={
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => { setEditingKey(null); setFormOpen(true) }}>
              Tambah Key
            </Button>
          }
        />

        {keysQuery.loading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : keys.length === 0 ? (
          <EmptyState
            icon={<KeyRound className="h-6 w-6" />}
            title="Belum ada API Key"
            description="Tambahkan minimal satu API Key OpenRouter untuk mengaktifkan saran penilaian essay AI. Model gratis akan terbaca otomatis."
            action={<Button size="sm" onClick={() => { setEditingKey(null); setFormOpen(true) }} icon={<Plus className="h-4 w-4" />}>Tambah Key Pertama</Button>}
          />
        ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {keys.map((key, i) => {
              const test = testStates[key.id]
              const resolved = resolveModelForKey(key)
              const isAuto = !key.model
              return (
                <li key={key.id} className={`flex flex-wrap items-start gap-3 px-4 py-4 transition-opacity sm:px-5 ${!key.is_active ? 'opacity-50' : ''}`}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-extrabold text-slate-500 dark:bg-slate-800">
                    #{i + 1}
                  </span>

                  <div className="min-w-[180px] flex-1">
                    <p className="truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                      {key.label || '(tanpa label)'}
                      <span className="ml-2 font-mono text-[11px] font-normal text-slate-400">{maskSecret(key.api_key)}</span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
                      {isAuto ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-[11px] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"><Zap className="h-3 w-3" />Otomatis: {resolved}</span>
                      ) : (
                        <span className="font-mono">{resolved}</span>
                      )}
                      {key.last_used_at && <span>dipakai {relativeTime(key.last_used_at)}</span>}
                    </p>

                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {test?.loading && (
                        <Badge tone="gray"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Menguji…</Badge>
                      )}
                      {test?.ok === true && <Badge tone="green"><CheckCircle2 className="mr-1 inline h-3 w-3" />{test.message}</Badge>}
                      {test?.ok === false && (
                        <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-medium text-rose-600 dark:bg-rose-500/10 dark:text-white">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          <span className="truncate">{test.message}</span>
                        </span>
                      )}
                      {!test && key.last_error && (
                        <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          <span className="truncate">{key.last_error}</span>
                        </span>
                      )}
                      {!test && !key.last_error && key.last_used_at && (
                        <Badge tone="green"><CheckCircle2 className="mr-1 inline h-3 w-3" />Sehat</Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => void runKeyTest(key)}
                      disabled={test?.loading}
                      title="Tes API Key ini (pakai model gratis otomatis)"
                      aria-label={`Tes API Key ${key.label || i + 1}`}
                      className="rounded-lg border border-slate-200 p-2 text-slate-400 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
                    >
                      {test?.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                    </button>

                    <ToggleSwitch checked={key.is_active} onChange={(v) => void handleToggle(key, v)} />

                    <div className="flex flex-col">
                      <button
                        disabled={i === 0}
                        onClick={() => void handleMove(key.id!, -1)}
                        aria-label="Naikkan prioritas"
                        className="rounded p-0.5 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:bg-slate-700 dark:bg-slate-700 dark:text-slate-200"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3.5 w-3.5"><path strokeLinecap="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" /></svg>
                      </button>
                      <button
                        disabled={i === keys.length - 1}
                        onClick={() => void handleMove(key.id!, +1)}
                        aria-label="Turunkan prioritas"
                        className="rounded p-0.5 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:bg-slate-700 dark:bg-slate-700 dark:text-slate-200"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3.5 w-3.5"><path strokeLinecap="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                      </button>
                    </div>

                    <button onClick={() => { setEditingKey(key); setFormOpen(true) }} aria-label="Ubah key" className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-500/10 dark:hover:text-sky-400">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={async () => {
                        const ok = await confirmDialog.confirm({
                          title: 'Hapus API Key?',
                          message: `Key "${key.label || maskSecret(key.api_key)}" akan dihapus permanen dari pool rotasi.`,
                          danger: true,
                          confirmText: 'Hapus',
                        })
                        if (!ok) return
                        try {
                          await deleteAiKey(key.id)
                          toast.success('API Key dihapus.')
                          keysQuery.reload()
                        } catch (err) {
                          toast.error(friendlyError(err))
                        }
                      }}
                      aria-label="Hapus key"
                      className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {hasActiveKey && (
        <Card className="!rounded-2xl overflow-hidden">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-600" /> Model AI — Card Rotasi (Semua Model OpenRouter)
              </span>
            }
            subtitle={`${selectedModels.length} terpilih · gonta-ganti otomatis saat kena limit 429/402 · semua model via API Key`}
            action={
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {allModelItems.length} total · {freeModels.length} Gratis
              </span>
            }
          />
          <CardBody className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Sparkles className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  placeholder="Cari semua model… (cth: llama, gemma, gpt, Muse)"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="flex gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const filtered = allModelItems.filter((m) => (!freeOnly || m.free) && (!modelSearch || m.id.toLowerCase().includes(modelSearch.toLowerCase()) || m.name.toLowerCase().includes(modelSearch.toLowerCase()))).map((m) => m.id)
                    setSelectedModels(filtered)
                  }}
                >
                  Pilih hasil cari
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedModels([])}>
                  Kosongkan
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/50">
              <ToggleSwitch checked={freeOnly} onChange={setFreeOnly} label="Hanya Gratis (berlabel Free)" />
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{freeOnly ? `${freeModels.length} Gratis` : `${allModelItems.length} total · ${freeModels.length} Gratis`}</span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2 dark:border-slate-800 dark:bg-slate-900/60">
              {freeLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Memuat semua model OpenRouter via API Key…</div>
              ) : (
                <>
                  <div className="mb-2 flex items-center justify-between px-1">
                    <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      {(() => {
                        const filtered = allModelItems.filter((m) => (!freeOnly || m.free) && (!modelSearch || m.id.toLowerCase().includes(modelSearch.toLowerCase()) || m.name.toLowerCase().includes(modelSearch.toLowerCase())))
                        return `${filtered.length} model cocok · ${selectedModels.length} terpilih`
                      })()}
                    </p>
                    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-primary-600 dark:text-primary-300">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        checked={(() => {
                          const filtered = allModelItems.filter((m) => (!freeOnly || m.free) && (!modelSearch || m.id.toLowerCase().includes(modelSearch.toLowerCase()) || m.name.toLowerCase().includes(modelSearch.toLowerCase()))).map((m) => m.id)
                          return filtered.length > 0 && filtered.every((id) => selectedModels.includes(id))
                        })()}
                        onChange={(e) => {
                          const filtered = allModelItems.filter((m) => (!freeOnly || m.free) && (!modelSearch || m.id.toLowerCase().includes(modelSearch.toLowerCase()) || m.name.toLowerCase().includes(modelSearch.toLowerCase()))).map((m) => m.id)
                          if (e.target.checked) setSelectedModels((prev) => Array.from(new Set([...prev, ...filtered])))
                          else setSelectedModels((prev) => prev.filter((id) => !filtered.includes(id)))
                        }}
                      />
                      Pilih semua (filter)
                    </label>
                  </div>
                  <div className="max-h-[380px] space-y-1 overflow-y-auto rounded-lg bg-white p-1.5 shadow-inner dark:bg-slate-950 scrollbar-thin">
                    {allModelItems
                      .filter((m) => !modelSearch || m.id.toLowerCase().includes(modelSearch.toLowerCase()) || m.name.toLowerCase().includes(modelSearch.toLowerCase()))
                      .map((m) => {
                        const checked = selectedModels.includes(m.id)
                        const order = checked ? selectedModels.indexOf(m.id) + 1 : null
                        return (
                          <label
                            key={m.id}
                            className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-2.5 py-2 transition-colors ${checked ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-500/10' : 'border-transparent bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800'}`}
                          >
                            <input type="checkbox" checked={checked} onChange={() => toggleModel(m.id)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{m.name}</span>
                                {m.free ? (
                                  <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Gratis</span>
                                ) : (
                                  <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">Berbayar</span>
                                )}
                                {order && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white">#{order}</span>}
                              </span>
                              <span className="block truncate font-mono text-[11px] text-slate-400">{m.id}</span>
                            </span>
                            {checked && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
                          </label>
                        )
                      })}
                    {allModelItems.filter((m) => (!freeOnly || m.free) && (!modelSearch || m.id.toLowerCase().includes(modelSearch.toLowerCase()) || m.name.toLowerCase().includes(modelSearch.toLowerCase()))).length === 0 && (
                      <p className="py-6 text-center text-xs text-slate-400">Tidak ada model yang cocok.</p>
                    )}
                  </div>
                  {selectedModels.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selectedModels.map((id, idx) => (
                        <span key={id} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-600 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">{idx + 1}</span>
                          <span className="max-w-[160px] truncate font-mono">{id}</span>
                          <button onClick={() => toggleModel(id)} aria-label={`Hapus ${id}`} className="rounded-full p-0.5 hover:bg-slate-100 dark:hover:bg-slate-700 dark:bg-slate-700 dark:text-slate-200">
                            <span className="text-[12px] leading-none">×</span>
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <p className="text-[11px] leading-relaxed text-slate-400">
              Centang sebanyak mungkin model — semua model OpenRouter tampil via API Key. Urutan = prioritas rotasi. Jika model #1 kena limit/kuota (429/402), sistem otomatis coba #{selectedModels[1] ? '2' : 'berikutnya'} tanpa henti. Gratis vs Berbayar ditandai.
            </p>

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <Button variant="outline" onClick={runModelTest} loading={Boolean(modelTest?.loading)} icon={<FlaskConical className="h-4 w-4" />}>
                Tes Model #1
              </Button>
              <Button onClick={saveSelectedModels} loading={savingModel} icon={<Save className="h-4 w-4" />}>
                Simpan {selectedModels.length ? `(${selectedModels.length})` : ''} Model
              </Button>
              <span className="text-[11px] text-slate-400">Tes memakai API Key aktif teratas + model #{1} terpilih.</span>
            </div>
            {modelTest && (
              <div>
                {modelTest.loading && <Badge tone="gray"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Menguji…</Badge>}
                {modelTest.ok === true && <Badge tone="green"><CheckCircle2 className="mr-1 inline h-3 w-3" />{modelTest.message}</Badge>}
                {modelTest.ok === false && (
                  <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-medium text-rose-600 dark:bg-rose-500/10 dark:text-white">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    <span className="truncate">{modelTest.message}</span>
                  </span>
                )}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <KeyFormModal
        open={formOpen}
        editing={editingKey}
        fallbackModel={fallbackModel}
        freeModelsCount={freeModels.length}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false)
          keysQuery.reload()
        }}
      />
    </div>
  )
}

function KeyFormModal({
  open,
  editing,
  fallbackModel,
  freeModelsCount,
  onClose,
  onSaved,
}: {
  open: boolean
  editing: AiProviderKey | null
  fallbackModel: string
  freeModelsCount: number
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [label, setLabel] = useState('')
  const [apiKeyValue, setApiKeyValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [modalTest, setModalTest] = useState<TestState | null>(null)

  useEffect(() => {
    if (!open) return
    setLabel(editing?.label ?? '')
    setApiKeyValue('')
    setModalTest(null)
  }, [open, editing])

  const runModalTest = async () => {
    const keyToTest = apiKeyValue.trim() || editing?.api_key || ''
    if (keyToTest.length < 20) {
      toast.error('Tempelkan API Key yang valid untuk dites.')
      return
    }
    const modelToTest = fallbackModel
    setModalTest({ loading: true })
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${keyToTest}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelToTest, max_tokens: 10, messages: [{ role: 'user', content: 'Balas hanya satu kata: OK' }] }),
      })
      const j = await res.json().catch(() => ({}) as Record<string, unknown>)
      if (!res.ok) {
        const msg = String((j.error as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`)
        throw new Error(msg)
      }
      setModalTest({ loading: false, ok: true, message: `OK · ${modelToTest}` })
      toast.success('API Key berfungsi.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal.'
      setModalTest({ loading: false, ok: false, message })
      toast.error(`Tes gagal: ${message}`)
    }
  }

  const submit = async () => {
    if (!editing && apiKeyValue.trim().length < 20) {
      toast.error('Tempelkan API Key OpenRouter yang valid.')
      return
    }
    setSaving(true)
    try {
      const payload: AiKeyInput = {
        label: label.trim(),
        api_key: apiKeyValue.trim(),
        model: null,
      }
      if (editing) {
        await updateAiKey(editing.id, {
          label: payload.label,
          model: null,
          ...(payload.api_key ? { api_key: payload.api_key } : {}),
        })
        toast.success('API Key diperbarui.')
      } else {
        await createAiKey(payload)
        toast.success('API Key ditambahkan ke pool rotasi.')
      }
      onSaved()
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Ubah API Key' : 'Tambah API Key OpenRouter'} size="md">
      <div className="space-y-4 px-6 py-5">
        <Input
          label="Label / Nama"
          placeholder="cth: Key Utama Sekolah"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus={!editing}
          hint="Nama bebas untuk memudahkan identifikasi."
        />
        <Input
          label={editing ? 'API Key Baru (opsional)' : 'API Key *'}
          placeholder={editing ? 'kosongkan bila tidak diganti' : 'sk-or-v1-xxxxxxxxxxxx'}
          value={apiKeyValue}
          onChange={(e) => setApiKeyValue(e.target.value)}
          autoCapitalize="off"
          autoComplete="off"
          hint={
            <>
              Dapatkan di{' '}
              <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer noopener" className="font-semibold text-primary-600 underline">
                openrouter.ai/keys
              </a>{' '}
              — buat beberapa key agar rotasi berfungsi optimal.
            </>
          }
        />
        <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/70 px-3 py-2.5 dark:border-emerald-800/40 dark:bg-emerald-500/10">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><Zap className="h-3.5 w-3.5" />Model otomatis Gratis</p>
          <p className="mt-1 text-xs leading-relaxed text-emerald-700/80 dark:text-emerald-300/80">
            Saat disimpan, sistem otomatis membaca daftar model berlabel <strong>Gratis</strong> dari OpenRouter memakai API Key ini{freeModelsCount ? ` (${freeModelsCount} terdeteksi)` : ''}. Tidak perlu pilih manual — grading akan memakai <span className="font-mono text-[11px]">{fallbackModel}</span> sebagai default.
          </p>
        </div>
        {modalTest && (
          <div>
            {modalTest.loading && <Badge tone="gray"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Menguji…</Badge>}
            {modalTest.ok === true && <Badge tone="green"><CheckCircle2 className="mr-1 inline h-3 w-3" />{modalTest.message}</Badge>}
            {modalTest.ok === false && (
              <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-medium text-rose-600 dark:bg-rose-500/10 dark:text-white">
                <AlertCircle className="h-3 w-3 shrink-0" />
                <span className="truncate">{modalTest.message}</span>
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/60">
        <Button variant="outline" onClick={runModalTest} loading={Boolean(modalTest?.loading)} icon={<FlaskConical className="h-4 w-4" />}>
          Tes API Key
        </Button>
        <Button variant="ghost" onClick={onClose}>Batal</Button>
        <Button onClick={submit} loading={saving}>{editing ? 'Simpan Perubahan' : 'Tambah ke Pool'}</Button>
      </div>
    </Modal>
  )
}
