import { useState } from 'react'
import { CalendarDays, Clock3, BookOpen, School } from 'lucide-react'
import { useAsync, useDocumentTitle } from '@/hooks/useAsync'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { listMyTeacherSchedule, dayName, dayShort, formatTime, timeToMinutes, type Schedule } from '@/services/schedules.service'
import { cn } from '@/lib/utils'

export default function TeacherSchedulePage() {
  useDocumentTitle('Jadwal Mengajar')
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const query = useAsync(() => listMyTeacherSchedule(), [])

  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />

  const schedules = query.data ?? []
  const today = new Date().getDay()
  const activeDay = selectedDay ?? today

  const grouped: Record<number, Schedule[]> = {}
  for (const s of schedules) {
    if (!grouped[s.day_of_week]) grouped[s.day_of_week] = []
    grouped[s.day_of_week].push(s)
  }
  for (const key of Object.keys(grouped)) {
    grouped[Number(key)].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
  }

  const todaySchedule = grouped[activeDay] ?? []

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title="Jadwal Mengajar"
        subtitle="Lihat jadwal mengajar Anda"
        icon={<CalendarDays className="h-5 w-5" />}
      />

      <div className="mb-4 flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
        {[1, 2, 3, 4, 5, 6, 0].map((dow) => (
          <button
            key={dow}
            onClick={() => setSelectedDay(dow)}
            className={cn(
              'flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl text-xs font-bold transition-all',
              activeDay === dow
                ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/30'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
            )}
          >
            <span className="text-[10px] font-medium opacity-70">{dayShort(dow)}</span>
            <span className="text-lg">{dow === today ? '•' : ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][dow]}</span>
          </button>
        ))}
      </div>

      {query.loading ? (
        <div className="flex justify-center py-12"><Spinner className="h-6 w-6" /></div>
      ) : todaySchedule.length === 0 ? (
        <EmptyState
          title="Tidak ada jadwal"
          description={`Tidak ada jadwal mengajar untuk hari ${dayName(activeDay)}.`}
        />
      ) : (
        <div className="space-y-3">
          {todaySchedule.map((s) => (
            <div key={s.id} className="card animate-fade-in overflow-hidden">
              <div className="flex">
                <div className="w-1.5 shrink-0" style={{ backgroundColor: s.color || '#3b82f6' }} />
                <div className="flex-1 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{s.title}</h3>
                    <span className="flex items-center gap-1 text-xs font-semibold text-primary-600">
                      <Clock3 className="h-3 w-3" />
                      {formatTime(s.start_time)} - {formatTime(s.end_time)}
                    </span>
                  </div>
                  {s.description && <p className="mt-1 text-xs text-slate-500">{s.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                    {s.subjects?.name && (
                      <span className="flex items-center gap-1 rounded-md bg-primary-50 px-2 py-0.5 text-primary-700">
                        <BookOpen className="h-3 w-3" /> {s.subjects.name}
                      </span>
                    )}
                    {s.classes?.name && (
                      <span className="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-700">
                        <School className="h-3 w-3" /> {s.classes.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {schedules.length > 0 && (
        <div className="mt-6 card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Ringkasan Mingguan</p>
          <div className="mt-3 grid grid-cols-7 gap-1.5">
            {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
              const count = (grouped[dow] ?? []).length
              return (
                <div key={dow} className="text-center">
                  <p className="text-[10px] font-medium text-slate-400">{dayShort(dow)}</p>
                  <div className={cn(
                    'mt-1 flex h-8 w-full items-center justify-center rounded-lg text-xs font-bold',
                    count > 0 ? 'bg-primary-50 text-primary-700' : 'bg-slate-50 text-slate-300',
                  )}>
                    {count}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
