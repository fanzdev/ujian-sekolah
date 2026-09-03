import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Camera, CameraOff } from 'lucide-react'
import { useAsync } from '@/hooks/useAsync'
import { uploadMedia } from '@/services/storage.service'
import { fetchSystemSettings } from '@/services/settings.service'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import type { SubmitSummary } from '@/types/models'

export function ConnectionBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; dot: string }> = {
    idle: { label: '', cls: '', dot: '' },
    saved: { label: 'Tersimpan', cls: 'text-emerald-600 bg-emerald-50', dot: 'bg-emerald-500' },
    saving: { label: 'Menyimpan...', cls: 'text-primary-600 bg-primary-50', dot: 'bg-primary-400 animate-pulse' },
    offline: { label: 'Offline - jawaban aman', cls: 'text-amber-700 bg-amber-50 animate-pulse-soft', dot: 'bg-amber-500' },
    error: { label: 'Gagal simpan - mencoba ulang', cls: 'text-rose-600 bg-rose-50', dot: 'bg-rose-500' },
  }
  const s = map[status] ?? map.idle
  if (!s.label) return null
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}

export function ExamTimer({ seconds, compact = false }: { seconds: number | null; compact?: boolean }) {
  const danger = seconds !== null && seconds <= 60
  const warn = !danger && seconds !== null && seconds <= 300

  const h = Math.floor((seconds ?? 0) / 3600)
  const m = Math.floor(((seconds ?? 0) % 3600) / 60)
  const sec = (seconds ?? 0) % 60
  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <div
      role="timer"
      aria-live="off"
      aria-label={`Sisa waktu ${h} jam ${m} menit ${sec} detik`}
      className={`flex items-center gap-2 rounded-xl px-3 py-2 font-mono font-bold tabular-nums ${
        compact ? 'text-base' : 'text-lg sm:text-xl'
      } ${
        danger
          ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30 animate-pulse-soft'
          : warn
            ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300'
            : 'bg-slate-100 text-slate-800'
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className={compact ? 'h-4 w-4' : 'h-5 w-5'}>
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" d="M12 7v5l3 2" />
      </svg>
      {seconds === null ? '--:--' : h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`}
    </div>
  )
}

export function QuestionNavigator({
  order,
  answers,
  flagged,
  currentIndex,
  onJump,
}: {
  order: string[]
  answers: Record<string, unknown>
  flagged: Set<string>
  currentIndex: number
  onJump: (i: number) => void
}) {
  return (
    <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-10">
      {order.map((qid, i) => {
        const answered =
          answers[qid] !== null &&
          answers[qid] !== undefined &&
          (Array.isArray(answers[qid]) ? (answers[qid] as unknown[]).length > 0 : true)
        const isFlagged = flagged.has(qid)
        const isCurrent = i === currentIndex

        let cls = 'bg-white text-slate-500 border-slate-200 hover:border-primary-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600 dark:hover:border-primary-500'
        if (isCurrent) cls = 'bg-primary-600 text-white border-primary-600 ring-4 ring-primary-500/20 scale-105'
        else if (isFlagged) cls = 'bg-violet-100 text-violet-700 border-violet-300'
        else if (answered) cls = 'bg-emerald-50 text-emerald-700 border-emerald-300'

        return (
          <button
            key={qid}
            onClick={() => onJump(i)}
            aria-label={`Soal ${i + 1}${answered ? ', terjawab' : ''}${isFlagged ? ', ditandai' : ''}`}
            aria-current={isCurrent ? 'true' : undefined}
            className={`relative flex h-9 items-center justify-center rounded-lg border text-xs font-bold transition-all active:scale-95 ${cls}`}
          >
            {i + 1}
            {isFlagged && !isCurrent && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-violet-500 ring-2 ring-white dark:ring-slate-900" />}
          </button>
        )
      })}
    </div>
  )
}

export function ViolationFlash({ count, limit }: { count: number; limit: number }) {
  const remaining = limit - count
  return (
    <div className="fixed top-16 left-1/2 z-[90] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 animate-scale-in">
      <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-2xl">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:text-white">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-bold text-amber-900">Pelanggaran tercatat ({count}/{limit})</p>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
            Aktivitas meninggalkan halaman ujian terdeteksi. Sisa toleransi Anda: <strong>{Math.max(0, remaining)}</strong>.
            {remaining <= 0 ? ' Jawaban akan dikumpulkan otomatis!' : ' Tetap fokus pada halaman ujian.'}
          </p>
        </div>
      </div>
    </div>
  )
}

export function CameraMonitor() {
  const [status, setStatus] = useState<'idle' | 'granted' | 'denied' | 'unsupported'>('idle')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const settingsQuery = useAsync(() => fetchSystemSettings(), [])
  const snapshotsEnabled = settingsQuery.data?.security?.camera_snapshots_enabled === true

  useEffect(() => {
    let cancelled = false
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported')
      return
    }
    navigator.mediaDevices
      .getUserMedia({ video: { width: 320, height: 240 }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        setStatus('granted')
      })
      .catch(() => setStatus('denied'))
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // periodic snapshot upload when enabled by admin
  useEffect(() => {
    if (!snapshotsEnabled || status !== 'granted') return
    const interval = window.setInterval(async () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 160
        canvas.height = 120
        canvas.getContext('2d')?.drawImage(videoRef.current!, 0, 0, 160, 120)
        canvas.toBlob(
          async (blob) => {
            if (!blob) return
            await uploadMedia(new File([blob], `snap-${Date.now()}.jpg`, { type: 'image/jpeg' }), 'exam-snapshot')
          },
          'image/jpeg',
          0.6,
        )
      } catch {
        // snapshot failure must never disturb the exam
      }
    }, 120000)
    return () => window.clearInterval(interval)
  }, [snapshotsEnabled, status])

  return (
    <div className="pointer-events-none fixed right-4 bottom-24 z-40 sm:right-6 lg:right-auto lg:left-6">
      {status === 'granted' ? (
        <div className="overflow-hidden rounded-xl border-2 border-white bg-black shadow-2xl">
          <video ref={videoRef} autoPlay muted playsInline className="h-20 w-28 object-cover sm:h-24 sm:w-32" aria-label="Monitoring kamera" />
          <p className="flex items-center justify-center gap-1 bg-emerald-600 py-0.5 text-[9px] font-bold tracking-wide text-white uppercase">
            <Camera className="h-2.5 w-2.5" /> Terhubung
          </p>
        </div>
      ) : status === 'denied' || status === 'unsupported' ? (
        <div className="rounded-xl bg-amber-50 px-3 py-2 text-[10px] font-semibold text-amber-700 shadow-lg ring-1 ring-amber-200">
          <span className="flex items-center gap-1"><CameraOff className="h-3 w-3" /> Kamera tidak aktif</span>
        </div>
      ) : null}
    </div>
  )
}

export function SubmitConfirmModal({
  open,
  onClose,
  stats,
  onSubmit,
  submitting,
}: {
  open: boolean
  onClose: () => void
  stats: { total: number; answered: number; unanswered: number; flagged: number }
  onSubmit: () => void
  submitting: boolean
}) {
  const allAnswered = stats.unanswered === 0
  return (
    <Modal open={open} onClose={onClose} title="Kumpulkan Ujian?" size="sm">
      <div className="px-6 py-5">
        <div className="grid grid-cols-3 gap-3 text-center">
          <StatBox label="Dijawab" value={`${stats.answered}/${stats.total}`} tone="green" />
          <StatBox label="Belum" value={String(stats.unanswered)} tone={allAnswered ? 'slate' : 'red'} />
          <StatBox label="Ditandai" value={String(stats.flagged)} tone="violet" />
        </div>
        {!allAnswered && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-3 text-xs leading-relaxed text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Masih ada {stats.unanswered} soal belum dijawab. Soal kosong dinilai salah.
          </p>
        )}
        <p className="mt-4 text-xs leading-relaxed text-slate-400">
          Setelah dikumpulkan, jawaban terkunci dan Anda tidak dapat mengubahnya lagi.
        </p>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:border-slate-700 dark:bg-slate-800/60">
        <Button variant="ghost" onClick={onClose}>Periksa Lagi</Button>
        <Button variant={allAnswered ? 'primary' : 'danger'} onClick={onSubmit} loading={submitting}>
          Ya, Kumpulkan Sekarang
        </Button>
      </div>
    </Modal>
  )
}

function StatBox({ label, value, tone }: { label: string; value: string; tone: 'green' | 'red' | 'slate' | 'violet' }) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-rose-50 text-rose-700',
    slate: 'bg-slate-100 text-slate-600',
    violet: 'bg-violet-50 text-violet-700',
  }
  return (
    <div className={`rounded-xl px-2 py-3 ${tones[tone]}`}>
      <p className="text-lg font-extrabold">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
    </div>
  )
}

export function SubmittedScreen({
  wasAuto,
  summary,
  showResult,
}: {
  wasAuto: boolean
  summary: SubmitSummary | null
  showResult: boolean
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-slate-50 to-primary-50/60 p-6 dark:from-slate-950 dark:to-primary-950/60">
      <div className="card w-full max-w-md p-8 text-center animate-fade-in">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-8 w-8">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>
        <h1 className="mt-5 text-xl font-extrabold tracking-tight text-slate-900">Ujian Dikumpulkan</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          {wasAuto
            ? 'Waktu telah habis / batas pelanggaran tercapai — jawaban Anda dikumpulkan otomatis oleh sistem.'
            : 'Jawaban Anda berhasil dikumpulkan dan terkunci.'}
        </p>

        {showResult && summary && !summary.already_submitted && (
          <dl className="mt-6 grid grid-cols-3 gap-2 text-xs">
            <ResultCell label="Benar" value={summary.correct !== undefined ? String(summary.correct) : '-'} tone="text-emerald-600" />
            <ResultCell label="Salah" value={summary.wrong !== undefined ? String(summary.wrong) : '-'} tone="text-rose-600" />
            <ResultCell
              label="Nilai"
              value={
                summary.final_score !== null && summary.final_score !== undefined
                  ? Number(summary.final_score).toLocaleString('id-ID')
                  : 'Proses'
              }
              tone="text-primary-600"
            />
          </dl>
        )}
        {summary?.essay_pending && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
            Jawaban essay sedang dalam proses penilaian guru. Nilai akhir dapat berubah setelah essay selesai dinilai.
          </p>
        )}

        <Link to="/student/history" className="mt-7 block rounded-xl bg-primary-600 py-3 text-center text-sm font-bold text-white transition-colors hover:bg-primary-700">
          Lihat Riwayat Ujian
        </Link>
      </div>
    </div>
  )
}

function ResultCell({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-2 py-3 dark:bg-slate-800">
      <dd className={`text-xl font-extrabold ${tone}`}>{value}</dd>
      <dt className="mt-0.5 font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
    </div>
  )
}
