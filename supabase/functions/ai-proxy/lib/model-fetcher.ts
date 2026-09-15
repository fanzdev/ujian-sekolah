import type { Logger } from './logger.ts'

export type FetchFn = typeof fetch

function isFreeId(id: unknown): boolean {
  if (typeof id !== 'string') return false
  if (id.includes(':free')) return true
  return id.toLowerCase().includes('free')
}

function isZeroPrice(value: unknown): boolean {
  return value === 0 || value === '0' || value === 0.0
}

function isFreePricing(pricing: unknown): boolean {
  if (!pricing || typeof pricing !== 'object') return false
  const p = pricing as Record<string, unknown>
  return isZeroPrice(p['prompt']) && isZeroPrice(p['completion'])
}

function isExplicitlyFree(row: Record<string, unknown>): boolean {
  if (isFreeId(row['id'])) return true
  if (isFreePricing(row['pricing'])) return true
  for (const key of ['is_free', 'free', 'isFree']) {
    if (row[key] === true) return true
  }
  return false
}

function modelRows(payload: unknown): { row: Record<string, unknown>; id: string }[] {
  const root = (payload ?? {}) as Record<string, unknown>
  const list = Array.isArray(root['data']) ? (root['data'] as unknown[]) : []
  const rows: { row: Record<string, unknown>; id: string }[] = []
  const seen = new Set<string>()
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const id = row['id']
    if (typeof id !== 'string' || id.trim() === '') continue
    if (seen.has(id)) continue
    seen.add(id)
    rows.push({ row, id })
  }
  return rows
}

export function filterFreeModels(payload: unknown): string[] {
  return modelRows(payload)
    .filter(({ row }) => isExplicitlyFree(row))
    .map(({ id }) => id)
}

export function listAllModelIds(payload: unknown): string[] {
  return modelRows(payload).map(({ id }) => id)
}

export async function fetchFreeModels(
  baseURL: string,
  apiKey: string,
  fetchFn: FetchFn,
  timeoutMs: number,
  log: Logger,
  label: string,
  maxModels = 15,
): Promise<string[]> {
  const limit = Number.isFinite(maxModels) && maxModels > 0 ? Math.min(Math.floor(maxModels), 50) : 15
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(timeoutMs, 1000))
  try {
    const res = await fetchFn(`${baseURL}/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    })
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        log.warn(`Kunci API ${label} ditolak (${res.status}).`)
      }
      return []
    }
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      return []
    }
    const strict = filterFreeModels(body)
    if (strict.length > 0) return strict.slice(0, limit)
    const all = listAllModelIds(body)
    if (all.length > 0) {
      log.warn(`${label} tidak melabeli model gratis, memakai ${all.length} model tier gratis.`)
      return all.slice(0, limit)
    }
    return []
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}
