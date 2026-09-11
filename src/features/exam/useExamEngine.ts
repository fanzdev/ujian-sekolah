import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getAttemptPayload,
  getServerTimeOffset,
  saveAnswer as apiSaveAnswer,
  submitAttempt,
  recordViolation,
  getPublicIp,
} from '@/services/attempts.service'
import { recordSecurityEvent, getDeviceId, flushSecurityQueue } from '@/services/security.service'
import { friendlyError } from '@/lib/errors'
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

  const load = useCallback(async () => {
    setPhase('loading')
    setLoadError('')
    try {
      const [p, offset] = await Promise.all([getAttemptPayload(attemptId), getServerTimeOffset().catch(() => 0)])
      offsetRef.current = offset

      if (!p || !p.attempt || !p.exam) {
        throw new Error('Data ujian tidak lengkap. Hubungi admin.')
      }

      if (p.attempt.status !== 'in_progress') {
        setPayload(p)
        setPhase('submitted')
        return
      }

      if (!p.order || p.order.length === 0) {
        throw new Error('Ujian belum memiliki soal. Hubungi guru/admin untuk menambahkan soal.')
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
      setLoadError(friendlyError(err))
      setPhase('error')
    }
  }, [attemptId])

  // ---------------- initial load ----------------
  useEffect(() => {
    void load()
  }, [load])

  const hasLoggedStart = useRef(false)
  useEffect(() => {
    if (!payload || phase !== 'running' || hasLoggedStart.current) return
    hasLoggedStart.current = true
    const isNew = (() => {
      try {
        const started = new Date(payload.attempt.started_at).getTime()
        return Date.now() - started < 90_000
      } catch { return false }
    })()
    void recordSecurityEvent(attemptId, isNew ? 'EXAM_START' : 'EXAM_RESUME', 'INFO', { remaining: remainingSeconds }, getDeviceId())
  }, [payload, phase, attemptId, remainingSeconds])

  useEffect(() => {
    if (violationCount >= 6) {
      void recordSecurityEvent(attemptId, 'SUSPICIOUS_ACTIVITY', 'HIGH', { violationCount, reason: 'threshold' }, getDeviceId())
    }
  }, [violationCount, attemptId])



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
      void recordSecurityEvent(attemptId, auto ? 'AUTO_SUBMIT' : 'EXAM_SUBMIT', auto ? 'MEDIUM' : 'INFO', {}, getDeviceId())

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
          sessionStorage.removeItem(`device:${attemptId}`)
          sessionStorage.removeItem(`cbt-lock:${attemptId}`)
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
        setLoadError(friendlyError(err))
        if (!auto) setPhase('error')
      }
    },
    [attemptId, flushQueue],
  )

  // ---------------- violations & security ----------------
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

      const secSeverity = severity === 'serious' ? 'MEDIUM' as const : 'LOW' as const
      void recordSecurityEvent(attemptId, type, secSeverity, metadata, getDeviceId()).catch(() => undefined)

      try {
        const res = await recordViolation(attemptId, type, severity, metadata)
        if (res.count !== undefined) setViolationCount(res.count)
        if (res.submitted) {
          setWasAutoSubmitted(true)
          void recordSecurityEvent(attemptId, 'AUTO_SUBMIT', 'HIGH', { reason: type, count: res.count }, getDeviceId())
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

  const triggerSecurity = useCallback(
    async (type: string, severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW', metadata: Record<string, unknown> = {}) => {
      if (phase !== 'running' || submittingRef.current) return
      const now = Date.now()
      const key = `sec:${type}`
      const last = lastViolationAt.current[key] ?? 0
      if (now - last < 2500) return
      lastViolationAt.current[key] = now
      void recordSecurityEvent(attemptId, type, severity, metadata, getDeviceId()).catch(() => undefined)
      if (['TAB_SWITCH','FULLSCREEN_EXIT','PAGE_RELOAD','COPY_ATTEMPT','PASTE_ATTEMPT'].includes(type)) {
        void triggerViolation(type.toLowerCase(), 'warning', metadata)
      }
    },
    [attemptId, phase, triggerViolation],
  )

  // multi-device / IP / duplicate tab + PAGE_REOPEN
  useEffect(() => {
    if (!payload || phase !== 'running') return
    const currentDevice = getDeviceId()
    try {
      const stored = sessionStorage.getItem(`device:${attemptId}`)
      if (!stored) {
        sessionStorage.setItem(`device:${attemptId}`, currentDevice)
      } else if (stored !== currentDevice) {
        void recordSecurityEvent(attemptId, 'DEVICE_CHANGE', 'HIGH', { previous_device: stored, new_device: currentDevice }, currentDevice)
        void triggerViolation('device_change', 'serious', { previous: stored })
      }
    } catch { void 0 }

    void getPublicIp().then((ip: string | null) => {
      const serverIp = (payload.attempt as unknown as { ip_address?: string })?.ip_address
      if (ip && serverIp && ip !== serverIp) {
        void recordSecurityEvent(attemptId, 'IP_CHANGE', 'MEDIUM', { previous_ip: serverIp, new_ip: ip }, currentDevice)
      }
    }).catch(() => undefined)

    try {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      if (nav && (nav.type === 'reload' || (performance as unknown as { navigation?: { type: number } }).navigation?.type === 1)) {
        void recordSecurityEvent(attemptId, 'PAGE_RELOAD', 'MEDIUM', {}, currentDevice)
        void triggerViolation('page_reload', 'warning', {})
      } else {
        const draft = readDraft(attemptId)
        if (Object.keys(draft).length > 0) {
          void recordSecurityEvent(attemptId, 'PAGE_REOPEN', 'LOW', {}, currentDevice)
        }
      }
    } catch { void 0 }

    let bc: BroadcastChannel | null = null
    let duplicateWarned = false
    try {
      bc = new BroadcastChannel(`cbt-exam-${attemptId}`)
      bc.onmessage = (ev) => {
        if (ev.data === 'cbt-tab-open' && !duplicateWarned) {
          duplicateWarned = true
          void recordSecurityEvent(attemptId, 'MULTIPLE_SESSION', 'HIGH', { via: 'broadcast' }, currentDevice)
          void triggerViolation('multiple_session', 'serious', {})
        }
      }
      bc.postMessage('cbt-tab-open')
      const lockKey = `cbt-lock:${attemptId}`
      const existing = sessionStorage.getItem(lockKey)
      if (existing && existing !== currentDevice) {
        void recordSecurityEvent(attemptId, 'MULTIPLE_SESSION', 'HIGH', { via: 'storage', existing }, currentDevice)
      } else {
        try { sessionStorage.setItem(lockKey, currentDevice) } catch (_e) { void _e }
      }
    } catch (_e) { void _e }
    return () => { try { bc?.close() } catch (_e) { void _e } }
  }, [payload, phase, attemptId, triggerViolation])

  // anti-cheat listeners — comprehensive
  useEffect(() => {
    if (phase !== 'running' || !payload) return

    const mustFs = true
    const isFsSupported = (() => {
      const d = document as unknown as { fullscreenEnabled?: boolean; webkitFullscreenEnabled?: boolean }
      const el = document.documentElement as unknown as { requestFullscreen?: unknown; webkitRequestFullscreen?: unknown }
      return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled || el.requestFullscreen || el.webkitRequestFullscreen)
    })()
    const isFs = () => {
      const d = document as unknown as { fullscreenElement: Element | null; webkitFullscreenElement?: Element | null; mozFullScreenElement?: Element | null }
      return !!(d.fullscreenElement || d.webkitFullscreenElement || d.mozFullScreenElement)
    }
    const requestFs = () => {
      if (!isFsSupported) return
      const el = document.documentElement as unknown as { requestFullscreen?: () => Promise<void>; webkitRequestFullscreen?: () => Promise<void>; mozRequestFullScreen?: () => Promise<void> }
      const req = el.requestFullscreen ?? el.webkitRequestFullscreen ?? el.mozRequestFullScreen
      req?.call(el).catch(() => undefined)
    }

    void recordSecurityEvent(attemptId, 'EXAM_RESUME', 'INFO', { remaining: remainingSeconds }, getDeviceId())
    void flushSecurityQueue(attemptId)

    const onVisibility = () => {
      if (document.hidden) {
        void triggerViolation('tab_switch', 'warning', { visibilityState: document.visibilityState })
        void triggerSecurity('TAB_SWITCH', 'LOW', { visibilityState: document.visibilityState })
        void recordSecurityEvent(attemptId, 'PAGE_BLUR', 'LOW', { reason: 'visibility_hidden' }, getDeviceId())
      } else {
        void recordSecurityEvent(attemptId, 'PAGE_FOCUS', 'INFO', {}, getDeviceId())
        void triggerSecurity('PAGE_FOCUS', 'INFO', {})
      }
    }
    const onBlur = () => {
      void triggerViolation('window_blur', 'warning', { type: 'window_blur' })
      void recordSecurityEvent(attemptId, 'PAGE_BLUR', 'LOW', {}, getDeviceId())
    }
    const onFocus = () => {
      void recordSecurityEvent(attemptId, 'PAGE_FOCUS', 'INFO', {}, getDeviceId())
    }
    const onPageHide = () => {
      void recordSecurityEvent(attemptId, 'PAGE_LEAVE', 'MEDIUM', { persisted: false }, getDeviceId())
      void triggerViolation('page_leave', 'warning', {})
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      void recordSecurityEvent(attemptId, 'PAGE_RELOAD', 'MEDIUM', {}, getDeviceId())
      void triggerViolation('page_reload', 'warning', {})
      e.preventDefault()
      e.returnValue = ''
    }
    const onFsChange = () => {
      if (!isFs() && !document.hidden) {
        void triggerViolation('fullscreen_exit', 'serious', {})
        void recordSecurityEvent(attemptId, 'FULLSCREEN_EXIT', 'HIGH', {}, getDeviceId())
        requestFs()
      } else if (isFs()) {
        void recordSecurityEvent(attemptId, 'FULLSCREEN_ENTER', 'INFO', {}, getDeviceId())
      } else if (!isFs()) {
        void recordSecurityEvent(attemptId, 'FULLSCREEN_EXIT', 'HIGH', {}, getDeviceId())
      }
    }
    const onContextMenu = (e: MouseEvent) => {
      void recordSecurityEvent(attemptId, 'CONTEXT_MENU', 'LOW', {}, getDeviceId())
      void triggerViolation('context_menu', 'warning', {})
      e.preventDefault()
    }
    const handleCopy = (e: Event) => {
      e.preventDefault()
      void recordSecurityEvent(attemptId, 'COPY_ATTEMPT', 'LOW', { type: (e as ClipboardEvent).type }, getDeviceId())
      void triggerViolation('copy_paste', 'warning', { sub: 'copy' })
    }
    const handlePaste = (e: Event) => {
      e.preventDefault()
      void recordSecurityEvent(attemptId, 'PASTE_ATTEMPT', 'MEDIUM', {}, getDeviceId())
      void triggerViolation('paste_attempt', 'warning', {})
    }
    const handleCut = (e: Event) => {
      e.preventDefault()
      void recordSecurityEvent(attemptId, 'CUT_ATTEMPT', 'LOW', {}, getDeviceId())
      void triggerViolation('cut_attempt', 'warning', {})
    }
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && ['c','v','x','u','s','p','a'].includes(key)) {
        void recordSecurityEvent(attemptId, key === 'v' ? 'PASTE_ATTEMPT' : key === 'c' ? 'COPY_ATTEMPT' : 'CUT_ATTEMPT', 'MEDIUM', { key: e.key, ctrl: true }, getDeviceId())
        e.preventDefault()
        void triggerViolation('copy_paste', 'warning', { key })
      }
      if (e.key === 'F12' || (mod && e.shiftKey && ['i','j','c'].includes(key)) || key === 'printscreen' || (mod && key === 'k')) {
        void recordSecurityEvent(attemptId, 'DEVTOOLS_SUSPECTED', 'MEDIUM', { key: e.key, heuristic: true }, getDeviceId())
        e.preventDefault()
      }
      if (mod && key === 'r') {
        void recordSecurityEvent(attemptId, 'PAGE_RELOAD', 'MEDIUM', { key: 'Ctrl+R' }, getDeviceId())
        e.preventDefault()
      }
    }
    const onOffline = () => {
      void recordSecurityEvent(attemptId, 'NETWORK_OFFLINE', 'MEDIUM', {}, getDeviceId())
    }
    const onOnline = () => {
      void recordSecurityEvent(attemptId, 'NETWORK_ONLINE', 'INFO', {}, getDeviceId())
      void recordSecurityEvent(attemptId, 'RECONNECT', 'LOW', {}, getDeviceId())
      void flushSecurityQueue(attemptId)
    }
    let devtoolsOpen = false
    const checkDevtools = () => {
      const threshold = 160
      const wDiff = window.outerWidth - window.innerWidth
      const hDiff = window.outerHeight - window.innerHeight
      const suspected = wDiff > threshold || hDiff > threshold
      if (suspected && !devtoolsOpen) {
        devtoolsOpen = true
        void recordSecurityEvent(attemptId, 'DEVTOOLS_SUSPECTED', 'MEDIUM', { heuristic: true, wDiff, hDiff }, getDeviceId())
      } else if (!suspected && devtoolsOpen) {
        devtoolsOpen = false
      }
    }
    const devtoolsInterval = window.setInterval(checkDevtools, 3000)

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange as EventListener)
    document.addEventListener('mozfullscreenchange', onFsChange as EventListener)
    document.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('copy', handleCopy)
    document.addEventListener('paste', handlePaste)
    document.addEventListener('cut', handleCut)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)

    if (!isFs() && mustFs) requestFs()

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange as EventListener)
      document.removeEventListener('mozfullscreenchange', onFsChange as EventListener)
      document.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('copy', handleCopy)
      document.removeEventListener('paste', handlePaste)
      document.removeEventListener('cut', handleCut)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
      window.clearInterval(devtoolsInterval)
      const d = document as unknown as { fullscreenElement: Element | null; webkitFullscreenElement?: Element | null; mozFullScreenElement?: Element | null; exitFullscreen?: () => Promise<void>; webkitExitFullscreen?: () => Promise<void>; mozCancelFullScreen?: () => Promise<void> }
      if (d.fullscreenElement || d.webkitFullscreenElement || d.mozFullScreenElement) {
        const ex = d.exitFullscreen ?? d.webkitExitFullscreen ?? d.mozCancelFullScreen
        ex?.call(document).catch(() => undefined)
      }
    }
  }, [phase, payload, attemptId, remainingSeconds, triggerViolation, triggerSecurity])

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
    reload: load,
  }
}

export type ExamEngine = ReturnType<typeof useExamEngine>
