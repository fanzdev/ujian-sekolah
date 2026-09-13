import { Award, Crown, Medal, TrendingUp, Users } from 'lucide-react'
import { useAsync } from '@/hooks/useAsync'
import { getExamClassRanking } from '@/services/attempts.service'
import { formatNumber } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { cn } from '@/lib/utils'

export function ClassRanking({ examId, examTitle }: { examId: string; examTitle: string }) {
  const query = useAsync(() => getExamClassRanking(examId), [examId])

  if (query.loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }
  if (query.error) return <ErrorState message={String(query.error)} onRetry={query.reload} />

  const rows = query.data ?? []
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-6 w-6" />}
        title="Belum ada peringkat"
        description="Belum ada teman sekelas yang mengumpulkan ujian ini, atau nilai belum dinilai."
      />
    )
  }

  const me = rows.find((r) => r.is_me)
  const top3 = rows.slice(0, 3)

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-primary-100 bg-gradient-to-br from-primary-50/80 to-white p-4 dark:border-white/10 dark:from-white/[0.04] dark:to-transparent">
        <p className="text-xs font-bold uppercase tracking-wide text-primary-600 dark:text-primary-300">Mata Pelajaran</p>
        <p className="mt-1 text-sm font-bold leading-snug text-slate-900 dark:text-white">{examTitle}</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <StatMini label="Peserta Kelas" value={String(rows.length)} />
          <StatMini label="Posisi Kamu" value={me ? `#${me.rank}` : '-'} tone={me && me.rank <= 3 ? 'green' : 'slate'} highlight={!!me} />
          <StatMini label="Nilai Kamu" value={me?.final_score !== null && me?.final_score !== undefined ? formatNumber(Number(me.final_score), 1) : me ? formatNumber(Number(me.objective_score), 1) : '-'} />
        </div>
        {me && (
          <div className="mt-3 rounded-xl bg-white px-3 py-2.5 text-xs leading-relaxed text-slate-600 shadow-sm dark:bg-white/[0.06] dark:text-slate-300">
            {me.rank === 1 ? (
              <span className="flex items-center gap-1.5 font-bold text-amber-600">
                <Crown className="h-4 w-4" /> Luar biasa! Kamu peringkat #1 di kelas untuk ujian ini.
              </span>
            ) : me.rank <= 3 ? (
              <span className="flex items-center gap-1.5 font-semibold text-emerald-600">
                <Medal className="h-4 w-4" /> Hebat! Kamu masuk 3 besar di kelas (peringkat #{me.rank}).
              </span>
            ) : (
              <span>
                Kamu peringkat <strong>#{me.rank}</strong> dari <strong>{rows.length}</strong> teman sekelas. Terus tingkatkan!
              </span>
            )}
          </div>
        )}
      </div>

      {top3.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {top3.map((r) => (
            <div
              key={r.student_id}
              className={cn(
                'relative overflow-hidden rounded-2xl border p-3 text-center',
                r.rank === 1
                  ? 'border-amber-200 bg-gradient-to-br from-amber-50 to-white dark:border-amber-900/30 dark:from-amber-500/10 dark:to-transparent'
                  : r.rank === 2
                    ? 'border-slate-200 bg-gradient-to-br from-slate-50 to-white dark:border-white/10 dark:from-white/[0.04]'
                    : 'border-orange-200 bg-gradient-to-br from-orange-50 to-white dark:border-orange-900/30 dark:from-orange-500/10',
                r.is_me && 'ring-2 ring-primary-500/30',
              )}
            >
              <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full text-xs font-black text-white shadow-sm" style={{ background: r.rank === 1 ? '#f59e0b' : r.rank === 2 ? '#94a3b8' : '#ea580c' }}>
                {r.rank}
              </div>
              <p className="mt-2 truncate text-xs font-bold leading-tight text-slate-900 dark:text-white">{r.student_name}</p>
              <p className="truncate text-[10px] text-slate-400">{r.class_name ?? ''}</p>
              <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">{r.final_score !== null ? formatNumber(Number(r.final_score), 1) : formatNumber(Number(r.objective_score), 1)}</p>
              <p className="text-[10px] text-slate-400">
                {r.correct_count} benar · {r.wrong_count} salah
              </p>
              {r.is_me && <Badge tone="blue" className="mt-1 !text-[10px]">Kamu</Badge>}
            </div>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10">
        <div className="max-h-80 overflow-y-auto scrollbar-thin">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400 dark:bg-slate-900">
              <tr>
                <th className="w-10 px-2 py-2 text-center">#</th>
                <th className="px-2 py-2 text-left">Nama</th>
                <th className="px-2 py-2 text-center">Nilai</th>
                <th className="px-2 py-2 text-center">Benar</th>
                <th className="hidden sm:table-cell px-2 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {rows.map((r) => (
                <tr key={r.student_id} className={cn('hover:bg-slate-50/60 dark:hover:bg-white/[0.03]', r.is_me && 'bg-primary-50/60 dark:bg-primary-500/10 font-semibold')}>
                  <td className="px-2 py-2 text-center">
                    <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold', r.rank === 1 ? 'bg-amber-100 text-amber-700' : r.rank === 2 ? 'bg-slate-100 text-slate-600' : r.rank === 3 ? 'bg-orange-100 text-orange-700' : 'bg-slate-50 text-slate-400 dark:bg-white/10', r.is_me && 'ring-1 ring-primary-500/30')}>
                      {r.rank}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium text-slate-800 dark:text-white">{r.student_name}</span>
                      {r.is_me && <Badge tone="blue" className="!px-1.5 !py-0 !text-[10px]">Kamu</Badge>}
                    </div>
                    <span className="text-[10px] text-slate-400">{r.nis ? `NIS ${r.nis}` : r.class_name ?? ''}</span>
                  </td>
                  <td className="px-2 py-2 text-center font-bold tabular-nums text-slate-900 dark:text-white">
                    {r.final_score !== null ? formatNumber(Number(r.final_score), 1) : formatNumber(Number(r.objective_score), 1)}
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums text-slate-600 dark:text-slate-300">
                    {r.correct_count}/{r.total_questions}
                  </td>
                  <td className="hidden sm:table-cell px-2 py-2 text-center">
                    {r.passed === true ? <Badge tone="green">Lulus</Badge> : r.passed === false ? <Badge tone="red">Remedial</Badge> : <span className="text-[11px] text-slate-300">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
        <TrendingUp className="h-3 w-3" /> Peringkat dihitung khusus untuk teman sekelas pada mata pelajaran ini. Update otomatis setelah nilai essay dinilai guru.
      </p>
    </div>
  )
}

function StatMini({ label, value, tone = 'slate', highlight }: { label: string; value: string; tone?: 'slate' | 'green'; highlight?: boolean }) {
  return (
    <div className={cn('rounded-xl bg-white px-2 py-2.5 shadow-sm dark:bg-white/[0.06]', highlight && 'ring-1 ring-primary-200 dark:ring-white/10')}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={cn('mt-0.5 text-base font-black', tone === 'green' ? 'text-emerald-600' : 'text-slate-900 dark:text-white')}>{value}</p>
    </div>
  )
}

export function RankingPreviewBadge({ examId }: { examId: string }) {
  const query = useAsync(() => getExamClassRanking(examId), [examId])
  const rows = query.data ?? []
  const me = rows.find((r) => r.is_me)
  if (query.loading || !me || rows.length === 0) return null
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold', me.rank === 1 ? 'bg-amber-100 text-amber-700' : me.rank <= 3 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300')}>
      {me.rank === 1 ? <Crown className="h-3 w-3" /> : me.rank <= 3 ? <Award className="h-3 w-3" /> : <Users className="h-3 w-3" />} Peringkat #{me.rank} di kelas ({rows.length} peserta)
    </span>
  )
}
