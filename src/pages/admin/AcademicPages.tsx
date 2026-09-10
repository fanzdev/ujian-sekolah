import { useState } from 'react'
import { School, Building2, Plus, Pencil, Trash2 } from 'lucide-react'
import { useAsync, useDocumentTitle } from '@/hooks/useAsync'
import { useToast } from '@/hooks/useToast'
import { useConfirm } from '@/hooks/useConfirm'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback'
import {
  listClasses,
  upsertClass,
  deleteClass,
  listDepartments,
  upsertDepartment,
  deleteDepartment,
} from '@/services/academics.service'
import { friendlyError } from '@/lib/errors'

const LEVEL_OPTIONS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `Kelas ${i + 1}` }))

export function ClassesPage() {
  useDocumentTitle('Kelas')
  const query = useAsync(() => Promise.all([listClasses(), listDepartments(), listTeachersLite()]), [])
  const toast = useToast()
  const confirmDialog = useConfirm()
  const [editing, setEditing] = useState<null | { id?: string; name: string; level: number; department_id: string; homeroom_teacher_id: string }>(null)
  const teachers = query.data?.[2] ?? []

  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />
  const classes = query.data?.[0] ?? []

  return (
    <>
      <PageHeader
        title="Data Kelas"
        subtitle={`${classes.length} kelas terdaftar`}
        icon={<School className="h-5 w-5" />}
        actions={
          <Button icon={<Plus className="h-4 w-4" />} disabled={(query.data?.[1] ?? []).length === 0} onClick={() => setEditing({ name: '', level: 10, department_id: '', homeroom_teacher_id: '' })}>
            Tambah Kelas
          </Button>
        }
      />
      <Card>
        {query.loading ? (
          <TableSkeleton cols={4} />
        ) : (
          <DataTable
            rowKey={(c) => c.id}
            data={classes}
            emptyState={<EmptyState icon={<School className="h-6 w-6" />} title="Belum ada kelas" description="Buat kelas untuk mengelompokkan siswa dan penugasan ujian." />}
            columns={[
              { key: 'name', header: 'Nama Kelas', render: (c) => <span className="font-semibold text-slate-800">{c.name}</span> },
              { key: 'level', header: 'Tingkat', render: (c) => `Kelas ${c.level}` },
              { key: 'dept', header: 'Jurusan', render: (c) => <Badge tone="blue"><span>{c.departments?.code ?? '-'}</span><span className="hidden sm:inline"> · {c.departments?.name ?? '-'}</span></Badge> },
              {
                key: 'actions',
                header: '',
                render: (c) => (
                  <div className="flex justify-end gap-1">
                    <button onClick={() => setEditing({ id: c.id, name: c.name, level: c.level, department_id: c.department_id, homeroom_teacher_id: '' })} className="rounded-lg p-2 text-slate-400 hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-500/10 dark:hover:text-sky-400" aria-label="Ubah kelas">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={async () => {
                        const ok = await confirmDialog.confirm({ title: 'Hapus Kelas?', message: `"${c.name}" akan dihapus. Siswa di dalamnya kehilangan penugasan kelas.`, danger: true, confirmText: 'Hapus' })
                        if (!ok) return
                        try {
                          await deleteClass(c.id)
                          toast.success('Kelas dihapus.')
                          query.reload()
                        } catch (err) {
                          toast.error(friendlyError(err))
                        }
                      }}
                      className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                      aria-label="Hapus kelas"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ),
                headerClassName: 'text-right w-28',
              },
            ]}
          />
        )}
      </Card>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? 'Ubah Kelas' : 'Tambah Kelas'} size="sm">
        {editing && (
          <>
            <div className="grid gap-4 px-6 py-5 sm:grid-cols-3">
              <Input label="Nama Kelas" placeholder="cth: XI.1" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required autoFocus className="sm:col-span-1" />
              <Select label="Tingkat" value={String(editing.level)} onChange={(e) => setEditing({ ...editing, level: Number(e.target.value) })} options={LEVEL_OPTIONS} required />
              <Select label="Jurusan" placeholder={teachers.length ? 'Pilih jurusan' : 'Buat jurusan dulu'} required value={editing.department_id} onChange={(e) => setEditing({ ...editing, department_id: e.target.value })} options={(query.data?.[1] ?? []).map((d) => ({ value: d.id, label: `${d.code} · ${d.name}` }))} />
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:bg-slate-800 dark:text-slate-200">
              <Button variant="ghost" onClick={() => setEditing(null)}>Batal</Button>
              <Button
                loading={false}
                onClick={async () => {
                  if (!editing.name.trim() || !editing.department_id) {
                    toast.error('Nama & jurusan wajib diisi.')
                    return
                  }
                  try {
                    await upsertClass({
                      id: editing.id,
                      name: editing.name.trim(),
                      level: editing.level,
                      department_id: editing.department_id,
                    })
                    toast.success(editing.id ? 'Kelas diperbarui.' : 'Kelas dibuat.')
                    setEditing(null)
                    query.reload()
                  } catch (err) {
                    toast.error(friendlyError(err))
                  }
                }}
              >
                Simpan
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  )
}

async function listTeachersLite() {
  const { supabase } = await import('@/services/client')
  const { data } = await supabase
    .from('teachers')
    .select('id, profiles(full_name)')
    .order('created_at')
  return ((data ?? []) as { id: string; profiles: { full_name: string } | { full_name: string }[] | null }[]).map((t) => ({
    id: t.id,
    name: Array.isArray(t.profiles) ? t.profiles[0]?.full_name ?? t.id : t.profiles?.full_name ?? t.id,
  }))
}

export function DepartmentsPage() {
  useDocumentTitle('Jurusan')
  const query = useAsync(() => listDepartments(), [])
  const toast = useToast()
  const confirmDialog = useConfirm()
  const [editing, setEditing] = useState<null | { id?: string; code: string; name: string; description: string }>(null)

  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />

  return (
    <>
      <PageHeader
        title="Data Jurusan"
        subtitle="Program keahlian sekolah"
        icon={<Building2 className="h-5 w-5" />}
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ code: '', name: '', description: '' })}>Tambah Jurusan</Button>}
      />

      {query.loading ? (
        <TableSkeleton rows={3} cols={3} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(query.data ?? []).length === 0 && (
            <p className="col-span-full rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
              Belum ada jurusan.
            </p>
          )}
          {(query.data ?? []).map((d) => (
            <CardBody key={d.id} className="card group flex flex-col gap-2 p-5">
              <div className="flex items-start justify-between">
                <Badge tone="blue">{d.code}</Badge>
                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button onClick={() => setEditing({ id: d.id, code: d.code, name: d.name, description: d.description ?? '' })} className="rounded-lg p-1.5 text-slate-400 hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-500/10 dark:hover:text-sky-400" aria-label="Ubah jurusan">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={async () => {
                      const ok = await confirmDialog.confirm({ title: 'Hapus Jurusan?', message: `"${d.name}" beserta relasi kelasnya akan terpengaruh.`, danger: true, confirmText: 'Hapus' })
                      if (!ok) return
                      try {
                        await deleteDepartment(d.id)
                        toast.success('Jurusan dihapus.')
                        query.reload()
                      } catch (err) {
                        toast.error(friendlyError(err))
                      }
                    }}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                    aria-label="Hapus jurusan"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <h3 className="text-sm font-bold text-slate-800">{d.name}</h3>
              <p className="line-clamp-2 text-xs leading-relaxed text-slate-400">{d.description || '-'}</p>
              {!d.is_active && <Badge tone="gray">Nonaktif</Badge>}
            </CardBody>
          ))}
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? 'Ubah Jurusan' : 'Tambah Jurusan'} size="sm">
        {editing && (
          <>
            <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
              <Input label="Kode" placeholder="cth: RPL" value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} required autoFocus />
              <Input label="Nama Jurusan" placeholder="cth: Rekayasa Perangkat Lunak" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required />
              <Input label="Deskripsi" className="sm:col-span-2" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:bg-slate-800 dark:text-slate-200">
              <Button variant="ghost" onClick={() => setEditing(null)}>Batal</Button>
              <Button
                onClick={async () => {
                  if (!editing.code.trim() || !editing.name.trim()) {
                    toast.error('Kode & nama wajib diisi.')
                    return
                  }
                  try {
                    await upsertDepartment({ id: editing.id, code: editing.code.trim(), name: editing.name.trim(), description: editing.description || null })
                    toast.success('Jurusan tersimpan.')
                    setEditing(null)
                    query.reload()
                  } catch (err) {
                    toast.error(friendlyError(err))
                  }
                }}
              >
                Simpan
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  )
}


