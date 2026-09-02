import { supabase } from './client'
import type { AuditLog } from '@/types/models'

export async function logAudit(
  action: string,
  resource?: string | null,
  resourceId?: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await supabase.rpc('log_audit', {
      p_action: action,
      p_resource: resource ?? null,
      p_resource_id: resourceId ?? null,
      p_metadata: metadata,
    })
  } catch {
    // audit logging must never break the main flow
  }
}

export interface AuditQuery {
  action?: string
  actorId?: string
  page?: number
  pageSize?: number
}

export async function listAuditLogs(query: AuditQuery = {}): Promise<{ rows: AuditLog[]; total: number }> {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 25
  let builder = supabase
    .from('audit_logs')
    .select('*, profiles(full_name, username)', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (query.action) builder = builder.eq('action', query.action)
  if (query.actorId) builder = builder.eq('actor_id', query.actorId)

  const { data, error, count } = await builder.range((page - 1) * pageSize, page * pageSize - 1)
  if (error) throw error
  return { rows: (data as unknown as AuditLog[]) ?? [], total: count ?? 0 }
}
