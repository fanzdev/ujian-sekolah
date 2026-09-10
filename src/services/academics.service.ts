import { supabase } from './client'
import { logAudit } from './audit.service'
import type { Department, Profile, SchoolClass, Student, Subject } from '@/types/models'

export const studentSelect = `
  id, profile_id, nis, nisn, gender, birth_place, birth_date, address, phone, email,
  class_id, is_active, created_at,
  profiles(id, username, full_name, role, avatar_url, is_active),
  classes(id, name, level, departments(code, name))
`

export interface StudentInput {
  nis?: string | null
  nisn?: string | null
  gender?: 'L' | 'P' | null
  birth_place?: string | null
  birth_date?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  class_id?: string | null
  is_active?: boolean
}

export async function listStudents(params: {
  search?: string
  classId?: string
  departmentId?: string
  page?: number
  pageSize?: number
}): Promise<{ rows: Student[]; total: number }> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 25

  let builder = supabase.from('students').select(studentSelect, { count: 'exact' })

  if (params.classId) builder = builder.eq('class_id', params.classId)
  if (params.departmentId) {
    builder = builder.in(
      'class_id',
      (await supabase.from('classes').select('id').eq('department_id', params.departmentId)).data?.map((c) => c.id) ??
        ['00000000-0000-0000-0000-000000000000'],
    )
  }
  if (params.search) {
    const term = params.search.trim().replace(/,/g, '')
    if (term) {
      const { data: profs } = await supabase.from('profiles').select('id').ilike('full_name', `%${term}%`).limit(80)
      const pIds = (profs ?? []).map((p: { id: string }) => p.id)
      if (pIds.length > 0) {
        builder = builder.or(`nis.ilike.%${term}%,nisn.ilike.%${term}%,profile_id.in.(${pIds.join(',')})`)
      } else {
        builder = builder.or(`nis.ilike.%${term}%,nisn.ilike.%${term}%`)
      }
    }
  }

  const { data, error, count } = await builder
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)
  if (error) throw error
  return { rows: (data as unknown as Student[]) ?? [], total: count ?? 0 }
}

export async function createStudent(profileId: string, input: StudentInput): Promise<void> {
  const { error } = await supabase.from('students').insert({ profile_id: profileId, ...input })
  if (error) throw error
  void logAudit('CREATE_USER', 'student', profileId)
}

export async function updateStudent(id: string, input: StudentInput): Promise<void> {
  const { error } = await supabase.from('students').update(input).eq('id', id)
  if (error) throw error
  void logAudit('UPDATE_USER', 'student', id)
}

export async function deleteStudentRow(id: string): Promise<void> {
  const { data, error: fetchErr } = await supabase.from('students').select('profile_id').eq('id', id).single()
  if (fetchErr) throw fetchErr
  const pid = data?.profile_id as string | undefined
  if (pid) {
    try {
      const { deleteUser } = await import('@/services/users.service')
      await deleteUser(pid)
      return
    } catch { void 0 }
  }
  const { error: delErr } = await supabase.from('students').delete().eq('id', id)
  if (delErr) throw delErr
  if (pid) {
    try {
      await supabase.from('teacher_subjects').delete().eq('teacher_id', pid)
    } catch { void 0 }
    const { data: prof } = await supabase.from('profiles').select('username').eq('id', pid).maybeSingle()
    const oldUsername = (prof as unknown as { username?: string } | null)?.username
    if (oldUsername) {
      try {
        await supabase.from('profiles').update({ username: `${oldUsername}_deleted_${Date.now()}` }).eq('id', pid)
      } catch { void 0 }
    }
    const { error: profErr } = await supabase.from('profiles').delete().eq('id', pid)
    if (profErr) throw profErr
    void logAudit('DELETE_USER', 'student', id)
  }
}

export async function getStudentByProfile(profileId: string): Promise<Student | null> {
  const { data, error } = await supabase
    .from('students')
    .select(studentSelect)
    .eq('profile_id', profileId)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as Student) ?? null
}

export async function updateTeacherSelf(
  teacherId: string,
  fields: { phone?: string; email?: string; address?: string },
): Promise<void> {
  const { error } = await supabase.from('teachers').update(fields).eq('id', teacherId)
  if (error) throw error
}

export async function updateStudentSelfContact(
  studentId: string,
  fields: { phone?: string; address?: string },
): Promise<void> {
  const { error } = await supabase.from('students').update(fields).eq('id', studentId)
  if (error) throw error
}

export interface TeacherWithProfile {
  id: string
  profile_id: string
  nip: string | null
  phone: string | null
  email: string | null
  address: string | null
  is_active: boolean
  profiles: Partial<Profile> | null
  teacher_subjects?: { subject_id: string; subjects: Subject | Subject[] | null }[] | null
  subjects?: (Subject | null)[]
}

export async function listTeachers(params: {
  search?: string
  page?: number
  pageSize?: number
}): Promise<{ rows: TeacherWithProfile[]; total: number }> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 25

  let builder = supabase.from('teachers').select(
    `id, profile_id, nip, phone, email, address, is_active, created_at,
     profiles(id, username, full_name, role, is_active),
     teacher_subjects(subject_id, subjects(id, code, name))`,
    { count: 'exact' },
  )
  if (params.search) {
    const term = params.search.trim().replace(/,/g, '')
    if (term) {
      const { data: profs } = await supabase.from('profiles').select('id').ilike('full_name', `%${term}%`).limit(80)
      const pIds = (profs ?? []).map((p: { id: string }) => p.id)
      if (pIds.length > 0) {
        builder = builder.or(`nip.ilike.%${term}%,profile_id.in.(${pIds.join(',')})`)
      } else {
        builder = builder.or(`nip.ilike.%${term}%`)
      }
    }
  }

  const { data, error, count } = await builder
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)
  if (error) throw error

  const rows = ((data as unknown as TeacherRow[]) ?? []).map(mapTeacherRow) as unknown as TeacherWithProfile[]
  return { rows, total: count ?? 0 }
}

interface TeacherRow {
  id: string
  profile_id: string
  nip: string | null
  phone: string | null
  email: string | null
  address: string | null
  is_active: boolean
  profiles: Profile | Profile[] | null
  teacher_subjects?: { subject_id: string; subjects: Subject | Subject[] | null }[] | null
}

function mapTeacherRow(row: TeacherRow) {
  return {
    ...row,
    profiles: Array.isArray(row.profiles) ? row.profiles[0] : row.profiles,
    subjects:
      row.teacher_subjects
        ?.map((ts) => (Array.isArray(ts.subjects) ? ts.subjects[0] : ts.subjects))
        .filter(Boolean) ?? [],
  }
}

export async function setTeacherSubjects(teacherId: string, subjectIds: string[]): Promise<void> {
  await supabase.from('teacher_subjects').delete().eq('teacher_id', teacherId)
  if (subjectIds.length > 0) {
    await supabase
      .from('teacher_subjects')
      .insert(subjectIds.map((sid) => ({ teacher_id: teacherId, subject_id: sid })))
  }
}

export async function getTeacherByProfile(profileId: string): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('teachers')
    .select('id')
    .eq('profile_id', profileId)
    .maybeSingle()
  return data
}

// ---------- Departments ----------
export async function listDepartments(): Promise<Department[]> {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .order('code')
  if (error) throw error
  return (data as Department[]) ?? []
}

export async function upsertDepartment(d: Partial<Department> & { code: string; name: string }): Promise<void> {
  if (d.id) {
    const { error } = await supabase.from('departments').update(d).eq('id', d.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('departments').insert(d)
    if (error) throw error
  }
  void logAudit('CHANGE_SETTINGS', 'department', d.id ?? d.code)
}

export async function deleteDepartment(id: string): Promise<void> {
  const { error } = await supabase.from('departments').delete().eq('id', id)
  if (error) throw error
}

// ---------- Classes ----------
export interface ClassInput {
  name: string
  level: number
  department_id: string
  homeroom_teacher_id?: string | null
  is_active?: boolean
}

export async function listClasses(): Promise<SchoolClass[]> {
  const { data, error } = await supabase
    .from('classes')
    .select('*, departments(code, name)')
    .order('level')
    .order('name')
  if (error) throw error
  return (data as unknown as SchoolClass[]) ?? []
}

export async function upsertClass(c: ClassInput & { id?: string }): Promise<void> {
  const { id, ...rest } = c
  const q = id
    ? supabase.from('classes').update(rest).eq('id', id)
    : supabase.from('classes').insert(rest)
  const { error } = await q
  if (error) throw error
}

export async function deleteClass(id: string): Promise<void> {
  const { error } = await supabase.from('classes').delete().eq('id', id)
  if (error) throw error
}

// ---------- Subjects ----------
export async function listSubjects(): Promise<Subject[]> {
  const { data, error } = await supabase.from('subjects').select('*').order('name')
  if (error) throw error
  return (data as Subject[]) ?? []
}

export async function upsertSubject(s: Partial<Subject> & { code: string; name: string }): Promise<void> {
  const { id, ...rest } = s
  const q = id
    ? supabase.from('subjects').update(rest).eq('id', id)
    : supabase.from('subjects').insert(rest)
  const { error } = await q
  if (error) throw error
}

export async function deleteSubject(id: string): Promise<void> {
  const { error } = await supabase.from('subjects').delete().eq('id', id)
  if (error) throw error
}
