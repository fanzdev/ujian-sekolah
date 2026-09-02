import { supabase } from './client'
import type { Notification } from '@/types/models'

export async function listMyNotifications(limit = 30): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data as Notification[]) ?? []
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id)
  if (error) throw error
}

export async function markAllNotificationsRead(): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession()
  const uid = sessionData.session?.user?.id
  let builder = supabase.from('notifications').update({ is_read: true }).eq('is_read', false)
  if (uid) builder = builder.eq('recipient_id', uid)
  const { error } = await builder
  if (error) throw error
}

export async function countUnread(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false)
  if (error) throw error
  return count ?? 0
}
