import { useState, useEffect } from 'react'
import { CalendarDays, Plus, Pencil, Trash2, BookOpen, User, School } from 'lucide-react'
import { useAsync, useDocumentTitle } from '@/hooks/useAsync'
import { useToast } from '@/hooks/useToast'
import { useConfirm } from '@/hooks/useConfirm'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import {
  listSchedules, createSchedule, updateSchedule, deleteSchedule,
  dayName, formatTime, timeToMinutes, type Schedule,
} from '@/services/schedules.service'
import { supabase } from '@/services/client'
import { friendlyError } from '@/lib/errors'
import { cn } from '@/lib/utils'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']

export default function AdminSchedulePage() {
  useDocumentTitle('Kelola Jadwal')
  const toast = useToast()
  const confirmDialog = useConfirm()
  const [editing, setEditing] = useState<Schedule | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const query = useAsync(() => listSchedules(), [formOpen])

  const [classes, setClasses] = useState<{ id: string; name: string }[]>([])
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([])
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const [c, t, s] = await Promise.all([
          supabase.from('classes').select('id, name').order('name'),
          supabase.from('teachers').select('id, profiles(full_name)').order('id'),
          supabase.from('subjects').select('id, name').order('name'),
        ])
        if (!active) return
        setClasses((c.data as { id: string; name: string }[]) ?? [])
        setTeachers((t.data as unknown as { id: string; profiles?: { full_name: string } }[])?.map((x) => ({ id: x.id, name: x.profiles?.full_name ?? '' })) ?? [])
        setSubjects((s.data as { id: string; name: string }[]) ?? [])
      } catch { /* ignore */ }
    }
    void load()
    return () => { active = false }
  }, [])

  const handleDelete = async (id: string, title: string) => {
    const ok = await confirmDialog.confirm({
      title: 'Hapus Jadwal?',
      message: `Jadwal "${title}" akan dihapus permanen.`,
      danger: true,
      confirmText: 'Hapus',
    })
    if (!ok) return
    try {
      await deleteSchedule(id)
      toast.success('Jadwal dihapus.')
      query.reload()
    } catch (err) {
      toast.error(friendlyError(err))
    }
  }

  const handleSaved = () => {
    setFormOpen(false)
    setEditing(null)
    query.reload()
  }

  const schedules = query.data ?? []
  const grouped: Record<number, Schedule[]> = {}
  for (const s of schedules) {
    if (!grouped[s.day_of_week]) grouped[s.day_of_week] = []
    grouped[s.day_of_week].push(s)
  }
  for (const key of Object.keys(grouped)) {
    grouped[Number(key)].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
  }

  const dayTabs = [1, 2, 3, 4, 5, 6, 0]
  const activeDay = selectedDay ?? dayTabs.find((d) => grouped[d]?.length) ?? 1

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Kelola Jadwal"
        subtitle="Atur jadwal pelajaran untuk siswa dan guru"
        icon={<CalendarDays className="h-5 w-5" />}
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setFormOpen(true) }}>
            Tambah Jadwal
          </Button>
        }
      />

      {query.loading ? (
        <div className="flex justify-center py-12"><Spinner className="h-6 w-6" /></div>
      ) : query.error ? (
        <ErrorState message={query.error} onRetry={query.reload} />
      ) : schedules.length === 0 ? (
        <EmptyState
          title="Belum ada jadwal"
          description="Klik tombol Tambah Jadwal untuk membuat jadwal pertama."
          action={<Button onClick={() => setFormOpen(true)}>Tambah Jadwal</Button>}
        />
      ) : (
        <>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
            {dayTabs.map((dow) => {
              const count = (grouped[dow] ?? []).length
              return (
                <button
                  key={dow}
                  onClick={() => setSelectedDay(dow)}
                  className={cn(
                    'flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-all',
                    activeDay === dow
                      ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/30'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
                  )}
                >
                  {dayName(dow)}
                  {count > 0 && (
                    <span className={cn(
                      'ml-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px]',
                      activeDay === dow ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-700',
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="space-y-3">
            {(grouped[activeDay] ?? []).length === 0 ? (
              <Card>
                <CardBody className="py-8 text-center text-sm text-slate-400">
                  Tidak ada jadwal untuk hari {dayName(activeDay)}.
                </CardBody>
              </Card>
            ) : (
              (grouped[activeDay] ?? []).map((s) => (
                <div key={s.id} className="card animate-fade-in overflow-hidden">
                  <div className="flex">
                    <div className="w-1.5 shrink-0" style={{ backgroundColor: s.color || '#3b82f6' }} />
                    <div className="flex-1 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{s.title}</h3>
                        <div className="flex items-center gap-1">
                          <Badge tone="blue" className="!text-[10px]">
                            {formatTime(s.start_time)} - {formatTime(s.end_time)}
                          </Badge>
                          <button onClick={() => { setEditing(s); setFormOpen(true) }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-sky-600">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => void handleDelete(s.id, s.title)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {s.description && <p className="mt-1 text-xs text-slate-500">{s.description}</p>}
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                        {s.subjects?.name && <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" /> {s.subjects.name}</span>}
                        {s.teachers?.profiles?.full_name && <span className="flex items-center gap-1"><User className="h-3 w-3" /> {s.teachers.profiles.full_name}</span>}
                        {s.classes?.name && <span className="flex items-center gap-1"><School className="h-3 w-3" /> {s.classes.name}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      <ScheduleFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null) }}
        onSaved={handleSaved}
        initial={editing}
        classes={classes}
        teachers={teachers}
        subjects={subjects}
      />
    </div>
  )
}

function ScheduleFormModal({
  open, onClose, onSaved, initial, classes, teachers, subjects,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  initial: Schedule | null
  classes: { id: string; name: string }[]
  teachers: { id: string; name: string }[]
  subjects: { id: string; name: string }[]
}) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [subjectId, setSubjectId] = useState(initial?.subject_id ?? '')
  const [teacherId, setTeacherId] = useState(initial?.teacher_id ?? '')
  const [classId, setClassId] = useState(initial?.class_id ?? '')
  const [dayOfWeek, setDayOfWeek] = useState(String(initial?.day_of_week ?? 1))
  const [startTime, setStartTime] = useState(initial?.start_time?.slice(0, 5) ?? '07:00')
  const [endTime, setEndTime] = useState(initial?.end_time?.slice(0, 5) ?? '08:30')
  const [color, setColor] = useState(initial?.color ?? '#3b82f6')

  useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? '')
      setDescription(initial?.description ?? '')
      setSubjectId(initial?.subject_id ?? '')
      setTeacherId(initial?.teacher_id ?? '')
      setClassId(initial?.class_id ?? '')
      setDayOfWeek(String(initial?.day_of_week ?? 1))
      setStartTime(initial?.start_time?.slice(0, 5) ?? '07:00')
      setEndTime(initial?.end_time?.slice(0, 5) ?? '08:30')
      setColor(initial?.color ?? '#3b82f6')
    }
  }, [open, initial])

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Judul wajib diisi.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        subject_id: subjectId || undefined,
        teacher_id: teacherId || undefined,
        class_id: classId || undefined,
        day_of_week: Number(dayOfWeek),
        start_time: startTime,
        end_time: endTime,
        color,
      }
      if (initial) {
        await updateSchedule(initial.id, payload)
        toast.success('Jadwal diperbarui.')
      } else {
        await createSchedule(payload)
        toast.success('Jadwal ditambahkan.')
      }
      onSaved()
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Ubah Jadwal' : 'Tambah Jadwal'} size="md">
      <div className="space-y-4 px-6 py-5">
        <Input label="Judul Jadwal" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Matematika Kelas X" required />
        <Input label="Deskripsi (opsional)" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Catatan tambahan" />

        <div className="grid grid-cols-2 gap-4">
          <Select label="Mata Pelajaran" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} options={[{ value: '', label: '— Pilih —' }, ...subjects.map((s) => ({ value: s.id, label: s.name }))]} />
          <Select label="Guru" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} options={[{ value: '', label: '— Pilih —' }, ...teachers.map((t) => ({ value: t.id, label: t.name }))]} />
        </div>

        <Select label="Kelas" value={classId} onChange={(e) => setClassId(e.target.value)} options={[{ value: '', label: '— Semua Kelas —' }, ...classes.map((c) => ({ value: c.id, label: c.name }))]} />

        <div className="grid grid-cols-2 gap-4">
          <Select label="Hari" value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)} options={[1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: String(d), label: dayName(d) }))} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Mulai" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            <Input label="Selesai" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label-base">Warna</label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn(
                  'h-7 w-7 rounded-full transition-transform',
                  color === c ? 'scale-125 ring-2 ring-offset-2 ring-slate-400' : 'hover:scale-110',
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/40">
        <Button variant="ghost" onClick={onClose}>Batal</Button>
        <Button onClick={handleSave} loading={saving}>{initial ? 'Simpan' : 'Tambah'}</Button>
      </div>
    </Modal>
  )
}
