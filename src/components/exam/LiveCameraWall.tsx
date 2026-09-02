import { useEffect, useState } from 'react'
import { Camera, RefreshCw, Clock, User, VideoOff } from 'lucide-react'
import { supabase } from '@/services/client'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { relativeTime } from '@/lib/datetime'

interface Snapshot {
  url: string
  ownerId: string
  ownerName: string
  createdAt: string
}

export function LiveCameraWall({ examId }: { examId?: string }) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const [auto, setAuto] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      try {
        const { data: files, error } = await supabase
          .from('media_files')
          .select('path, owner_id, created_at')
          .eq('purpose', 'exam-snapshot')
          .order('created_at', { ascending: false })
          .limit(30)
        if (error) throw error
        if (!active) return
        if (!files || files.length === 0) {
          setSnapshots([])
          return
        }
        const ownerIds = [...new Set(files.map((f) => f.owner_id).filter(Boolean) as string[])]
        const nameMap: Record<string, string> = {}
        if (ownerIds.length) {
          const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', ownerIds)
          for (const p of (profiles as { id: string; full_name: string }[] | null) ?? []) nameMap[p.id] = p.full_name
        }
        const mapped: Snapshot[] = files.map((f) => {
          const { data: urlData } = supabase.storage.from('media').getPublicUrl(f.path)
          return {
            url: urlData.publicUrl,
            ownerId: f.owner_id as string,
            ownerName: nameMap[f.owner_id as string] ?? (f.owner_id ? `Siswa ${String(f.owner_id).slice(0, 6)}` : 'Siswa'),
            createdAt: f.created_at as string,
          }
        })
        // jika examId diberikan, biarkan semua snapshot — filtering presisi butuh attempt_id yang belum disimpan (future)
        void examId
        setSnapshots(mapped)
      } catch {
        if (active) setSnapshots([])
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    let interval: number | undefined
    if (auto) interval = window.setInterval(() => setTick((t) => t + 1), 15000)
    return () => {
      active = false
      if (interval) window.clearInterval(interval)
    }
  }, [examId, tick, auto])

  return (
    <Card className="mt-5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15">
            <Camera className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Kamera Live — Snapshot Berkala</p>
            <p className="text-[11px] text-slate-400">Diambil dari siswa bila <span className="font-mono">camera_monitoring</span> aktif &amp; admin menyalakan <em>Simpan snapshot berkala</em>. Refresh otomatis 15s.</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant={auto ? 'primary' : 'outline'} size="sm" onClick={() => setAuto((a) => !a)}>
            Auto {auto ? 'ON' : 'OFF'}
          </Button>
          <Button variant="outline" size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={() => setTick((t) => t + 1)}>
            Refresh
          </Button>
        </div>
      </div>

      <CardBody>
        {loading && snapshots.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-xs text-slate-400">
            <Camera className="h-6 w-6 animate-pulse" /> Memuat snapshot kamera…
          </div>
        ) : snapshots.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
              <VideoOff className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Belum ada snapshot kamera</p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-400">
                Pastikan ujian mengaktifkan <strong>Monitoring kamera</strong> dan admin mengaktifkan <em>Simpan snapshot berkala</em> di <span className="font-mono">Pengaturan → Keamanan → Monitoring</span>. Siswa harus memberi izin kamera — thumbnail akan muncul di sini setiap ~2 menit.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {snapshots.map((s, idx) => (
              <div key={`${s.url}-${idx}`} className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
                <div className="relative aspect-[4/3] overflow-hidden bg-slate-900">
                  <img src={s.url} alt={`Snapshot ${s.ownerName}`} className="h-full w-full object-cover transition group-hover:scale-[1.02]" loading="lazy" />
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> LIVE
                  </span>
                  <span className="absolute bottom-1.5 right-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                    <Clock className="mr-1 inline h-3 w-3" />
                    {relativeTime(s.createdAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <User className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{s.ownerName}</p>
                    <p className="truncate font-mono text-[10px] text-slate-400">{s.ownerId.slice(0, 8)}…</p>
                  </div>
                  <Badge tone="green">Aktif</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
          Catatan: fitur ini menampilkan <strong>snapshot berkala</strong> (bukan streaming video WebRTC) agar tetap ringan untuk 1000 siswa &amp; kompatibel GitHub Pages. Untuk streaming realtime penuh, butuh SFU/WebRTC server — disarankan gunakan snapshot + polling seperti di atas untuk production sekolah. Setiap snapshot ~15-30KB di bucket <span className="font-mono">media/exam-snapshot/</span>.
        </p>
      </CardBody>
    </Card>
  )
}
