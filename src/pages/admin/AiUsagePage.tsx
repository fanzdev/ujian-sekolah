import { useEffect } from 'react'
import { useAsync, useDocumentTitle } from '@/hooks/useAsync'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { BarChart3, Bot, Zap, Activity, TrendingUp, AlertTriangle, CheckCircle2, Database, Radio } from 'lucide-react'
import { supabase } from '@/services/client'
import { formatTime } from '@/lib/datetime'

export default function AiUsagePage() {
  useDocumentTitle('Laporan AI')

  const statsQuery = useAsync(async () => {
    const [{ data: grades, count: total }, { data: keys }, { data: audits }] = await Promise.all([
      supabase.from('essay_grades').select('ai_score, ai_confidence, status, ai_provider, created_at', { count: 'exact' }),
      supabase.from('ai_provider_keys').select('id, label, is_active, last_used_at, last_error').order('priority'),
      supabase.from('audit_logs').select('created_at, metadata').eq('action', 'GRADE_ESSAY').order('created_at', { ascending: false }).limit(100),
    ])
    const totalGrades = total ?? 0
    const aiGraded = (grades as any[] | null)?.filter((g) => g.status === 'ai_graded').length ?? 0
    const avgConfidence = (() => {
      const vals = (grades as any[] | null)?.map((g) => Number(g.ai_confidence)).filter((n) => Number.isFinite(n)) ?? []
      if (vals.length === 0) return null
      return vals.reduce((a, b) => a + b, 0) / vals.length
    })()
    const activeKeys = (keys as any[] | null)?.filter((k) => k.is_active).length ?? 0
    return { totalGrades, aiGraded, avgConfidence, activeKeys, keys: (keys as any[]) ?? [], grades: (grades as any[]) ?? [], audits: (audits as any[]) ?? [] }
  }, [])

  useEffect(() => {
    const ch = supabase
      .channel('ai-usage-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'essay_grades' }, () => statsQuery.reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_provider_keys' }, () => statsQuery.reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs', filter: 'action=eq.GRADE_ESSAY' }, () => statsQuery.reload())
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const modelStats = (() => {
    const grades = statsQuery.data?.grades ?? []
    const map = new Map<string, { count: number; sumScore: number }>()
    for (const g of grades) {
      const provider = g.ai_provider ?? 'openrouter'
      const key = provider
      const cur = map.get(key) ?? { count: 0, sumScore: 0 }
      cur.count++
      cur.sumScore += Number(g.ai_score ?? 0)
      map.set(key, cur)
    }
    return Array.from(map.entries()).map(([model, v]) => ({ model, count: v.count, avg: v.count ? (v.sumScore / v.count).toFixed(1) : '-' }))
  })()

  if (statsQuery.loading) return <div className="flex justify-center py-14 text-xs text-slate-400">Memuat laporan AI…</div>

  const s = statsQuery.data

  return (
    <>
      <PageHeader title="Laporan Penggunaan AI" subtitle="Statistik lengkap grading essay otomatis via OpenRouter — realtime" icon={<BarChart3 className="h-5 w-5" />} />
      <div className="mb-3 flex items-center gap-2 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
        <Radio className="h-3.5 w-3.5 animate-pulse" /> Live — otomatis update saat ada penilaian AI baru
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Penilaian AI" value={s?.totalGrades ?? 0} icon={<Bot className="h-5 w-5" />} tone="blue" hint="Baris di essay_grades" />
        <StatCard label="AI Graded" value={s?.aiGraded ?? 0} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" hint={`${s?.totalGrades ? Math.round(((s?.aiGraded ?? 0) / (s?.totalGrades ?? 1)) * 100) : 0}% dari total`} />
        <StatCard label="Rata Confidence" value={s?.avgConfidence !== null && s?.avgConfidence !== undefined ? `${((s?.avgConfidence ?? 0) * 100).toFixed(0)}%` : '-'} icon={<Activity className="h-5 w-5" />} tone="purple" hint="Rata ai_confidence" />
        <StatCard label="Key Aktif" value={`${s?.activeKeys ?? 0} / ${s?.keys?.length ?? 0}`} icon={<Zap className="h-5 w-5" />} tone="amber" hint={`${s?.keys?.filter((k: any) => k.last_error).length ?? 0} error terakhir`} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card className="!rounded-2xl">
          <CardHeader title="Distribusi Model" subtitle="Berdasarkan ai_provider/model tersimpan" />
          <CardBody>
            {modelStats.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">Belum ada data model.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-slate-50/80 dark:bg-slate-800/50">
                      <th className="table-th">Model / Provider</th>
                      <th className="table-th text-center">Jumlah</th>
                      <th className="table-th text-center">Rata Skor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {modelStats.map((m) => (
                      <tr key={m.model}>
                        <td className="table-td font-mono text-xs">{m.model}</td>
                        <td className="table-td text-center">{m.count}</td>
                        <td className="table-td text-center">{m.avg}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="!rounded-2xl">
          <CardHeader title="Status Key" subtitle="Pool rotasi & kesehatan" />
          <CardBody>
            <div className="space-y-2">
              {(s?.keys ?? []).map((k: any) => (
                <div key={k.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{k.label ?? '(tanpa label)'} <span className="font-normal text-slate-400">{k.is_active ? '• aktif' : '• nonaktif'}</span></p>
                    <p className="truncate text-[11px] text-slate-400">{k.last_used_at ? `dipakai ${formatTime(k.last_used_at)}` : 'belum dipakai'}</p>
                  </div>
                  {k.last_error ? <Badge tone="red"><AlertTriangle className="mr-1 h-3 w-3" />Error</Badge> : k.last_used_at ? <Badge tone="green">Sehat</Badge> : <Badge>Gagal?</Badge>}
                </div>
              ))}
              {(s?.keys.length ?? 0) === 0 && <p className="py-4 text-center text-xs text-slate-400">Belum ada API Key.</p>}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-5 !rounded-2xl">
        <CardHeader title="Tren Harian (100 log terakhir)" subtitle="Audit GRADE_ESSAY per hari" />
        <CardBody>
          {(() => {
            const audits = s?.audits ?? []
            const byDay = new Map<string, number>()
            for (const a of audits) {
              const day = String(a.created_at).slice(0, 10)
              byDay.set(day, (byDay.get(day) ?? 0) + 1)
            }
            const days = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-14)
            if (days.length === 0) return <p className="py-6 text-center text-xs text-slate-400">Belum ada log audit GRADE_ESSAY.</p>
            const max = Math.max(...days.map(([, c]) => c), 1)
            return (
              <div className="flex items-end gap-1 overflow-x-auto py-2">
                {days.map(([day, cnt]) => (
                  <div key={day} className="flex flex-col items-center gap-1">
                    <div className="flex h-20 w-8 items-end justify-center rounded bg-slate-100 dark:bg-slate-800">
                      <div className="w-6 rounded bg-primary-500 transition-all" style={{ height: `${(cnt / max) * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-slate-400">{day.slice(5)}</span>
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{cnt}</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </CardBody>
      </Card>

      <Card className="mt-5 !rounded-2xl">
        <CardHeader title="Detail Terbaru" subtitle="Essay grades + audit" />
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200"><Database className="h-3.5 w-3.5" /> Essay Grades Terbaru</h4>
              <ul className="mt-2 space-y-1.5 text-xs">
                {(s?.grades ?? []).slice(0, 6).map((g: any, i: number) => (
                  <li key={i} className="flex justify-between rounded border border-slate-100 px-2 py-1.5 dark:border-slate-800">
                    <span className="font-mono text-slate-600 dark:text-slate-300">skor {g.ai_score ?? '-'} • conf {(Number(g.ai_confidence) * 100).toFixed(0) ?? '-'}%</span>
                    <span className="text-slate-400">{g.status}</span>
                  </li>
                ))}
                {(s?.grades.length ?? 0) === 0 && <li className="text-slate-400">Belum ada.</li>}
              </ul>
            </div>
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200"><TrendingUp className="h-3.5 w-3.5" /> Estimasi Biaya</h4>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">Model gratis OpenRouter tidak dikenakan biaya. Untuk model berbayar, biaya = (prompt_tokens * price_prompt + completion_tokens * price_completion). Monitor via OpenRouter dashboard → Usage. Sistem rotasi otomatis meminimalkan retry berbayar.</p>
              <p className="mt-2 text-xs text-slate-400">Rekomendasi: prioritaskan model berlabel <span className="rounded bg-emerald-100 px-1 text-emerald-700">Gratis</span> untuk operasional massal 1000 siswa.</p>
            </div>
          </div>
        </CardBody>
      </Card>
    </>
  )
}
