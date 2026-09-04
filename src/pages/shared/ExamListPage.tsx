import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Plus, Pencil, Trash2, Users, PlayCircle, CalendarClock } from 'lucide-react'
import { useAsync, useDebounce, useDocumentTitle } from '@/hooks/useAsync'
import { useToast } from '@/hooks/useToast'
import { useConfirm } from '@/hooks/useConfirm'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/FormControls'
import { Select } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback'
import { listExams, deleteExam, updateExam } from '@/services/exams.service'
import { formatDateTime } from '@/lib/datetime'
import { EXAM_STATUS_LABELS } from '@/lib/constants'
import type { Exam } from '@/types/models'

const STATUS_TONES: Record<string, 'gray' | 'green' | 'amber' | 'red'> = {
  draft: 'amber',
  published: 'green',
  completed: 'gray',
  cancelled: 'red',
}

function examPhase(exam: Exam): 'upcoming' | 'ongoing' | 'ended' {
  const now = Date.now()
  if (now < new Date(exam.starts_at).getTime()) return 'upcoming'
  if (now > new Date(exam.ends_at).getTime()) return 'ended'
  return 'ongoing'
}

export default function ExamListPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const debounced = useDebounce(search)
  useDocumentTitle('Ujian')

  const query = useAsync(
    () => listExams({ search: debounced || undefined, status: statusFilter || undefined, pageSize: 100 }),
    [debounced, statusFilter],
  )
  const toast = useToast()
  const confirmDialog = useConfirm()

  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />

  const exams = query.data?.rows ?? []

  const handlePublishToggle = async (exam: Exam) => {
    const publishing = exam.status !== 'published'
    if (publishing) {
      try {
        const { supabase } = await import('@/services/client')
        const [qRes, pRes, tRes] = await Promise.all([
          supabase.from('exam_questions').select('question_id', { count: 'exact', head: true }).eq('exam_id', exam.id),
          supabase.from('exam_participants').select('student_id', { count: 'exact', head: true }).eq('exam_id', exam.id).eq('is_removed', false),
          supabase.from('exam_targets').select('id', { count: 'exact', head: true }).eq('exam_id', exam.id),
        ])
        const hasQuestions = (qRes.count ?? 0) > 0
        const participants = pRes.count ?? 0
        const targets = tRes.count ?? 0
        if (!hasQuestions) {
          toast.error('Ujian belum memiliki soal. Tambahkan soal terlebih dahulu sebelum diaktifkan.')
          return
        }
        if (participants === 0 && targets === 0) {
          const proceed = await confirmDialog.confirm({
            title: 'Ujian Belum Ada Peserta',
            message: 'Ujian ini belum memiliki target kelas/jurusan atau peserta. Jika diaktifkan, tidak ada siswa yang bisa melihatnya. Tetap aktifkan?',
            confirmText: 'Tetap Aktifkan',
          })
          if (!proceed) return
        }
      } catch {
        // jika cek gagal, tetap lanjutkan konfirmasi publish
      }
    }
    const ok = await confirmDialog.confirm({
      title: publishing ? 'Aktifkan Ujian?' : 'Nonaktifkan Ujian?',
      message: publishing
        ? 'Siswa yang terdaftar akan dapat melihat dan mengerjakan ujian ini sesuai jadwal.'
        : 'Siswa tidak akan bisa memulai ujian ini. Attempt yang sedang berlangsung tidak terpengaruh.',
      confirmText: publishing ? 'Aktifkan' : 'Nonaktifkan',
    })
    if (!ok) return
    try {
      await updateExam(exam.id, { status: publishing ? 'published' : exam.status === 'published' ? 'draft' : exam.status })
      toast.success(publishing ? 'Ujian diaktifkan.' : 'Ujian dinonaktifkan.')
      query.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memperbarui status.')
    }
  }

  const handleComplete = async (exam: Exam) => {
    const ok = await confirmDialog.confirm({
      title: 'Tandai Selesai?',
      message: 'Ujian ditandai selesai dan tidak dapat dikerjakan lagi.',
      confirmText: 'Tandai Selesai',
    })
    if (!ok) return
    try {
      await updateExam(exam.id, { status: 'completed' })
      toast.success('Ujian ditandai selesai.')
      query.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal.')
    }
  }

  return (
    <>
      <PageHeader
        title="Daftar Ujian"
        subtitle="Buat, atur peserta, dan pantau pelaksanaan ujian"
        icon={<FileText className="h-5 w-5" />}
        actions={
          <Link to="./new">
            <Button icon={<Plus className="h-4 w-4" />}>Buat Ujian</Button>
          </Link>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <SearchInput placeholder="Cari nama ujian..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select
            className="w-full sm:w-44"
            placeholder="Semua Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={Object.entries(EXAM_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
          />
        </div>

        {query.loading ? (
          <TableSkeleton cols={5} />
        ) : exams.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title="Belum ada ujian"
            description="Buat ujian pertama Anda, pilih soal dari bank, tentukan jadwal & peserta."
            action={
              <Link to="./new">
                <Button size="sm" icon={<Plus className="h-4 w-4" />}>Buat Ujian</Button>
              </Link>
            }
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {exams.map((exam) => {
              const phase = examPhase(exam)
              return (
                <div key={exam.id} className="flex flex-wrap items-center gap-4 px-4 py-4 transition-colors hover:bg-slate-50/70 sm:px-5 dark:hover:bg-slate-800 dark:bg-slate-800 dark:text-slate-200">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                    phase === 'ongoing' && exam.status === 'published'
                      ? 'bg-emerald-50 text-emerald-600 animate-pulse-soft'
                      : phase === 'upcoming'
                        ? 'bg-sky-50 text-sky-600'
                        : 'bg-slate-100 text-slate-400'
                  }`}>
                    {phase === 'ongoing' ? <PlayCircle className="h-5 w-5" /> : <CalendarClock className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`./${exam.id}/edit`} className="truncate text-sm font-semibold text-slate-800 hover:text-primary-600 dark:hover:text-primary-300">
                        {exam.title}
                      </Link>
                      <Badge tone={STATUS_TONES[exam.status]}>{EXAM_STATUS_LABELS[exam.status]}</Badge>
                      {exam.status === 'published' && Number(exam.total_points) === 0 && (
                        <Badge tone="red">Tanpa Soal</Badge>
                      )}
                    </div>
                    <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400">
                      <span>{exam.subjects?.name ?? 'Tanpa mapel'}</span>
                      <span>{formatDateTime(exam.starts_at)}</span>
                      <span>→ {formatDateTime(exam.ends_at)}</span>
                      <span>{exam.duration_minutes} menit</span>
                      <span>{exam.total_points} poin</span>
                    </p>
                    {exam.status === 'published' && Number(exam.total_points) === 0 && (
                      <p className="mt-1 text-xs font-medium text-rose-600">Ujian aktif tanpa soal — siswa tidak akan melihatnya. Tambahkan soal.</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <Link to={`./${exam.id}/participants`} title="Peserta & monitoring">
                      <Button variant="outline" size="sm" icon={<Users className="h-3.5 w-3.5" />}>Peserta</Button>
                    </Link>
                    {exam.status !== 'published' && exam.status !== 'completed' && (
                      <Button variant="primary" size="sm" onClick={() => handlePublishToggle(exam)}>Aktifkan</Button>
                    )}
                    {exam.status === 'published' && (
                      <>
                        <Button variant="secondary" size="sm" onClick={() => handlePublishToggle(exam)}>Nonaktifkan</Button>
                        {phase === 'ended' && (
                          <Button variant="outline" size="sm" onClick={() => handleComplete(exam)}>Selesai</Button>
                        )}
                      </>
                    )}
                    <Link to={`./${exam.id}/edit`} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-500/10 dark:hover:text-sky-400" title="Ubah">
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <button
                      onClick={async () => {
                        const ok = await confirmDialog.confirm({
                          title: 'Hapus Ujian?',
                          message: `"${exam.title}" beserta seluruh attempt & hasilnya akan terhapus permanen.`,
                          danger: true,
                          confirmText: 'Hapus',
                        })
                        if (!ok) return
                        try {
                          await deleteExam(exam.id)
                          toast.success('Ujian dihapus.')
                          query.reload()
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : 'Gagal menghapus ujian.')
                        }
                      }}
                      className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                      title="Hapus"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </>
  )
}
