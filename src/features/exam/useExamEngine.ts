import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getAttemptPayload,
  getServerTimeOffset,
  saveAnswer as apiSaveAnswer,
  submitAttempt,
  recordViolation,
} from '@/services/attempts.service'
import type { AnswerValue, SubmitSummary, AttemptPayload } from '@/types/models'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error'
export type Phase = 'loading' | 'running' | 'submitting' | 'submitted' | 'error'

const DRAFT_KEY = 'cbt-draft'

function readDraft(attemptId: string): Record<string, AnswerValue> {
  try {
    const raw = sessionStorage.getItem(`${DRAFT_KEY}:${attemptId}`)
    return raw ? (JSON.parse(raw) as Record<string, AnswerValue>) : {}
  } catch {
    return {}
  }
}

function writeDraft(attemptId: string, answers: Record<string, AnswerValue>) {
  try {
    sessionStorage.setItem(`${DRAFT_KEY}:${attemptId}`, JSON.stringify(answers))
  } catch {
    // storage full/blocked - non critical
  }
}

export function useExamEngine(attemptId: string) {
  const [payload, setPayload] = useState<AttemptPayload | null>(null)
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({})
  const [flagged, setFlagged] = useState<Set<string>>(new Set())
  const [currentIndex, setCurrentIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('loading')
  const [loadError, setLoadError] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  const [violationCount, setViolationCount] = useState(0)
  const [violationLimit, setViolationLimit] = useState(3)
  const [violationFlash, setViolationFlash] = useState<{ type: string; count: number } | null>(null)
  const [submitSummary, setSubmitSummary] = useState<SubmitSummary | null>(null)
  const [wasAutoSubmitted, setWasAutoSubmitted] = useState(false)

  const offsetRef = useRef(0)
  const dirtyRef = useRef<Set<string>>(new Set())
  const answersRef = useRef(answers)
  const submittingRef = useRef(false)
  const lastViolationAt = useRef<Record<string, number>>({})
  const onlineRef = useRef(navigator.onLine)

  answersRef.current = answers

  // ---------------- initial load ----------------
  useEffect(() => {
    let cancelled = false
    setPhase('loading')
    ;(async () => {
      try {
        const [p, offset] = await Promise.all([getAttemptPayload(attemptId), getServerTimeOffset().catch(() => 0)])
        if (cancelled) return
        offsetRef.current = offset

        if (p.attempt.status !== 'in_progress') {
          setPayload(p)
          setPhase('submitted')
          return
        }

        const draft = readDraft(attemptId)
        const merged = { ...p.answers, ...draft }
        setPayload(p)
        setAnswers(merged)
        setRemainingSeconds(p.remaining_seconds)
        setViolationCount(p.attempt.violation_count)
        setViolationLimit(p.exam.violation_limit)
        setPhase('running')

        for (const [qid, val] of Object.entries(draft)) {
          if (JSON.stringify(val) !== JSON.stringify(p.answers[qid] ?? null)) dirtyRef.current.add(qid)
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Gagal memuat ujian.')
          setPhase('error')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [attemptId])

  // ---------------- countdown (server-synced) ----------------
  useEffect(() => {
    if (!payload || phase !== 'running') return
    const deadlineMs = new Date(payload.attempt.deadline).getTime()
    const tick = () => {
      const now = Date.now() + offsetRef.current
      const left = Math.max(0, Math.floor((deadlineMs - now) / 1000))
      setRemainingSeconds(left)
      if (left <= 0 && !submittingRef.current) {
        void doSubmit(true)
      }
      // periodic server resync every 5 minutes keeps clock drift near zero
      if ((left + 1) % 300 === 0) {
        void getServerTimeOffset().then((o) => (offsetRef.current = o)).catch(() => undefined)
      }
    }
    tick()
    const interval = window.setInterval(tick, 1000)
    return () => window.clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload?.attempt.deadline, phase])

  // ---------------- autosave queue ----------------
  const flushQueue = useCallback(async () => {
    if (submittingRef.current) return
    const ids = Array.from(dirtyRef.current)
    if (ids.length === 0) return
    if (!navigator.onLine) {
      setSaveStatus('offline')
      return
    }
    setSaveStatus('saving')
    let allOk = true
    for (const qid of ids) {
      try {
        await apiSaveAnswer(attemptId, qid, answersRef.current[qid] ?? null)
        dirtyRef.current.delete(qid)
        writeDraft(attemptId, answersRef.current)
      } catch {
        allOk = false
      }
    }
    if (dirtyRef.current.size > 0) {
      setSaveStatus(allOk ? 'offline' : 'error')
    } else {
      setSaveStatus(allOk ? 'saved' : 'error')
    }
  }, [attemptId])

  useEffect(() => {
    if (phase !== 'running') return
    const t = window.setTimeout(() => void flushQueue(), 800)
    return () => window.clearTimeout(t)
  }, [answers, phase, flushQueue])

  useEffect(() => {
    if (phase !== 'running') return
    const interval = window.setInterval(() => void flushQueue(), 15000)
    const goOnline = () => {
      onlineRef.current = true
      void flushQueue()
    }
    const goOffline = () => {
      onlineRef.current = false
      setSaveStatus('offline')
    }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [phase, flushQueue])

  // ---------------- answer setter ----------------
  const setAnswer = useCallback(
    (questionId: string, value: AnswerValue) => {
      setAnswers((prev) => ({ ...prev, [questionId]: value }))
      dirtyRef.current.add(questionId)
      writeDraft(attemptId, { ...answersRef.current, [questionId]: value })
    },
    [attemptId],
  )

  const toggleFlag = useCallback((questionId: string) => {
    setFlagged((prev) => {
      const next = new Set(prev)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      return next
    })
  }, [])

  // ---------------- submit ----------------
  const doSubmit = useCallback(
    async (auto: boolean) => {
      if (submittingRef.current) return
      submittingRef.current = true
      if (!auto) setPhase('submitting')

      // best effort final flush of pending edits
      try {
        await flushQueue()
      } catch {
        // ignore - server grades whatever was saved
      }

      try {
        const summary = await submitAttempt(attemptId, auto)
        setWasAutoSubmitted(auto)
        setSubmitSummary(summary)
        setPhase('submitted')
        try {
          sessionStorage.removeItem(`${DRAFT_KEY}:${attemptId}`)
        } catch {
          /* noop */
        }
      } catch (err) {
        submittingRef.current = false
        if (err instanceof Error && err.message.includes('sudah dikumpulkan')) {
          try {
            const p = await getAttemptPayload(attemptId)
            setPayload(p)
          } catch {
            /* noop */
          }
          setSubmitSummary({ already_submitted: true })
          setPhase('submitted')
          return
        }
        setLoadError(err instanceof Error ? err.message : 'Gagal mengumpulkan ujian.')
        if (!auto) setPhase('error')
      }
    },
    [attemptId, flushQueue],
  )

  // ---------------- violations ----------------
  const triggerViolation = useCallback(
    async (type: string, severity: 'warning' | 'serious' = 'warning', metadata: Record<string, unknown> = {}) => {
      if (phase !== 'running' || submittingRef.current) return
      const now = Date.now()
      const mem = lastViolationAt.current[type] ?? 0
      let stored = 0
      try {
        const raw = sessionStorage.getItem(`violation-ts:${attemptId}:${type}`)
        stored = raw ? Number(raw) : 0
      } catch {
        stored = mem
      }
      const last = Math.max(mem, stored)
      if (now - last < 3000) return
      lastViolationAt.current[type] = now
      try {
        sessionStorage.setItem(`violation-ts:${attemptId}:${type}`, String(now))
      } catch {
        // ignore
      }

      try {
        const res = await recordViolation(attemptId, type, severity, metadata)
        if (res.count !== undefined) setViolationCount(res.count)
        if (res.submitted) {
          setWasAutoSubmitted(true)
          setSubmitSummary(await submitAttempt(attemptId, true).catch(() => ({ already_submitted: true })))
          setPhase('submitted')
        } else if (res.count !== undefined) {
          setViolationFlash({ type, count: res.count })
          window.setTimeout(() => setViolationFlash(null), 6000)
        }
      } catch {
        // network hiccup - violation will not be double counted due to throttle
      }
    },
    [attemptId, phase],
  )

  // anti-cheat listeners
  useEffect(() => {
    if (phase !== 'running' || !payload) return

    const onVisibility = () => {
      if (document.hidden) void triggerViolation('tab_switch', 'warning')
    }
    const onBlur = () => {
      void triggerViolation('window_blur', 'warning')
    }
    const onFsChange = () => {
      if (payload.exam.fullscreen_required && !document.fullscreenElement && !document.hidden) {
        void triggerViolation('fullscreen_exit', 'serious')
        document.documentElement.requestFullscreen?.().catch(() => undefined)
      }
    }
    const onContextMenu = (e: MouseEvent) => {
      if (document.getSelection()?.toString()) return
      e.preventDefault()
    }
    const onCopy = (e: Event) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('[data-allow-copy="true"]')) return
      e.preventDefault()
      void triggerViolation('copy_paste', 'warning')
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('copy', onCopy)
    document.addEventListener('cut', onCopy)
    window.addEventListener('beforeunload', onBeforeUnload)

    if (payload.exam.fullscreen_required && !document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => undefined)
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('cut', onCopy)
      window.removeEventListener('beforeunload', onBeforeUnload)
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => undefined)
      }
    }
  }, [phase, payload, triggerViolation])

  // ---------------- derived ----------------
  const order = useMemo(() => payload?.order ?? [], [payload])
  const currentQuestion = order.length > 0 ? payload?.questions[order[currentIndex]] : undefined

  const stats = useMemo(() => {
    const total = order.length
    const answered = order.filter((qid) => {
      const v = answers[qid]
      if (v === null || v === undefined) return false
      if (Array.isArray(v)) return v.length > 0
      if (typeof v === 'string') return v.trim().length > 0
      if (typeof v === 'object') return Object.keys(v ?? {}).length > 0
      return true
    }).length
    return { total, answered, unanswered: total - answered, flagged: flagged.size }
  }, [order, answers, flagged])

  const goTo = useCallback(
    (index: number) => {
      setCurrentIndex(Math.max(0, Math.min(order.length - 1, index)))
    },
    [order.length],
  )

  return {
    payload,
    answers,
    flagged,
    currentIndex,
    currentQuestion,
    phase,
    loadError,
    saveStatus,
    remainingSeconds,
    violationCount,
    violationLimit,
    violationFlash,
    submitSummary,
    wasAutoSubmitted,
    stats,
    setAnswer,
    toggleFlag,
    goTo,
    next: () => goTo(currentIndex + 1),
    prev: () => goTo(currentIndex - 1),
    submit: () => doSubmit(false),
  }
}

export type ExamEngine = ReturnType<typeof useExamEngine>
