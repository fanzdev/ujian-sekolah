import { supabase } from './client'

const MEDIA_BUCKET = 'media'

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  webm: 'video/webm',
}

function guessMime(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return file.type || MIME_BY_EXT[ext] || 'application/octet-stream'
}

export interface UploadResult {
  url: string
  path: string
}

export async function uploadMedia(file: File, purpose: string): Promise<UploadResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  const uid = sessionData.session?.user?.id
  if (!uid) throw new Error('Tidak ada sesi.')

  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const path = `${purpose}/${safeName}.${ext}`

  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    contentType: guessMime(file),
    cacheControl: '31536000',
  })
  if (error) throw error

  const { data: urlData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path)

  await supabase.from('media_files').insert({
    bucket: MEDIA_BUCKET,
    path,
    mime_type: guessMime(file),
    size_bytes: file.size,
    purpose,
    owner_id: uid,
  })

  return { url: urlData.publicUrl, path }
}

export async function deleteMedia(path: string): Promise<void> {
  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove([path])
  if (error) throw error
  await supabase.from('media_files').delete().eq('path', path)
}
