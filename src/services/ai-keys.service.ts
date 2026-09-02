import { supabase } from './client'
import type { AiProviderKey } from '@/types/models'

export async function listAiKeys(): Promise<AiProviderKey[]> {
  const { data, error } = await supabase
    .from('ai_provider_keys')
    .select('*')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as AiProviderKey[]) ?? []
}

export interface AiKeyInput {
  label: string
  api_key: string
  model?: string | null
  is_active?: boolean
}

export async function createAiKey(input: AiKeyInput): Promise<void> {
  const { data: maxRow } = await supabase
    .from('ai_provider_keys')
    .select('priority')
    .order('priority', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextPriority = ((maxRow?.priority as number | null) ?? 0) + 10

  const { error } = await supabase.from('ai_provider_keys').insert({
    provider: 'openrouter',
    label: input.label.trim(),
    api_key: input.api_key.trim(),
    model: input.model?.trim() || null,
    is_active: input.is_active ?? true,
    priority: nextPriority,
  })
  if (error) throw error
}

export async function updateAiKey(
  id: string,
  fields: Partial<Pick<AiProviderKey, 'label' | 'model' | 'is_active' | 'api_key'>>,
): Promise<void> {
  const { error } = await supabase
    .from('ai_provider_keys')
    .update({ ...fields, last_error: null })
    .eq('id', id)
  if (error) throw error
}

export async function deleteAiKey(id: string): Promise<void> {
  const { error } = await supabase.from('ai_provider_keys').delete().eq('id', id)
  if (error) throw error
}

/** Tukar posisi prioritas dua key (naik/turun urutan rotasi). */
export async function moveAiKey(id: string, direction: -1 | 1, all: AiProviderKey[]): Promise<void> {
  const index = all.findIndex((k) => k.id === id)
  if (index === -1) return
  const target = index + direction
  if (target < 0 || target >= all.length) return

  const a = all[index]
  const b = all[target]
  await Promise.all([
    supabase.from('ai_provider_keys').update({ priority: b.priority }).eq('id', a.id),
    supabase.from('ai_provider_keys').update({ priority: a.priority }).eq('id', b.id),
  ])
}
