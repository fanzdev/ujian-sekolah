import { useEffect, useState } from 'react'
import { Users, Plus, Pencil, Trash2, KeyRound } from 'lucide-react'
import { useAsync, useDebounce, useDocumentTitle } from '@/hooks/useAsync'
import { useToast } from '@/hooks/useToast'
import { useConfirm } from '@/hooks/useConfirm'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { SearchInput } from '@/components/ui/FormControls'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { DataTable, Pagination } from '@/components/ui/DataTable'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback'
import {
  listTeachers,
} from '@/services/academics.service'
import {
  pingManageUser,
  createFullUser,
  resetUserPassword,
  updateUser as edgeUpdateUser,
  deleteUser,
} from '@/services/users.service'
import { supabase } from '@/services/client'
import { friendlyError } from '@/lib/errors'
import { randomCode } from '@/lib/utils'

interface TeacherRowData {
  id: string
  profile_id: string
  nip: string | null
  phone: string | null
  email: string | null
  address: string | null
  is_active: boolean
  profiles?: Partial<{ id: string; username: string; full_name: string }> | null
}

export default function TeachersPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debounced = useDebounce(search)
  useDocumentTitle('Data Guru')
  const toast = useToast()
  const confirmDialog = useConfirm()

  const [createOpen, setCreateOpen] = useState(false)
  const [editingTeacher, setEditingTeacher] = useState<TeacherRowData | null>(null)
  const [resetTarget, setResetTarget] = useState<{ profileId: string; name: string } | null>(null)

  const query = useAsync(
    () => listTeachers({ search: debounced || undefined, page, pageSize: 15 }),
    [debounced, page],
  )

  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />

  return (
    <>
      <PageHeader
        title="Data Guru"
        subtitle={`${query.data?.total ?? 0} guru terdaftar`}
        icon={<Users className="h-5 w-5" />}
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Tambah Guru</Button>}
      />

      <Card>
        <div className="p-4">
          <SearchInput placeholder="Cari nama / NIP..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
        </div>

        {query.loading ? (
          <TableSkeleton cols={4} />
        ) : (
          <>
            <DataTable<TeacherRowData>
              rowKey={(t) => t.id}
              data={query.data?.rows ?? []}
              emptyState={
                <EmptyState icon={<Users className="h-6 w-6" />} title="Belum ada guru" description="Buat akun guru untuk mengelola bank soal dan ujian." action={<Button size="sm" onClick={() => setCreateOpen(true)} icon={<Plus className="h-4 w-4" />}>Tambah Guru</Button>} />
              }
              columns={[
                {
                  key: 'teacher',
                  header: 'Guru',
                  render: (t) => (
                    <div className="flex items-center gap-3">
                      <Avatar name={t.profiles?.full_name ?? '?'} size="xs" />
                      <div>
                        <p className="text-[13px] font-semibold text-slate-800">{t.profiles?.full_name}</p>
                        <p className="text-[11px] text-slate-400">@{t.profiles?.username}{t.nip ? ` · NIP ${t.nip}` : ''}</p>
                      </div>
                    </div>
                  ),
                },
                { key: 'phone', header: 'Kontak', render: (t) => t.phone ?? '-', className: 'whitespace-nowrap' },
                {
                  key: 'status',
                  header: 'Status',
                  render: (t) => {
                    const active = (t.profiles as unknown as { is_active?: boolean } | null)?.is_active ?? t.is_active
                    return (
                      <button onClick={async () => {
                        try {
                          await edgeUpdateUser(t.profile_id, { is_active: !active })
                          toast.success(active ? 'Akun dinonaktifkan.' : 'Akun diaktifkan.')
                          query.reload()
                        } catch (err) {
                          toast.error(friendlyError(err))
                        }
                      }}>
                        <Badge tone={active ? 'green' : 'red'} dot>{active ? 'Aktif' : 'Nonaktif'}</Badge>
                      </button>
                    )
                  },
                },
                {
                  key: 'actions',
                  header: '',
                  render: (t) => (
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setEditingTeacher(t)} title="Ubah" className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-500/10 dark:hover:text-sky-400">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => setResetTarget({ profileId: t.profile_id, name: t.profiles?.full_name ?? '' })} title="Reset password" className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-500/10 dark:hover:text-violet-300">
                        <KeyRound className="h-4 w-4" />
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await confirmDialog.confirm({
                            title: 'Hapus Guru?',
                            message: `Akun "${t.profiles?.full_name}" akan dihapus permanen.`,
                            danger: true,
                            confirmText: 'Hapus',
                          })
                          if (!ok) return
                          try {
                            await deleteUser(t.profile_id)
                            toast.success('Guru dihapus.')
                            query.reload()
                          } catch (err) {
                            toast.error(friendlyError(err))
                          }
                        }}
                        title="Hapus"
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ),
                  headerClassName: 'text-right w-36',
                },
              ]}
            />
            <Pagination page={page} pageSize={15} total={query.data?.total ?? 0} onPageChange={setPage} />
          </>
        )}
      </Card>

      <CreateTeacherModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); query.reload() }} />
      <EditTeacherModal teacher={editingTeacher} onClose={() => setEditingTeacher(null)} onSaved={() => { setEditingTeacher(null); query.reload() }} />
      <SimpleResetPassword target={resetTarget} onClose={() => setResetTarget(null)} />
    </>
  )
}

function CreateTeacherModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [edgeAvailable, setEdgeAvailable] = useState<boolean | null>(null)
  const [form, setForm] = useState({ fullName: '', username: '', password: randomCode(8), nip: '', phone: '', email: '', address: '' })

  useEffect(() => {
    if (!open) return
    setForm({ fullName: '', username: '', password: randomCode(8), nip: '', phone: '', email: '', address: '' })
    pingManageUser().then(() => setEdgeAvailable(true)).catch(() => setEdgeAvailable(false))
  }, [open])

  const submit = async () => {
    if (!form.fullName.trim() || !form.username.trim() || form.password.length < 8) {
      toast.error('Nama, username, dan password (min. 8) wajib diisi.')
      return
    }
    setSaving(true)
    try {
      await createFullUser({
        username: form.username.trim().toLowerCase(),
        password: form.password,
        fullName: form.fullName.trim(),
        role: 'teacher',
        teacher: {
          nip: form.nip || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          address: form.address || undefined,
        },
      })
      toast.success(`Guru "${form.fullName}" berhasil dibuat.`)
      onSaved()
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Tambah Guru Baru" size="lg">
      <div className="space-y-5 px-6 py-5">
        {edgeAvailable === false && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-700">Edge Function <strong>manage-user</strong> belum ter-deploy — pembuatan akun akan menggunakan mode fallback otomatis sehingga tetap berjalan. Deploy sesuai <code className="rounded bg-amber-100 px-1">docs/SUPABASE_SETUP.md</code> untuk performa terbaik.</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nama Lengkap" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required autoFocus />
          <Input label="Username" autoCapitalize="none" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.replace(/\s/g, '').toLowerCase() })} required />
          <Input label="Password Awal" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required
            rightSlot={<button type="button" onClick={() => setForm((f) => ({ ...f, password: randomCode(10) }))} className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200">Acak</button>} />
          <Input label="NIP / NUPTK" value={form.nip} onChange={(e) => setForm({ ...form, nip: e.target.value })} />
          <Input label="No. Telepon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
      </div>
       <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:border-slate-700 dark:bg-slate-800/60">
        <Button variant="ghost" onClick={onClose}>Batal</Button>
        <Button onClick={submit} loading={saving}>Buat Akun Guru</Button>
      </div>
    </Modal>
  )
}

function EditTeacherModal({
  teacher,
  onClose,
  onSaved,
}: {
  teacher: TeacherRowData | null
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ fullName: '', nip: '', phone: '', email: '', address: '' })

  useEffect(() => {
    if (!teacher) return
    setForm({
      fullName: teacher.profiles?.full_name ?? '',
      nip: teacher.nip ?? '',
      phone: teacher.phone ?? '',
      email: teacher.email ?? '',
      address: teacher.address ?? '',
    })
  }, [teacher])

  const submit = async () => {
    if (!teacher) return
    setSaving(true)
    try {
      await supabase.from('teachers').update({
        nip: form.nip || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
      }).eq('id', teacher.id)
      if (form.fullName.trim()) {
        await supabase.from('profiles').update({ full_name: form.fullName.trim() }).eq('id', teacher.profile_id)
      }
      toast.success('Data guru diperbarui.')
      onSaved()
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={teacher !== null} onClose={onClose} title={`Ubah Data · ${teacher?.profiles?.full_name ?? ''}`} size="lg">
      <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
        <Input label="Nama Lengkap" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
        <Input label="NIP / NUPTK" value={form.nip} onChange={(e) => setForm({ ...form, nip: e.target.value })} />
        <Input label="No. Telepon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:border-slate-700 dark:bg-slate-800/60">
        <Button variant="ghost" onClick={onClose}>Batal</Button>
        <Button onClick={submit} loading={saving}>Simpan Perubahan</Button>
      </div>
    </Modal>
  )
}

export function SimpleResetPassword({ target, onClose }: { target: { profileId: string; name: string } | null; onClose: () => void }) {
  const toast = useToast()
  const [newPassword, setNewPassword] = useState(randomCode(8))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (target) setNewPassword(randomCode(8))
  }, [target])

  const submit = async () => {
    if (!target) return
    setSaving(true)
    try {
      await resetUserPassword(target.profileId, newPassword)
      toast.success('Password berhasil direset.')
      onClose()
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={target !== null} onClose={onClose} title={`Reset Password · ${target?.name ?? ''}`} size="sm">
      <div className="space-y-4 px-6 py-5">
        <Input label="Password Baru" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required
          rightSlot={<button type="button" onClick={() => setNewPassword(randomCode(10))} className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200">Acak</button>} />
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:bg-slate-800 dark:text-slate-200">
        <Button variant="ghost" onClick={onClose}>Batal</Button>
        <Button onClick={submit} loading={saving}>Reset Password</Button>
      </div>
    </Modal>
  )
}
