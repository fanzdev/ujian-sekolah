import { useState } from 'react'
import { CalendarDays, BookOpen, User } from 'lucide-react'
import { useAsync, useDocumentTitle } from '@/hooks/useAsync'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { listMyStudentSchedule, dayName, dayShort, formatTime, timeToMinutes, type Schedule } from '@/services/schedules.service'
import { cn } from '@/lib/utils'

const DAY_COLORS: Record<number, string> = {
  0: 'bg-rose-50 text-rose-700 ring-rose-200',
  1: 'bg-blue-50 text-blue-700 ring-blue-200',
  2: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  3: 'bg-amber-50 text-amber-700 ring-amber-200',
  4: 'bg-violet-50 text-violet-700 ring-violet-200',
  5: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  6: 'bg-pink-50 text-pink-700 ring-pink-200',
}

export default function StudentSchedulePage() {
  useDocumentTitle('Jadwal Pelajaran')
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const query = useAsync(() => listMyStudentSchedule(), [])

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
        title="Jadwal Pelajaran"
        subtitle="Lihat jadwal harian dan mingguan Anda"
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

      {schedules.length > 0 && (
        <Card className="mb-4">
          <CardBody className="p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Ringkasan Mingguan</p>
            <div className="mt-3 grid grid-cols-7 gap-1.5">
              {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
                const count = (grouped[dow] ?? []).length
                return (
                  <div key={dow} className="text-center">
                    <p className="text-[10px] font-medium text-slate-400">{dayShort(dow)}</p>
                    <div className={cn(
                      'mt-1 flex h-8 w-full items-center justify-center rounded-lg text-xs font-bold',
                      count > 0 ? DAY_COLORS[dow] ?? 'bg-slate-100 text-slate-600' : 'bg-slate-50 text-slate-300',
                    )}>
                      {count}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardBody>
        </Card>
      )}

      {query.loading ? (
        <div className="flex justify-center py-12"><Spinner className="h-6 w-6" /></div>
      ) : todaySchedule.length === 0 ? (
        <EmptyState
          title="Tidak ada jadwal"
          description={`Tidak ada jadwal untuk hari ${dayName(activeDay)}.`}
        />
      ) : (
        <div className="space-y-3">
          {todaySchedule.map((s) => (
            <ScheduleCard key={s.id} schedule={s} />
          ))}
        </div>
      )}
    </div>
  )
}

function ScheduleCard({ schedule: s }: { schedule: Schedule }) {
  return (
    <div className="card animate-fade-in overflow-hidden">
      <div className="flex">
        <div className="w-1.5 shrink-0" style={{ backgroundColor: s.color || '#3b82f6' }} />
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{s.title}</h3>
            <Badge tone="blue" className="!text-[10px]">
              {formatTime(s.start_time)} - {formatTime(s.end_time)}
            </Badge>
          </div>
          {s.description && (
            <p className="mt-1 text-xs text-slate-500">{s.description}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
            {s.subjects?.name && (
              <span className="flex items-center gap-1">
                <BookOpen className="h-3 w-3" /> {s.subjects.name}
              </span>
            )}
            {s.teachers?.profiles?.full_name && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" /> {s.teachers.profiles.full_name}
              </span>
            )}
            {s.classes?.name && (
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" /> {s.classes.name}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
