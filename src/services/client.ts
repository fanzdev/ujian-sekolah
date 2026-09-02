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

type EdgeName = 'manage-user' | 'grade-essay' | 'chat-ai'

export async function invokeEdge<T>(name: EdgeName, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    const ctx = (error as unknown as { context?: { json?: () => Promise<{ error?: string }> } }).context
    let serverMessage = ''
    if (ctx?.json) {
      try {
        const parsed = await ctx.json()
        serverMessage = parsed?.error ?? ''
      } catch {
        // ignore parse failure
      }
    }
    if (!serverMessage && error.message?.includes('Failed to fetch')) {
      throw new Error(
        `Edge Function "${name}" tidak tersedia. Pastikan fungsi sudah di-deploy (lihat docs/SUPABASE_SETUP.md).`,
      )
    }
    throw new Error(serverMessage || error.message || 'Panggilan Edge Function gagal.')
  }
  const result = data as { error?: string } & T
  if (result && typeof result === 'object' && 'error' in result && result.error) {
    throw new Error(String(result.error))
  }
  return result
}
