import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export function isEnvConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}

export const supabase = createClient(
  SUPABASE_URL || 'http://localhost:placeholder',
  SUPABASE_ANON_KEY || 'public-anon-key-placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'alfata-cbt-auth',
    },
    global: {
      headers: { 'x-application-name': 'smk-alfata-cbt' },
    },
  },
)

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}

type EdgeName = 'manage-user' | 'ai-proxy'

export type EdgeErrorKind = 'cors_or_network' | 'timeout' | 'not_deployed' | 'server' | 'unknown'

export class EdgeInvokeError extends Error {
  readonly kind: EdgeErrorKind
  readonly status: number
  constructor(kind: EdgeErrorKind, message: string, status = 0) {
    super(message)
    this.name = 'EdgeInvokeError'
    this.kind = kind
    this.status = status
  }
}

function functionsBaseUrl(): string {
  const raw = SUPABASE_URL.trim().replace(/\/+$/, '')
  if (raw === '') return ''
  return `${raw}/functions/v1`
}

async function readServerErrorMessage(res: Response): Promise<string> {
  try {
    const parsed = (await res.json()) as { error?: unknown; message?: unknown } | null
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.error === 'string' && parsed.error.trim() !== '') return parsed.error.trim()
      if (typeof parsed.message === 'string' && parsed.message.trim() !== '') return parsed.message.trim()
    }
  } catch {
    return ''
  }
  return ''
}

export async function invokeEdge<T>(name: EdgeName, body: Record<string, unknown>, options?: { timeoutMs?: number }): Promise<T> {
  const startedAt = Date.now()
  const timeoutMs = options?.timeoutMs
  const controller = typeof AbortController !== 'undefined' && timeoutMs !== undefined ? new AbortController() : null
  const timer = controller && timeoutMs !== undefined ? setTimeout(() => controller.abort(), Math.max(timeoutMs, 1000)) : null
  try {
    const { data, error } = await supabase.functions.invoke(name, { body, ...(controller ? { signal: controller.signal } : {}) })
    if (error) {
      const ctx = (error as unknown as { context?: Response }).context
      const status = typeof (ctx as { status?: unknown } | null)?.status === 'number' ? (ctx as unknown as { status: number }).status : 0
      const serverMessage = ctx ? await readServerErrorMessage(ctx) : ''
      if (serverMessage !== '') {
        throw new EdgeInvokeError('server', serverMessage, status)
      }
      if (error.message?.includes('Failed to fetch') || error.message?.includes('fetch failed')) {
        throw new EdgeInvokeError(
          'not_deployed',
          `Edge Function "${name}" tidak tersedia. Pastikan fungsi sudah di-deploy (lihat docs/SUPABASE_SETUP.md).`,
          status,
        )
      }
      throw new EdgeInvokeError('server', error.message || 'Panggilan Edge Function gagal.', status)
    }
    const result = data as { error?: string } & T
    if (result && typeof result === 'object' && 'error' in result && result.error) {
      throw new EdgeInvokeError('server', String(result.error), 200)
    }
    return result
  } catch (err) {
    if (err instanceof EdgeInvokeError) throw err
    const elapsed = Date.now() - startedAt
    if (controller?.signal.aborted) {
      throw new EdgeInvokeError(
        'timeout',
        `Edge Function "${name}" kehabisan waktu (${Math.round(elapsed / 1000)} dtk). Periksa koneksi dan log fungsi di dashboard Supabase.`,
      )
    }
    const message = err instanceof Error ? err.message : String(err)
    const causeValue: unknown = (err as { cause?: unknown }).cause
    const cause = causeValue instanceof Error ? `${causeValue.name}: ${causeValue.message}` : ''
    if (message.includes('Failed to fetch') || message.includes('fetch failed') || message.includes('NetworkError')) {
      throw new EdgeInvokeError(
        'cors_or_network',
        `Browser gagal menghubungi Edge Function "${name}" (${(elapsed / 1000).toFixed(1)} dtk). Response diblokir browser — biasanya CORS Edge Function, ekstensi/adblock, atau jaringan.${cause !== '' ? ` Penyebab teknis: ${cause}.` : ''} Coba mode Incognito tanpa ekstensi, atau buka tab Network di DevTools (F12) untuk melihat request yang gagal.`,
      )
    }
    if (message.includes('Failed to send a request')) {
      throw new EdgeInvokeError(
        'cors_or_network',
        `Browser gagal menghubungi Edge Function "${name}" (${(elapsed / 1000).toFixed(1)} dtk).${cause !== '' ? ` Penyebab teknis: ${cause}.` : ''} Biasanya karena CORS, ekstensi/adblock/antivirus, atau jaringan. Coba mode Incognito tanpa ekstensi, atau buka tab Network di DevTools (F12) untuk melihat request yang gagal.`,
      )
    }
    throw new EdgeInvokeError('unknown', message)
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function probeEdgeFunction(name: EdgeName): Promise<'ok' | 'not_found' | 'unreachable'> {
  const base = functionsBaseUrl()
  if (base === '') return 'unreachable'
  try {
    const res = await fetch(`${base}/${name}`, {
      method: 'OPTIONS',
      headers: { Origin: globalThis.location?.origin ?? 'http://localhost:3000', 'Access-Control-Request-Method': 'POST' },
    })
    if (res.ok) return 'ok'
    if (res.status === 401 || res.status === 403 || res.status === 404) return 'not_found'
    return 'unreachable'
  } catch {
    return 'unreachable'
  }
}
