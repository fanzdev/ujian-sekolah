import { supabase } from './client'

export interface Schedule {
  id: string
  title: string
  description: string | null
  subject_id: string | null
  teacher_id: string | null
  class_id: string | null
  day_of_week: number
  start_time: string
  end_time: string
  start_date: string | null
  end_date: string | null
  color: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  subjects?: { name: string } | null
  teachers?: { profiles?: { full_name: string } | null } | null
  classes?: { name: string } | null
}

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const DAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

export function dayName(dow: number): string {
  return DAY_NAMES[dow] ?? ''
}

export function dayShort(dow: number): string {
  return DAY_SHORT[dow] ?? ''
}

export function formatTime(t: string): string {
  const [h, m] = t.split(':')
  return `${h}:${m}`
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export async function listSchedules(filters?: {
  class_id?: string
  teacher_id?: string
  day_of_week?: number
}): Promise<Schedule[]> {
  let q = supabase
    .from('schedules')
    .select('*, subjects(name), teachers(profiles(full_name)), classes(name)')
    .eq('is_active', true)
    .order('day_of_week')
    .order('start_time')

  if (filters?.class_id) q = q.eq('class_id', filters.class_id)
  if (filters?.teacher_id) q = q.eq('teacher_id', filters.teacher_id)
  if (filters?.day_of_week !== undefined) q = q.eq('day_of_week', filters.day_of_week)

  const { data, error } = await q
  if (error) throw error
  return (data as Schedule[]) ?? []
}

export async function listMyStudentSchedule(): Promise<Schedule[]> {
  const { data: sessionData } = await supabase.auth.getSession()
  const uid = sessionData.session?.user?.id
  if (!uid) return []

  const { data: student } = await supabase
    .from('students')
    .select('class_id')
    .eq('profile_id', uid)
    .maybeSingle()

  if (!student?.class_id) return []

  return listSchedules({ class_id: student.class_id })
}

export async function listMyTeacherSchedule(): Promise<Schedule[]> {
  const { data: sessionData } = await supabase.auth.getSession()
  const uid = sessionData.session?.user?.id
  if (!uid) return []

  const { data: teacher } = await supabase
    .from('teachers')
    .select('id')
    .eq('profile_id', uid)
    .maybeSingle()

  if (!teacher?.id) return []

  return listSchedules({ teacher_id: teacher.id })
}

export async function createSchedule(input: {
  title: string
  description?: string
  subject_id?: string
  teacher_id?: string
  class_id?: string
  day_of_week: number
  start_time: string
  end_time: string
  start_date?: string
  end_date?: string
  color?: string
}): Promise<Schedule> {
  const { data: sessionData } = await supabase.auth.getSession()
  const uid = sessionData.session?.user?.id

  const { data, error } = await supabase
    .from('schedules')
    .insert({
      title: input.title,
      description: input.description || null,
      subject_id: input.subject_id || null,
      teacher_id: input.teacher_id || null,
      class_id: input.class_id || null,
      day_of_week: input.day_of_week,
      start_time: input.start_time,
      end_time: input.end_time,
      start_date: input.start_date || null,
      end_date: input.end_date || null,
      color: input.color || '#3b82f6',
      is_active: true,
      created_by: uid,
    })
    .select('*, subjects(name), teachers(profiles(full_name)), classes(name)')
    .single()

  if (error) throw error
  return data as Schedule
}

export async function updateSchedule(id: string, input: Partial<{
  title: string
  description: string
  subject_id: string
  teacher_id: string
  class_id: string
  day_of_week: number
  start_time: string
  end_time: string
  start_date: string
  end_date: string
  color: string
  is_active: boolean
}>): Promise<Schedule> {
  const { data, error } = await supabase
    .from('schedules')
    .update(input)
    .eq('id', id)
    .select('*, subjects(name), teachers(profiles(full_name)), classes(name)')
    .single()

  if (error) throw error
  return data as Schedule
}

export async function deleteSchedule(id: string): Promise<void> {
  const { error } = await supabase.from('schedules').delete().eq('id', id)
  if (error) throw error
}
