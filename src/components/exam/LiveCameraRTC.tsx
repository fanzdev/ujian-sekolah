import { useEffect, useRef, useState } from 'react'
import { Camera, VideoOff, User, Radio } from 'lucide-react'
import { supabase } from '@/services/client'
import { Badge } from '@/components/ui/Badge'
import { useAsync } from '@/hooks/useAsync'
import { fetchSystemSettings } from '@/services/settings.service'
import { uploadMedia } from '@/services/storage.service'

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

type LivePeer = {
  pc: RTCPeerConnection
  stream?: MediaStream
}

export function StudentLivePublisher({ examId }: { examId: string }) {
  const streamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const pcsRef = useRef<Map<string, LivePeer>>(new Map())
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const settingsQuery = useAsync(() => fetchSystemSettings(), [])
  const snapshotsEnabled = settingsQuery.data?.security?.camera_snapshots_enabled !== false

  useEffect(() => {
    const pcsAtStart = pcsRef.current
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    const start = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const myId = user?.id
      if (!myId || !examId) return
      if (!navigator.mediaDevices?.getUserMedia) return
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      } catch {
        return
      }

      channel = supabase.channel(`live-camera:${examId}`, { config: { broadcast: { self: false } } })

      channel.on('broadcast', { event: 'webrtc:request-offer' }, async ({ payload }: { payload: { targetProfileId: string; adminId: string } }) => {
        if (payload.targetProfileId !== myId) return
        const adminId = payload.adminId
        if (pcsRef.current.has(adminId)) return
        try {
          const pc = new RTCPeerConnection(ICE_SERVERS)
          pcsRef.current.set(adminId, { pc })
          streamRef.current?.getTracks().forEach((t) => pc.addTrack(t, streamRef.current!))
          pc.onicecandidate = (e) => {
            if (e.candidate) {
              channel!.send({ type: 'broadcast', event: 'webrtc:ice-student', payload: { studentId: myId, adminId, candidate: e.candidate } })
            }
          }
          pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
              pc.close()
              pcsRef.current.delete(adminId)
            }
          }
          const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false })
          await pc.setLocalDescription(offer)
          channel!.send({ type: 'broadcast', event: 'webrtc:offer', payload: { studentId: myId, adminId, sdp: pc.localDescription } })
        } catch { /* ignore */ }
      })

      channel.on('broadcast', { event: 'webrtc:answer' }, async ({ payload }: { payload: { studentId: string; adminId: string; sdp: RTCSessionDescriptionInit } }) => {
        if (payload.studentId !== myId) return
        const entry = pcsRef.current.get(payload.adminId)
        if (!entry) return
        try {
          await entry.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
        } catch { /* ignore */ }
      })

      channel.on('broadcast', { event: 'webrtc:ice-admin' }, async ({ payload }: { payload: { studentId: string; adminId: string; candidate: RTCIceCandidateInit } }) => {
        if (payload.studentId !== myId) return
        const entry = pcsRef.current.get(payload.adminId)
        if (!entry) return
        try {
          await entry.pc.addIceCandidate(new RTCIceCandidate(payload.candidate))
        } catch { /* ignore */ }
      })

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          channel!.send({ type: 'broadcast', event: 'webrtc:student-ready', payload: { studentId: myId } })
        }
      })
      channelRef.current = channel
    }

    void start()

    return () => {
      cancelled = true
      channelRef.current?.unsubscribe()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      pcsAtStart.forEach(({ pc }) => pc.close())
      pcsAtStart.clear()
    }
  }, [examId])

  useEffect(() => {
    if (!snapshotsEnabled) return
    const interval = window.setInterval(async () => {
      try {
        const video = videoRef.current
        if (!video || video.readyState < 2 || video.videoWidth === 0) return
        const canvas = document.createElement('canvas')
        canvas.width = 320
        canvas.height = 240
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(video, 0, 0, 320, 240)
        canvas.toBlob(
          async (blob) => {
            if (!blob) return
            try { await uploadMedia(new File([blob], `snap-${Date.now()}.jpg`, { type: 'image/jpeg' }), 'exam-snapshot') } catch { /* ignore */ }
          },
          'image/jpeg',
          0.65,
        )
      } catch { /* ignore */ }
    }, 120000)
    return () => window.clearInterval(interval)
  }, [snapshotsEnabled])

  return <video ref={videoRef} autoPlay muted playsInline className="pointer-events-none fixed left-0 top-0 h-[240px] w-[320px] -translate-x-[9999px] opacity-0" aria-hidden tabIndex={-1} />
}

interface LiveStudent {
  profileId: string
  fullName: string
  nis: string | null
}

export function AdminLiveGrid({ examId }: { examId?: string }) {
  const [students, setStudents] = useState<LiveStudent[]>([])
  const [adminId, setAdminId] = useState<string | null>(null)
  const pcsRef = useRef<Map<string, LivePeer>>(new Map())
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const [, forceTick] = useState(0)

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setAdminId(data.user?.id ?? null))
  }, [])

  useEffect(() => {
    let active = true
    const loadStudents = async () => {
      if (!examId) {
        setStudents([])
        return
      }
      const { data: participants } = await supabase.from('exam_participants').select('student_id').eq('exam_id', examId).eq('is_removed', false).limit(100)
      const sIds = (participants ?? []).map((p: { student_id: string }) => p.student_id)
      if (sIds.length === 0) {
        if (active) setStudents([])
        return
      }
      const { data: stuRows } = await supabase.from('students').select('id, nis, profile_id, profiles(full_name)').in('id', sIds)
      const mapped: LiveStudent[] = (stuRows as unknown as { id: string; nis: string | null; profile_id: string; profiles: { full_name: string } | { full_name: string }[] }[] ?? []).map((r) => ({
        profileId: r.profile_id,
        fullName: Array.isArray(r.profiles) ? r.profiles[0]?.full_name ?? '-' : (r.profiles as { full_name: string })?.full_name ?? '-',
        nis: r.nis,
      })).filter((s) => !!s.profileId)
      if (active) setStudents(mapped)
    }
    void loadStudents()
    return () => { active = false }
  }, [examId])

  useEffect(() => {
    if (!examId || !adminId || students.length === 0) return
    const pcsAtStart = pcsRef.current
    const channel = supabase.channel(`live-camera:${examId}`, { config: { broadcast: { self: false } } })
    channelRef.current = channel

    const createViewerPc = async (studentId: string) => {
      if (pcsRef.current.has(studentId)) return pcsRef.current.get(studentId)!.pc
      const pc = new RTCPeerConnection(ICE_SERVERS)
      const peer: LivePeer = { pc }
      pcsRef.current.set(studentId, peer)
      pc.ontrack = (e) => {
        peer.stream = e.streams[0]
        forceTick((t) => t + 1)
        const el = document.getElementById(`live-video-${studentId}`) as HTMLVideoElement | null
        if (el) el.srcObject = e.streams[0]
      }
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          channel.send({ type: 'broadcast', event: 'webrtc:ice-admin', payload: { studentId, adminId, candidate: e.candidate } })
        }
      }
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          forceTick((t) => t + 1)
        }
      }
      return pc
    }

    channel.on('broadcast', { event: 'webrtc:student-ready' }, ({ payload }: { payload: { studentId: string } }) => {
      if (!students.some((s) => s.profileId === payload.studentId)) return
      channel.send({ type: 'broadcast', event: 'webrtc:request-offer', payload: { targetProfileId: payload.studentId, adminId } })
    })

    channel.on('broadcast', { event: 'webrtc:offer' }, async ({ payload }: { payload: { studentId: string; adminId: string; sdp: RTCSessionDescriptionInit } }) => {
      if (payload.adminId !== adminId) return
      const pc = await createViewerPc(payload.studentId)
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        channel.send({ type: 'broadcast', event: 'webrtc:answer', payload: { studentId: payload.studentId, adminId, sdp: pc.localDescription } })
      } catch { /* ignore */ }
    })

    channel.on('broadcast', { event: 'webrtc:ice-student' }, async ({ payload }: { payload: { studentId: string; adminId: string; candidate: RTCIceCandidateInit } }) => {
      if (payload.adminId !== adminId) return
      const entry = pcsRef.current.get(payload.studentId)
      if (!entry) return
      try { await entry.pc.addIceCandidate(new RTCIceCandidate(payload.candidate)) } catch { /* ignore */ }
    })

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        for (const s of students) {
          channel.send({ type: 'broadcast', event: 'webrtc:request-offer', payload: { targetProfileId: s.profileId, adminId } })
        }
      }
    })

    const retry = window.setInterval(() => {
      for (const s of students) {
        const entry = pcsRef.current.get(s.profileId)
        if (!entry || entry.pc.connectionState === 'failed' || entry.pc.connectionState === 'closed' || !entry.stream) {
          channel.send({ type: 'broadcast', event: 'webrtc:request-offer', payload: { targetProfileId: s.profileId, adminId } })
        }
      }
    }, 15000)

    return () => {
      window.clearInterval(retry)
      channel.unsubscribe()
      pcsAtStart.forEach(({ pc }) => pc.close())
      pcsAtStart.clear()
    }
  }, [examId, adminId, students])

  if (!examId) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
          <VideoOff className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Pilih ujian untuk melihat live kamera</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-400">Live WebRTC akan menampilkan video real-time siswa yang sedang mengerjakan ujian dengan <strong>Monitoring kamera</strong> aktif.</p>
        </div>
      </div>
    )
  }

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
          <VideoOff className="h-6 w-6" />
        </div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Belum ada peserta</p>
        <p className="text-xs text-slate-400">Tambahkan peserta di tab Kelola Peserta.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {students.map((s) => {
        const peer = pcsRef.current.get(s.profileId)
        const hasStream = !!peer?.stream
        const state = peer?.pc.connectionState ?? 'new'
        return (
          <div key={s.profileId} className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md dark:border-slate-700 dark:bg-slate-800">
            <div className="relative aspect-[4/3] overflow-hidden bg-slate-900">
              <video
                id={`live-video-${s.profileId}`}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover bg-slate-900"
                ref={(el) => {
                  if (el && peer?.stream && el.srcObject !== peer.stream) el.srcObject = peer.stream
                }}
              />
              {!hasStream && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <Camera className="h-8 w-8 animate-pulse" />
                  <p className="text-xs font-medium">Menunggu kamera siswa…</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-500">{state === 'connecting' ? 'Menghubungkan…' : state === 'failed' ? 'Gagal — siswa offline/tolak izin' : 'Menunggu siswa join ujian'}</p>
                </div>
              )}
              <span className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur ${hasStream ? 'bg-emerald-500/90' : 'bg-amber-500/90'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${hasStream ? 'bg-white animate-pulse' : 'bg-white/70'}`} /> {hasStream ? 'LIVE' : 'CONNECTING'}
              </span>
              <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                <Radio className="h-3 w-3" /> {hasStream ? 'WebRTC' : state}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-white px-3 py-2.5 dark:bg-slate-800">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                <User className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{s.fullName}</p>
                <p className="truncate font-mono text-[10px] text-slate-400">NIS {s.nis ?? '-'} · {s.profileId.slice(0, 6)}…</p>
              </div>
              <Badge tone={hasStream ? 'green' : 'gray'}>{hasStream ? 'Aktif' : 'Offline'}</Badge>
            </div>
          </div>
        )
      })}
    </div>
  )
}
