import { supabase } from './client'

export type SecuritySeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface SecurityEvent {
  id: string
  user_id: string | null
  exam_id: string | null
  attempt_id: string | null
  event_type: string
  severity: SecuritySeverity
  ip_address: string | null
  user_agent: string | null
  device_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export function getDeviceId(): string {
  const key = 'cbt-device-id'
  try {
    let id = localStorage.getItem(key)
    if (!id) {
      id = `dev_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
      localStorage.setItem(key, id)
    }
    return id
  } catch {
    return `dev_fallback_${Math.random().toString(36).slice(2, 8)}`
  }
}

export async function recordSecurityEvent(
  attemptId: string,
  eventType: string,
  severity: SecuritySeverity = 'LOW',
  metadata: Record<string, unknown> = {},
  deviceId?: string,
): Promise<string | null> {
  const devId = deviceId ?? getDeviceId()
  try {
    const { data, error } = await supabase.rpc('record_security_event', {
      p_attempt_id: attemptId,
      p_event_type: eventType,
      p_severity: severity,
      p_metadata: metadata,
      p_device_id: devId,
    })
    if (error) throw error
    return data as string
  } catch {
    try {
      const queueKey = `sec-queue:${attemptId}`
      const raw = localStorage.getItem(queueKey)
      const queue = raw ? (JSON.parse(raw) as unknown[]) : []
      queue.push({ eventType, severity, metadata, deviceId: devId, ts: new Date().toISOString() })
      localStorage.setItem(queueKey, JSON.stringify(queue.slice(-50)))
    } catch { void 0 }
    return null
  }
}

export async function flushSecurityQueue(attemptId: string): Promise<void> {
  const key = `sec-queue:${attemptId}`
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return
    const queue = JSON.parse(raw) as { eventType: string; severity: SecuritySeverity; metadata: Record<string, unknown>; deviceId: string }[]
    if (!Array.isArray(queue) || queue.length === 0) return
    for (const item of queue) {
      try {
        await supabase.rpc('record_security_event', {
          p_attempt_id: attemptId,
          p_event_type: item.eventType,
          p_severity: item.severity,
          p_metadata: item.metadata,
          p_device_id: item.deviceId,
        })
      } catch { void 0 }
    }
    localStorage.removeItem(key)
  } catch { void 0 }
}

export async function listSecurityEvents(params: {
  attemptId?: string
  examId?: string
  userId?: string
  limit?: number
}): Promise<SecurityEvent[]> {
  let q = supabase.from('security_events').select('*').order('created_at', { ascending: true })
  if (params.attemptId) q = q.eq('attempt_id', params.attemptId)
  if (params.examId) q = q.eq('exam_id', params.examId)
  if (params.userId) q = q.eq('user_id', params.userId)
  if (params.limit) q = q.limit(params.limit)
  else q = q.limit(200)
  const { data, error } = await q
  if (error) throw error
  return (data as unknown as SecurityEvent[]) ?? []
}

export function calculateRiskScore(events: Pick<SecurityEvent, 'event_type'>[]): { score: number; level: 'NORMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' } {
  let score = 0
  for (const e of events) {
    const t = e.event_type
    if (['TAB_SWITCH', 'PAGE_BLUR', 'WINDOW_BLUR', 'PAGE_FOCUS'].includes(t)) score += 1
    else if (['FULLSCREEN_EXIT', 'PAGE_RELOAD', 'PAGE_LEAVE', 'COPY_ATTEMPT', 'PASTE_ATTEMPT', 'CUT_ATTEMPT', 'CONTEXT_MENU'].includes(t)) score += 1
    else if (t === 'IP_CHANGE') score += 2
    else if (t === 'DEVICE_CHANGE') score += 3
    else if (['MULTIPLE_DEVICE', 'MULTIPLE_SESSION', 'SESSION_CONFLICT', 'SESSION_REPLACED'].includes(t)) score += 5
    else if (t === 'DEVTOOLS_SUSPECTED') score += 2
    else if (['NETWORK_OFFLINE', 'RECONNECT'].includes(t)) score += 1
  }
  let level: 'NORMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'NORMAL'
  if (score >= 10) level = 'HIGH'
  else if (score >= 6) level = 'MEDIUM'
  else if (score >= 3) level = 'LOW'
  else if (score > 0) level = 'LOW'
  if (score >= 15) level = 'CRITICAL'
  return { score, level }
}

export async function getRiskScore(attemptId: string): Promise<{ score: number; level: string }> {
  try {
    const { data, error } = await supabase.from('security_risk_scores').select('risk_score, risk_level').eq('attempt_id', attemptId).maybeSingle()
    if (error) throw error
    if (data) return { score: Number((data as unknown as { risk_score: number }).risk_score) || 0, level: String((data as unknown as { risk_level: string }).risk_level) || 'NORMAL' }
  } catch { void 0 }
  const events = await listSecurityEvents({ attemptId, limit: 200 }).catch(() => [] as SecurityEvent[])
  const { score, level } = calculateRiskScore(events)
  return { score, level }
}
