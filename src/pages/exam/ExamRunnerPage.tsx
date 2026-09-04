import { useState } from 'react'
import {
  ChevronLeft, ChevronRight, Flag, Send, WifiOff, AlertCircle,
  Maximize2,
} from 'lucide-react'
import { useParams, Link } from 'react-router-dom'
import { useExamEngine } from '@/features/exam/useExamEngine'
import {
  ConnectionBadge, ExamTimer, QuestionNavigator,
  ViolationFlash, CameraMonitor, SubmitConfirmModal, SubmittedScreen,
} from '@/components/exam/ExamRunnerUI'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Feedback'
import { RichContent } from '@/components/ui/RichTextEditor'
import { cn } from '@/lib/utils'
import type { AnswerValue, ClientQuestion } from '@/types/models'

export default function ExamRunnerPage() {
  const params = useParams()
  const attemptId = params.attemptId ?? ''
  const engine = useExamEngine(attemptId)
  const [confirmOpen, setConfirmOpen] = useState(false)

  if (engine.phase === 'loading') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-slate-950">
        <Spinner className="h-8 w-8" />
        <p className="text-sm text-slate-400">Menyiapkan lembar ujian...</p>
      </div>
    )
  }

  if (engine.phase === 'error') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
        <div className="card max-w-md p-8 text-center animate-fade-in">
          <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
          <h1 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">Terjadi Kendala</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{engine.loadError || 'Gagal memuat lembar ujian. Periksa koneksi atau hubungi guru.'}</p>
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={() => engine.reload()} className="w-full">Coba Lagi</Button>
            <Link to="/student/exams" className="block rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-center text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Kembali ke Daftar Ujian
            </Link>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-slate-400">Jika terus gagal: pastikan jadwal masih aktif, kesempatan masih ada, dan akun terdaftar di ujian. Hubungi admin jika perlu.</p>
        </div>
      </div>
    )
  }

  if (engine.phase === 'submitted') {
    return (
      <SubmittedScreen
        wasAuto={engine.wasAutoSubmitted}
        summary={engine.submitSummary}
        showResult={engine.payload?.exam.show_result_to_student ?? true}
      />
    )
  }

  if (!engine.payload || !engine.currentQuestion) return null

  const exam = engine.payload.exam
  const q = engine.currentQuestion
  const answer = engine.answers[q.id] ?? null
  const order = engine.payload.order

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100 dark:bg-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-base">{exam.title}</h1>
            <p className="truncate text-[11px] text-slate-400 sm:block">
              <span className="hidden sm:inline">{engine.payload.student.name} · {engine.payload.student.class ?? '-'}</span>
              <span className="sm:hidden truncate">{engine.payload.student.class ?? engine.payload.student.name}</span>
              {exam.violation_limit > 0 && (
                <span className={cn('ml-2 font-semibold', engine.violationCount > 0 ? 'text-rose-500' : 'text-slate-300')}>
                  Pelanggaran: {engine.violationCount}/{exam.violation_limit}
                </span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <ConnectionBadge status={engine.saveStatus} />
            <ExamTimer seconds={engine.remainingSeconds} compact />
          </div>
        </div>
      </header>

      {engine.violationFlash && (
        <ViolationFlash count={engine.violationFlash.count} limit={engine.violationLimit} />
      )}

      {exam.fullscreen_required && !document.fullscreenElement && (
        <button
          onClick={() => document.documentElement.requestFullscreen?.().catch(() => undefined)}
          className="flex items-center justify-center gap-1.5 bg-sky-50 py-1.5 text-[11px] font-semibold text-sky-700"
        >
          <Maximize2 className="h-3.5 w-3.5" /> Aktifkan kembali mode layar penuh
        </button>
      )}

      {engine.saveStatus === 'offline' && (
        <p className="flex items-center justify-center gap-1.5 bg-amber-50 py-1.5 text-xs font-medium text-amber-700">
          <WifiOff className="h-3.5 w-3.5" /> Koneksi terputus — jawaban tersimpan lokal & akan disinkronkan otomatis.
        </p>
      )}

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[1fr_300px] lg:py-6">
        <section className="min-w-0 overflow-hidden">
          <QuestionCard
            key={q.id}
            question={q}
            index={engine.currentIndex}
            total={order.length}
            answer={answer}
            flagged={engine.flagged.has(q.id)}
            onAnswer={(v) => engine.setAnswer(q.id, v)}
            onToggleFlag={() => engine.toggleFlag(q.id)}
          />

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="outline" onClick={engine.prev} disabled={engine.currentIndex === 0} icon={<ChevronLeft className="h-4 w-4" />} className="w-full sm:w-auto">
              Sebelumnya
            </Button>
            {engine.currentIndex < order.length - 1 ? (
              <Button onClick={engine.next} className="w-full sm:w-auto">
                Berikutnya <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button variant="primary" icon={<Send className="h-4 w-4" />} onClick={() => setConfirmOpen(true)} className="w-full sm:w-auto">
                Kumpulkan Ujian
              </Button>
            )}
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 lg:hidden">
            <NavigatorLegend stats={engine.stats} />
            <div className="mt-3">
              <QuestionNavigator
                order={order}
                answers={engine.answers}
                flagged={engine.flagged}
                currentIndex={engine.currentIndex}
                onJump={engine.goTo}
              />
            </div>
          </div>
        </section>

        <aside className="hidden lg:block">
          <div className="sticky top-[80px] space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <NavigatorLegend stats={engine.stats} />
              <div className="mt-3">
                <QuestionNavigator
                  order={order}
                  answers={engine.answers}
                  flagged={engine.flagged}
                  currentIndex={engine.currentIndex}
                  onJump={engine.goTo}
                />
              </div>
            </div>
            <Button variant="primary" size="lg" className="w-full" icon={<Send className="h-4 w-4" />} onClick={() => setConfirmOpen(true)}>
              Kumpulkan Ujian
            </Button>
          </div>
        </aside>
      </main>

      {exam.camera_monitoring && <CameraMonitor />}

      <SubmitConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        stats={engine.stats}
        onSubmit={() => {
          setConfirmOpen(false)
          engine.submit()
        }}
        submitting={engine.phase === 'submitting'}
      />
    </div>
  )
}

function NavigatorLegend({ stats }: { stats: { answered: number; unanswered: number; flagged: number; total: number } }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Navigasi Soal</p>
      <div className="flex items-center gap-3 text-[10px] font-medium text-slate-400">
        <LegendDot cls="bg-emerald-100 border-emerald-300" label={`Dijawab ${stats.answered}`} />
        <LegendDot cls="bg-violet-100 border-violet-300" label={`Ditandai ${stats.flagged}`} />
        <LegendDot cls="bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-600" label={`Kosong ${stats.unanswered}`} />
      </div>
    </div>
  )
}

function LegendDot({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn('h-2.5 w-2.5 rounded border', cls)} /> {label}
    </span>
  )
}

function QuestionCard({
  question,
  index,
  total,
  answer,
  flagged,
  onAnswer,
  onToggleFlag,
}: {
  question: ClientQuestion
  index: number
  total: number
  answer: AnswerValue | null | undefined
  flagged: boolean
  onAnswer: (v: AnswerValue) => void
  onToggleFlag: () => void
}) {
  const answered =
    answer !== null &&
    answer !== undefined &&
    (Array.isArray(answer) ? answer.length > 0 : typeof answer === 'string' ? answer.trim().length > 0 : typeof answer === 'object' ? Object.keys(answer).length > 0 : true)

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-7 animate-fade-in dark:border-slate-700 dark:bg-slate-900 overflow-hidden" data-question-type={question.type}>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-base font-extrabold text-white shadow-md shadow-primary-600/25">
            {index + 1}
          </span>
          <div className="text-xs leading-tight min-w-0">
            <p className="font-semibold text-slate-500">Soal {index + 1} dari {total}</p>
            <p className="text-slate-400">{question.points} poin</p>
          </div>
        </div>
        <button
          onClick={onToggleFlag}
          aria-pressed={flagged}
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all active:scale-95 shrink-0',
            flagged
              ? 'border-violet-300 bg-violet-100 text-violet-700'
              : 'border-slate-200 bg-white text-slate-400 hover:border-violet-300 hover:text-violet-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-violet-500 dark:hover:text-violet-400',
          )}
        >
          <Flag className="h-3.5 w-3.5" />
          {flagged ? 'Ditandai' : 'Ragu-ragu'}
        </button>
      </header>

      {question.media_url && (
        <div className="mb-5 overflow-hidden rounded-xl border border-slate-100 bg-slate-50 dark:bg-slate-800 dark:text-slate-200">
          <MediaBlock url={question.media_url} type={question.media_type} />
        </div>
      )}

      <div className="overflow-hidden">
        <RichContent html={question.text} className="text-[15px] leading-relaxed sm:text-base break-words" />
      </div>

      <hr className="my-6 border-slate-100 dark:border-slate-700" />

      <AnswerInput question={question} answer={answer} onAnswer={onAnswer} />

      <footer className="mt-6 flex items-center gap-2 text-xs text-slate-400">
        {answered ? (
          <>
            <CheckCircle2Icon /> Tersimpan otomatis setelah perubahan
          </>
        ) : (
          <>Jawaban Anda disimpan otomatis</>
        )}
      </footer>
    </article>
  )
}

function CheckCircle2Icon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-3.5 w-3.5 text-emerald-500">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  )
}

function MediaBlock({ url, type }: { url: string; type: string | null }) {
  if (type === 'audio') return <audio controls src={url} className="w-full" preload="metadata" />
  if (type === 'video') return <video controls src={url} className="max-h-72 w-full" preload="metadata" playsInline />
  return <img src={url} alt="Media soal" loading="lazy" className="mx-auto max-h-72 w-auto object-contain" />
}

function AnswerInput({
  question,
  answer,
  onAnswer,
}: {
  question: ClientQuestion
  answer: AnswerValue | null | undefined
  onAnswer: (v: AnswerValue) => void
}) {
  switch (question.type) {
    case 'multiple_choice':
      return (
        <OptionList
          options={(question.options ?? []).map((o) => ({ id: o.id, text: o.text, media_url: o.media_url }))}
          selectedId={typeof answer === 'string' ? answer : null}
          onSelect={(id) => onAnswer(id)}
          multi={false}
        />
      )

    case 'multiple_response': {
      const selected = Array.isArray(answer) ? (answer as string[]) : []
      return (
        <>
          <OptionList
            options={(question.options ?? []).map((o) => ({ id: o.id, text: o.text, media_url: o.media_url }))}
            selectedIds={selected}
            onSelectMulti={(ids) => onAnswer(ids)}
            multi
          />
          <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-[11px] font-medium text-sky-700">Boleh pilih lebih dari satu jawaban.</p>
        </>
      )
    }

    case 'true_false': {
      const current: boolean | null =
        answer === true || answer === 'true' ? true : answer === false || answer === 'false' ? false : null
      return (
        <div className="grid grid-cols-2 gap-3">
          {[true, false].map((v) => {
            const selected = current === v
            return (
              <button
                key={String(v)}
                type="button"
                onClick={() => onAnswer(v)}
                aria-pressed={selected}
                className={cn(
                  'rounded-xl border-2 py-4 text-base font-bold transition-all active:scale-[0.98]',
                  selected
                    ? 'border-primary-500 bg-primary-50 text-primary-700 ring-4 ring-primary-500/15'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-primary-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-primary-500',
                )}
              >
                {v ? 'BENAR' : 'SALAH'}
              </button>
            )
          })}
        </div>
      )
    }

    case 'matching': {
      const map = (answer && typeof answer === 'object' && !Array.isArray(answer) ? (answer as Record<string, number>) : {}) ?? {}
      return (
        <div className="space-y-3">
          {(question.left_items ?? []).map((left) => (
            <div key={left.k} className="flex flex-col gap-2.5 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:gap-3">
              <p className="min-w-0 flex-1 text-sm leading-snug break-words">
                <span className="mr-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">{left.k}</span>
                {left.text}
              </p>
              <select
                aria-label={`Pasangan untuk item ${left.k}`}
                value={String(map[String(left.k)] ?? '')}
                onChange={(e) => {
                  const next = { ...map }
                  if (e.target.value === '') delete next[String(left.k)]
                  else next[String(left.k)] = Number(e.target.value)
                  onAnswer(next)
                }}
                className="input-base w-full cursor-pointer py-2.5 sm:w-64 shrink-0"
              >
                <option value="">— pilih pasangan —</option>
                {(question.right_items ?? []).map((right) => (
                  <option key={right.k} value={right.k}>
                    {right.k}. {right.text.slice(0, 60)}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800 dark:text-slate-200 overflow-hidden">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Kolom Pasangan:</p>
            <ol className="space-y-1.5 text-xs text-slate-500 break-words">
              {(question.right_items ?? []).map((r) => (
                <li key={r.k} className="flex gap-1.5">
                  <strong className="text-slate-700 dark:text-slate-300 shrink-0">{r.k}.</strong> <span className="min-w-0 flex-1">{r.text}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )
    }

    case 'short_answer': {
      const val = typeof answer === 'string' ? answer : ''
      return (
        <input
          type="text"
          value={val}
          onChange={(e) => onAnswer(e.target.value)}
          placeholder="Ketik jawaban singkat di sini..."
          autoComplete="off"
          autoCapitalize="off"
          className="input-base py-4 text-base font-medium"
        />
      )
    }

    case 'essay': {
      const val = typeof answer === 'string' ? answer : ''
      const words = val.split(/\s+/).filter(Boolean).length
      const underMin = (question.min_words ?? 0) > 0 && words < question.min_words!
      return (
        <div>
          <textarea
            value={val}
            onChange={(e) => onAnswer(e.target.value)}
            placeholder="Tulis jawaban essay Anda secara lengkap dan terstruktur..."
            rows={9}
            className={cn('input-base resize-y text-[15px] leading-relaxed', underMin && words > 0 && 'border-amber-300 focus:border-amber-400')}
          />
          <p className={cn('mt-1.5 text-xs', underMin ? 'font-semibold text-amber-600' : 'text-slate-400')}>
            {words} kata
            {(question.min_words ?? 0) > 0 && ` · minimal ${question.min_words} kata`}
            {(question.max_words ?? 0) > 0 && ` · maksimal ${question.max_words} kata`}
          </p>
        </div>
      )
    }

    default:
      return null
  }
}

function OptionList({
  options,
  selectedId,
  selectedIds,
  onSelect,
  onSelectMulti,
  multi,
}: {
  options: { id: string; text: string; media_url: string | null }[]
  selectedId?: string | null
  selectedIds?: string[]
  onSelect?: (id: string) => void
  onSelectMulti?: (ids: string[]) => void
  multi?: boolean
}) {
  const selected = multi ? selectedIds ?? [] : selectedId ? [selectedId] : []

  const handle = (id: string) => {
    if (!multi && onSelect) {
      onSelect(id)
      return
    }
    if (multi && onSelectMulti) {
      onSelectMulti(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
    }
  }

  return (
    <div role="radiogroup" aria-multiselectable={multi} className="space-y-2.5">
      {options.map((opt, i) => {
        const active = selected.includes(opt.id)
        return (
          <button
            key={opt.id}
            type="button"
            role={multi ? 'checkbox' : 'radio'}
            aria-checked={active}
            onClick={() => handle(opt.id)}
            className={cn(
              'flex w-full items-start gap-3 rounded-xl border-2 p-3.5 text-left text-[15px] leading-snug transition-all active:scale-[0.99] sm:p-4',
              active
                ? 'border-primary-500 bg-primary-50/70 ring-4 ring-primary-500/10'
                : 'border-slate-200 bg-white hover:border-primary-300 hover:bg-primary-50/20 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-primary-500 dark:hover:bg-primary-900/20',
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-xs font-extrabold transition-colors shadow-sm',
                multi ? 'rounded-lg border-2' : 'rounded-full border-2',
                active ? 'border-primary-600 bg-primary-600 text-white shadow-md' : 'border-slate-300 bg-white text-slate-500 dark:bg-slate-800 dark:text-slate-400',
              )}
            >
              {multi ? (
                active ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} className="h-3.5 w-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                ) : (
                  <span className="h-2.5 w-2.5 rounded-sm border border-slate-300 dark:border-slate-500" aria-hidden />
                )
              ) : active ? (
                <span className="h-2.5 w-2.5 rounded-full bg-white shadow-inner" aria-hidden />
              ) : (
                String.fromCharCode(65 + i)
              )}
            </span>
            <span className="min-w-0 flex-1">
              <RichContent html={opt.text} />
              {opt.media_url && <img src={opt.media_url} alt="" loading="lazy" className="mt-2 max-h-40 rounded-lg object-contain" />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
