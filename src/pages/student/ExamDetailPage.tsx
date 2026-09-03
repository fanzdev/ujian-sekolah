import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, PlayCircle, Clock3, ListChecks, ShieldAlert,
  Camera, Maximize, KeyRound, AlertTriangle, Info,
} from 'lucide-react'
import { useAsync, useDocumentTitle } from '@/hooks/useAsync'
import { useToast } from '@/hooks/useToast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Checkbox } from '@/components/ui/FormControls'

import { ErrorState, Spinner } from '@/components/ui/Feedback'
import { listAvailableExams, startAttempt } from '@/services/attempts.service'
import { formatDateTime } from '@/lib/datetime'
import { friendlyError } from '@/lib/errors'

export default function ExamDetailPage() {
  const params = useParams()
  const examId = params.examId
  const navigate = useNavigate()
  const toast = useToast()
  useDocumentTitle('Detail Ujian')

  const query = useAsync(async () => {
    const exams = await listAvailableExams()
    return exams.find((e) => e.id === examId) ?? null
  }, [examId])

  const [pinOpen, setPinOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [starting, setStarting] = useState(false)

  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />
  if (query.loading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>

  const exam = query.data
  if (!exam) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-slate-400">Ujian tidak ditemukan atau bukan milik Anda.</p>
        <Link to="/student/exams" className="mt-3 inline-block text-sm font-semibold text-primary-600">Kembali ke daftar ujian</Link>
      </div>
    )
  }

  const beginFlow = () => {
    if (exam.has_pin) {
      setPinOpen(true)
    } else {
      setConfirmOpen(true)
    }
  }

  const doStart = async () => {
    setStarting(true)
    try {
      const result = await startAttempt(exam.id, pin || undefined)
      navigate(`/exam/${result.attempt_id}`, { replace: true })
    } catch (err) {
      toast.error(friendlyError(err))
      setStarting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/student/exams" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-primary-600 dark:hover:text-primary-300">
        <ArrowLeft className="h-4 w-4" /> Kembali ke daftar ujian
      </Link>

      <Card className="overflow-hidden animate-fade-in">
        <div className="bg-gradient-to-br from-primary-600 to-primary-800 px-6 py-8 text-white sm:px-8">
          <Badge tone="sky" className="!bg-white/15 !text-white !ring-white/30">
            {exam.subject_name ?? 'Ujian'}
          </Badge>
          <h1 className="mt-3 text-xl leading-snug font-extrabold tracking-tight sm:text-2xl">{exam.title}</h1>
          {exam.teacher_name && <p className="mt-1 text-sm text-white/70">Pengawas: {exam.teacher_name}</p>}
        </div>

        <div className="space-y-6 p-6 sm:p-8">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-4 text-sm">
            <Detail label="Dibuka" value={formatDateTime(exam.starts_at)} icon={<Clock3 className="h-4 w-4" />} />
            <Detail label="Ditutup" value={formatDateTime(exam.ends_at)} icon={<Clock3 className="h-4 w-4" />} />
            <Detail label="Durasi Pengerjaan" value={`${exam.duration_minutes} menit`} icon={<Clock3 className="h-4 w-4" />} />
            <Detail label="Jumlah Soal" value={`${exam.total_questions} soal`} icon={<ListChecks className="h-4 w-4" />} />
            <Detail label="Percobaan Tersedia" value={`${Math.max(0, exam.max_attempts - exam.attempts_used)} dari ${exam.max_attempts}`} icon={<Info className="h-4 w-4" />} />
            {exam.passing_grade > 0 && <Detail label="KKM / Passing Grade" value={String(exam.passing_grade)} icon={<Info className="h-4 w-4" />} />}
          </dl>

          {(exam.camera_monitoring || exam.fullscreen_required || exam.violation_limit > 0) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-700">
                <ShieldAlert className="h-4 w-4" /> Aturan Integritas Ujian
              </p>
              <ul className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-amber-800/90">
                {exam.fullscreen_required && (
                  <li className="flex items-start gap-2"><Maximize className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Ujian berjalan dalam mode layar penuh. Keluar fullscreen tercatat sebagai pelanggaran.</li>
                )}
                {exam.camera_monitoring && (
                  <li className="flex items-start gap-2"><Camera className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Monitoring kamera aktif. Browser akan meminta izin kamera (opsional mengikuti pengaturan).</li>
                )}
                <li className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Batas pelanggaran: <strong>{exam.violation_limit}×</strong> (berpindah tab/menghilangkan fokus).
                  {exam.violation_limit >= 3 ? ' Pelanggaran ke-3 otomatis mengumpulkan jawaban.' : ''}
                </li>
              </ul>
            </div>
          )}

          {exam.status_for_me === 'upcoming' ? (
            <p className="rounded-xl bg-sky-50 px-4 py-3 text-center text-sm font-medium text-sky-700">
              Ujian belum dibuka. Kembali saat jadwal dimulai.
            </p>
          ) : exam.status_for_me === 'no_attempts' ? (
            <p className="rounded-xl bg-slate-100 px-4 py-3 text-center text-sm font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-200">
              Kesempatan mengerjakan sudah habis.
            </p>
          ) : exam.status_for_me === 'closed' ? (
            <p className="rounded-xl bg-slate-100 px-4 py-3 text-center text-sm font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-200">
              Periode ujian telah berakhir.
            </p>
          ) : (
            <>
              {exam.has_pin && (
                <p className="flex items-center gap-2 rounded-lg bg-slate-50 px-4 py-2.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-200">
                  <KeyRound className="h-3.5 w-3.5 shrink-0" /> Ujian ini membutuhkan PIN dari pengawas.
                </p>
              )}
              <Button size="lg" className="w-full" variant={exam.status_for_me === 'resume' ? 'danger' : 'primary'} onClick={beginFlow} icon={<PlayCircle className="h-5 w-5" />}>
                {exam.status_for_me === 'resume' ? 'Lanjutkan Pengerjaan' : 'Mulai Ujian Sekarang'}
              </Button>
              <p className="text-center text-xs text-slate-400">
                Timer mulai berjalan sejak tombol ini ditekan — pastikan koneksi stabil.
              </p>
            </>
          )}
        </div>
      </Card>

      {/* PIN modal */}
      <Modal open={pinOpen} onClose={() => setPinOpen(false)} title="Masukkan PIN Ujian" size="sm">
        <div className="space-y-4 px-6 py-5">
          <Input
            label="PIN dari Pengawas"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="••••"
            inputMode="numeric"
            autoFocus
            required
            onKeyDown={(e) => {
              if (e.key === 'Enter' && pin.length >= 3) {
                setPinOpen(false)
                setConfirmOpen(true)
              }
            }}
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:bg-slate-800 dark:text-slate-200">
          <Button variant="ghost" onClick={() => setPinOpen(false)}>Batal</Button>
          <Button disabled={pin.length < 3} onClick={() => { setPinOpen(false); setConfirmOpen(true) }}>Lanjut</Button>
        </div>
      </Modal>

      {/* Confirm modal */}
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Siap Memulai?" size="md">
        <div className="space-y-4 px-6 py-5">
          <div className="rounded-xl bg-primary-50 px-4 py-3 text-[13px] leading-relaxed text-primary-900">
            <ul className="list-disc space-y-1 pl-4">
              <li>Timer <strong>{exam.duration_minutes} menit</strong> langsung berjalan dan tidak dapat dijeda.</li>
              <li>Jawaban tersimpan otomatis; jika internet terputus, jawaban tetap aman.</li>
              <li>Pelanggaran (berpindah tab dll.) tercatat hingga batas <strong>{exam.violation_limit}</strong> kali.</li>
              <li>Kumpulkan sebelum waktu habis untuk hasil terbaik.</li>
            </ul>
          </div>
          <Checkbox
            checked={agreed}
            onChange={setAgreed}
            label={<span className="text-sm">Saya menyatakan mengerjakan secara jujur & mandiri sesuai tata tertib ujian.</span>}
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:bg-slate-800 dark:text-slate-200">
          <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Belum</Button>
          <Button disabled={!agreed} loading={starting} onClick={doStart} icon={<AlertTriangle className="hidden h-4 w-4" />}>
            Ya, Mulai Sekarang
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function Detail({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800 dark:text-slate-200">
      <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">{icon} {label}</dt>
      <dd className="mt-1 truncate text-[13px] font-bold text-slate-800">{value}</dd>
    </div>
  )
}
