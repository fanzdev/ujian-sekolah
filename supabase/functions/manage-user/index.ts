import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json, error } from '../_shared/cors.ts'

interface CreatePayload {
  action: 'create_user'
  username: string
  password: string
  full_name: string
  role: 'admin' | 'teacher' | 'student'
  student?: {
    nis?: string
    nisn?: string
    gender?: 'L' | 'P'
    birth_place?: string
    birth_date?: string
    address?: string
    phone?: string
    email?: string
    class_id?: string
  }
  teacher?: {
    nip?: string
    phone?: string
    email?: string
    address?: string
    subject_ids?: string[]
  }
}

type Payload =
  | CreatePayload
  | { action: 'ping' }
  | { action: 'update_user'; user_id: string; full_name?: string; is_active?: boolean }
  | { action: 'reset_password'; user_id: string; new_password: string }
  | { action: 'delete_user'; user_id: string }

const AUTH_DOMAIN = 'cbt.local'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return error('Method not allowed', 405)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return error('Missing authorization', 401)
  }
  const jwt = authHeader.replace('Bearer ', '')

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  if (!serviceKey || !supabaseUrl) {
    return error('Service misconfigured: missing SUPABASE_SERVICE_ROLE_KEY', 500)
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const verifier = createClient(supabaseUrl, anonKey || serviceKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: userData, error: userErr } = await verifier.auth.getUser(jwt)
  if (userErr || !userData.user) return error('Invalid token', 401)

  const { data: profile } = await admin
    .from('profiles')
    .select('role, is_active, username')
    .eq('id', userData.user.id)
    .single()
  if (!profile || profile.role !== 'admin' || !profile.is_active) {
    return error('Hanya admin yang diizinkan.', 403)
  }

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
    return error('Invalid JSON body')
  }

  try {
    switch (payload.action) {
      case 'ping':
        return json({ ok: true, version: 1 })

      case 'create_user': {
        const { username, password, full_name, role } = payload
        if (!username || !password || !full_name || !role) {
          return error('username, password, full_name, role wajib diisi.')
        }
        if (password.length < 8) return error('Password minimal 8 karakter.')
        if (!/^[a-zA-Z0-9._-]{3,30}$/.test(username)) {
          return error('Username hanya boleh huruf, angka, titik, garis bawah/strip (3-30 karakter).')
        }

        const uname = username.toLowerCase()
        const email = `${uname}@${AUTH_DOMAIN}`

        const { data: dupProfile } = await admin
          .from('profiles')
          .select('id')
          .ilike('username', uname)
          .maybeSingle()
        if (dupProfile) return error(`Username "${uname}" sudah digunakan.`)

        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { username: uname, full_name, role },
        })
        if (createErr) return error(createErr.message, 400)

        const uid = created.user.id

        if (role === 'student') {
          const s = payload.student ?? {}
          const ins = await admin.from('students').insert({
            profile_id: uid,
            nis: s.nis || null,
            nisn: s.nisn || null,
            gender: s.gender || null,
            birth_place: s.birth_place || null,
            birth_date: s.birth_date || null,
            address: s.address || null,
            phone: s.phone || null,
            email: s.email || null,
            class_id: s.class_id || null,
          })
          if (ins.error) return error(ins.error.message, 400)
        }

        if (role === 'teacher') {
          const t = payload.teacher ?? {}
          const ins = await admin.from('teachers').insert({
            profile_id: uid,
            nip: t.nip || null,
            phone: t.phone || null,
            email: t.email || null,
            address: t.address || null,
          })
          if (ins.error) return error(ins.error.message, 400)
          if (t.subject_ids?.length) {
            await admin
              .from('teacher_subjects')
              .insert(t.subject_ids.map((sid) => ({ teacher_id: uid, subject_id: sid })))
          }
        }

        await admin.from('profiles').update({
          username: uname,
          full_name,
          role,
        }).eq('id', uid)

        return json({ ok: true, user_id: uid, email })
      }

      case 'update_user': {
        const { user_id, full_name, is_active } = payload
        if (!user_id) return error('user_id wajib.')
        if (typeof is_active === 'boolean') {
          await admin.auth.admin.updateUserById(user_id, {
            ban_duration: is_active ? 'none' : '876000h',
          })
        }
        const upd: Record<string, unknown> = {}
        if (full_name !== undefined) upd.full_name = full_name
        if (typeof is_active === 'boolean') upd.is_active = is_active
        if (Object.keys(upd).length > 0) {
          const r = await admin.from('profiles').update(upd).eq('id', user_id)
          if (r.error) return error(r.error.message, 400)
        }
        return json({ ok: true })
      }

      case 'reset_password': {
        const { user_id, new_password } = payload
        if (!user_id || !new_password) return error('user_id & new_password wajib.')
        if (new_password.length < 8) return error('Password minimal 8 karakter.')
        const { error: resetErr } = await admin.auth.admin.updateUserById(user_id, {
          password: new_password,
        })
        if (resetErr) return error(resetErr.message, 400)
        return json({ ok: true })
      }

      case 'delete_user': {
        const { user_id } = payload
        if (!user_id) return error('user_id wajib.')
        if (user_id === userData.user.id) return error('Tidak dapat menghapus akun sendiri.')
        const { error: delErr } = await admin.auth.admin.deleteUser(user_id)
        if (delErr) return error(delErr.message, 400)
        return json({ ok: true })
      }

      default:
        return error('Unknown action')
    }
  } catch (e) {
    return error(e instanceof Error ? e.message : 'Unexpected error', 500)
  }
})
