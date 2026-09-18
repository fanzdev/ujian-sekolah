import { createClient } from 'npm:@supabase/supabase-js@2'
import { alwaysIncludeCors, resolveCorsHeaders, json, error } from '../_shared/cors.ts'

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

async function handle(req: Request): Promise<Response> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const cors = resolveCorsHeaders(req, supabaseUrl)
  if (req.method !== 'POST') {
    return error('Method not allowed', 405, cors)
  }

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
    return error('Body request bukan JSON yang valid.', 400, cors)
  }
  if (!payload || typeof payload !== 'object' || !('action' in payload)) {
    return error('Kolom "action" wajib diisi.', 400, cors)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return error('Sesi tidak valid. Silakan login ulang.', 401, cors)
  }
  const jwt = authHeader.replace('Bearer ', '')

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!serviceKey || !supabaseUrl) {
    console.error('[manage-user] secrets platform tidak lengkap: SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL')
    return error('Layanan belum terkonfigurasi dengan benar. Hubungi admin.', 500, cors)
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const verifier = createClient(supabaseUrl, anonKey || serviceKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: userData, error: userErr } = await verifier.auth.getUser(jwt)
  if (userErr || !userData.user) return error('Sesi tidak valid atau sudah kedaluwarsa. Silakan login ulang.', 401, cors)

  const { data: profile } = await admin
    .from('profiles')
    .select('role, is_active, username')
    .eq('id', userData.user.id)
    .single()
  if (!profile || profile.role !== 'admin' || !profile.is_active) {
    return error('Hanya admin yang diizinkan.', 403, cors)
  }

  try {
    switch (payload.action) {
      case 'ping':
        return json({ ok: true, version: 1 }, 200, cors)

      case 'create_user': {
        const { username, password, full_name, role } = payload
        if (!username || !password || !full_name || !role) {
          return error('username, password, full_name, role wajib diisi.', 400, cors)
        }
        if (password.length < 8) return error('Password minimal 8 karakter.', 400, cors)
        if (!/^[a-zA-Z0-9._-]{3,30}$/.test(username)) {
          return error('Username hanya boleh huruf, angka, titik, garis bawah/strip (3-30 karakter).', 400, cors)
        }

        const uname = username.toLowerCase()
        const email = `${uname}@${AUTH_DOMAIN}`

        const { data: dupProfile } = await admin
          .from('profiles')
          .select('id')
          .ilike('username', uname)
          .maybeSingle()
        if (dupProfile) return error(`Username "${uname}" sudah digunakan.`, 400, cors)

        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { username: uname, full_name, role },
        })
        if (createErr) return error(createErr.message, 400, cors)

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
          if (ins.error) return error(ins.error.message, 400, cors)
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
          if (ins.error) return error(ins.error.message, 400, cors)
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

        return json({ ok: true, user_id: uid, email }, 200, cors)
      }

      case 'update_user': {
        const { user_id, full_name, is_active } = payload
        if (!user_id) return error('user_id wajib.', 400, cors)
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
          if (r.error) return error(r.error.message, 400, cors)
        }
        return json({ ok: true }, 200, cors)
      }

      case 'reset_password': {
        const { user_id, new_password } = payload
        if (!user_id || !new_password) return error('user_id & new_password wajib.', 400, cors)
        if (new_password.length < 8) return error('Password minimal 8 karakter.', 400, cors)
        const { error: resetErr } = await admin.auth.admin.updateUserById(user_id, {
          password: new_password,
        })
        if (resetErr) return error(resetErr.message, 400, cors)
        return json({ ok: true }, 200, cors)
      }

      case 'delete_user': {
        const { user_id } = payload
        if (!user_id) return error('user_id wajib.', 400, cors)
        if (user_id === userData.user.id) return error('Tidak dapat menghapus akun sendiri.', 400, cors)
        const { error: delErr } = await admin.auth.admin.deleteUser(user_id)
        if (delErr) return error(delErr.message, 400, cors)
        return json({ ok: true }, 200, cors)
      }

      default:
        return error('Unknown action', 400, cors)
    }
  } catch (e) {
    return error(e instanceof Error ? e.message : 'Unexpected error', 500, cors)
  }
}

Deno.serve(alwaysIncludeCors(handle))
