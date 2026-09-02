import { useEffect, useState } from 'react'
import { GraduationCap, Plus, Pencil, Trash2, KeyRound } from 'lucide-react'
import { useAsync, useDebounce, useDocumentTitle } from '@/hooks/useAsync'
import { useToast } from '@/hooks/useToast'
import { useConfirm } from '@/hooks/useConfirm'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { SearchInput } from '@/components/ui/FormControls'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { DataTable, Pagination } from '@/components/ui/DataTable'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback'
import {
  listStudents,
  updateStudent,
  listClasses,
} from '@/services/academics.service'
import { pingManageUser, createFullUser, resetUserPassword, updateUser as edgeUpdateUser, deleteUser } from '@/services/users.service'
import { supabase } from '@/services/client'
import { friendlyError } from '@/lib/errors'
import { randomCode } from '@/lib/utils'
import type { Student } from '@/types/models'

export default function StudentsPage() {
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [page, setPage] = useState(1)
  const debounced = useDebounce(search)
  useDocumentTitle('Data Siswa')
  const toast = useToast()
  const confirmDialog = useConfirm()

  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<{ profileId: string; name: string } | null>(null)

  const query = useAsync(
    () =>
      Promise.all([
        listStudents({ search: debounced || undefined, classId: classFilter || undefined, page, pageSize: 15 }),
        listClasses(),
      ]),
    [debounced, classFilter, page],
  )

  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />

  const [studentsResult, classes] = query.data ?? [{ rows: [], total: 0 }, []]

  return (
    <>
      <PageHeader
        title="Data Siswa"
        subtitle={`${studentsResult.total} siswa terdaftar`}
        icon={<GraduationCap className="h-5 w-5" />}
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Tambah Siswa</Button>}
      />

      <Card>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <SearchInput placeholder="Cari nama / NIS / NISN..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
          <Select
            className="w-full sm:w-52"
            placeholder="Semua Kelas"
            value={classFilter}
            onChange={(e) => { setClassFilter(e.target.value); setPage(1) }}
            options={classes.map((c) => ({ value: c.id, label: c.name }))}
          />
        </div>

        {query.loading ? (
          <TableSkeleton cols={5} />
        ) : (
          <>
            <DataTable
              rowKey={(s) => s.id}
              data={studentsResult.rows}
              emptyState={
                <EmptyState
                  icon={<GraduationCap className="h-6 w-6" />}
                  title="Belum ada siswa"
                  description="Tambahkan siswa satu per satu atau gunakan Import CSV untuk data massal."
                  action={<Button size="sm" onClick={() => setCreateOpen(true)} icon={<Plus className="h-4 w-4" />}>Tambah Siswa</Button>}
                />
              }
              columns={[
                {
                  key: 'student',
                  header: 'Siswa',
                  render: (s) => (
                    <div className="flex items-center gap-3">
                      <Avatar name={s.profiles?.full_name ?? '?'} size="xs" />
                      <div>
                        <p className="text-[13px] font-semibold text-slate-800">{s.profiles?.full_name}</p>
                        <p className="text-[11px] text-slate-400">@{s.profiles?.username}</p>
                      </div>
                    </div>
                  ),
                },
                { key: 'nis', header: 'NIS', render: (s) => s.nis ?? '-', className: 'whitespace-nowrap' },
                {
                  key: 'class',
                  header: 'Kelas',
                  render: (s) => (
                    <Badge tone={s.classes?.departments?.code ? 'blue' : 'gray'}>
                      {s.classes?.name ?? '-'}
                      {s.classes?.departments?.code ? ` · ${s.classes.departments.code}` : ''}
                    </Badge>
                  ),
                },
                { key: 'gender', header: 'L/P', render: (s) => (s.gender === 'L' ? 'Laki-laki' : s.gender === 'P' ? 'Perempuan' : '-') },
                {
                  key: 'status',
                  header: 'Status',
                  render: (s) => {
                    const active = (s.profiles as unknown as { is_active?: boolean } | null)?.is_active ?? s.is_active
                    return (
                      <button
                        onClick={async () => {
                          try {
                            await edgeUpdateUser(s.profile_id!, { is_active: !active })
                            toast.success(active ? 'Akun dinonaktifkan.' : 'Akun diaktifkan.')
                            query.reload()
                          } catch (err) {
                            toast.error(friendlyError(err))
                          }
                        }}
                      >
                        <Badge tone={active ? 'green' : 'red'} dot>{active ? 'Aktif' : 'Nonaktif'}</Badge>
                      </button>
                    )
                  },
                },
                {
                  key: 'actions',
                  header: '',
                  render: (s) => (
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setEditingStudent(s)} title="Ubah data" className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-sky-50 hover:text-sky-600">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => setResetTarget({ profileId: s.profile_id!, name: s.profiles?.full_name ?? '' })} title="Reset password" className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-violet-50 hover:text-violet-600">
                        <KeyRound className="h-4 w-4" />
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await confirmDialog.confirm({
                            title: 'Hapus Siswa?',
                            message: `Akun & data "${s.profiles?.full_name}" akan dihapus permanen beserta riwayat ujiannya.`,
                            danger: true,
                            confirmText: 'Hapus',
                          })
                          if (!ok) return
                          try {
                            if (s.profile_id) await deleteUser(s.profile_id)
                            else await supabase.from('students').delete().eq('id', s.id)
                            toast.success('Siswa dihapus.')
                            query.reload()
                          } catch (err) {
                            toast.error(friendlyError(err))
                          }
                        }}
                        title="Hapus"
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ),
                  headerClassName: 'text-right w-36',
                },
              ]}
            />
            <Pagination page={page} pageSize={15} total={studentsResult.total} onPageChange={setPage} />
          </>
        )}
      </Card>

      <CreateStudentModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        classes={classes}
        onSaved={() => {
          setCreateOpen(false)
          query.reload()
        }}
      />

      <EditStudentModal
        student={editingStudent}
        classes={classes}
        onClose={() => setEditingStudent(null)}
        onSaved={() => {
          setEditingStudent(null)
          query.reload()
        }}
      />

      <ResetPasswordModal target={resetTarget} onClose={() => setResetTarget(null)} />
    </>
  )
}

interface FormState {
  fullName: string
  username: string
  password: string
  nis: string
  nisn: string
  gender: string
  classId: string
  phone: string
  email: string
  birthPlace: string
  birthDate: string
  address: string
}

const EMPTY_FORM: FormState = {
  fullName: '',
  username: '',
  password: randomCode(8),
  nis: '',
  nisn: '',
  gender: '',
  classId: '',
  phone: '',
  email: '',
  birthPlace: '',
  birthDate: '',
  address: '',
}

function CreateStudentModal({
  open,
  onClose,
  classes,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  classes: Awaited<ReturnType<typeof listClasses>>
  onSaved: () => void
}) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [edgeAvailable, setEdgeAvailable] = useState<boolean | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_FORM, password: randomCode(8) })
      void checkEdge()
    }
  }, [open])

  const checkEdge = async () => {
    try {
      await pingManageUser()
      setEdgeAvailable(true)
    } catch {
      setEdgeAvailable(false)
    }
  }

  const submit = async () => {
    if (!form.fullName.trim() || !form.username.trim() || form.password.length < 8 || !form.classId) {
      toast.error('Nama, username, password (min. 8 karakter), dan kelas wajib diisi.')
      return
    }
    setSaving(true)
    try {
      await createFullUser({
        username: form.username.trim().toLowerCase(),
        password: form.password,
        fullName: form.fullName.trim(),
        role: 'student',
        student: {
          nis: form.nis || undefined,
          nisn: form.nisn || undefined,
          gender: form.gender === 'L' || form.gender === 'P' ? (form.gender as 'L' | 'P') : undefined,
          birth_place: form.birthPlace || undefined,
          birth_date: form.birthDate || undefined,
          address: form.address || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          class_id: form.classId,
        },
      })
      toast.success(`Siswa "${form.fullName}" berhasil dibuat.`)
      onSaved()
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Tambah Siswa Baru" size="lg">
      <div className="space-y-5 px-6 py-5">
        {edgeAvailable === false && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-700">
            Edge Function <strong>manage-user</strong> belum ter-deploy — pembuatan akun akan menggunakan mode fallback otomatis (RPC / signUp) sehingga tetap berjalan.
            Untuk performa terbaik, deploy sesuai <code className="rounded bg-amber-100 px-1">docs/SUPABASE_SETUP.md</code>.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nama Lengkap *" placeholder="Nama sesuai absen" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required autoFocus />
          <Input label="Username *" placeholder="cth: budi.santoso" autoCapitalize="none" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.replace(/\s/g, '').toLowerCase() })} required hint="Digunakan untuk login." />
          <Input label="Password Awal *" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required hint="Minimal 8 karakter."
            rightSlot={
              <button type="button" onClick={() => setForm((f) => ({ ...f, password: randomCode(8) }))} className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-500 hover:bg-slate-200">Acak</button>
            }
          />
          <Select label="Kelas *" placeholder="Pilih kelas" required value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })} options={classes.map((c) => ({ value: c.id, label: `${c.name}${c.departments?.code ? ` · ${c.departments.code}` : ''}` }))} />
          <Input label="NIS" value={form.nis} onChange={(e) => setForm({ ...form, nis: e.target.value })} />
          <Input label="NISN" value={form.nisn} onChange={(e) => setForm({ ...form, nisn: e.target.value })} />
          <Select label="Jenis Kelamin" placeholder="Pilih" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} options={[{ value: 'L', label: 'Laki-laki' }, { value: 'P', label: 'Perempuan' }]} />
          <Input label="No. Telepon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Tempat Lahir" value={form.birthPlace} onChange={(e) => setForm({ ...form, birthPlace: e.target.value })} />
          <Input label="Tanggal Lahir" type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
        </div>
        <Input label="Alamat" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
        <Button variant="ghost" onClick={onClose}>Batal</Button>
        <Button onClick={submit} loading={saving}>Buat Akun Siswa</Button>
      </div>
    </Modal>
  )
}

function EditStudentModal({
  student,
  classes,
  onClose,
  onSaved,
}: {
  student: Student | null
  classes: Awaited<ReturnType<typeof listClasses>>
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  useEffect(() => {
    if (!student) return
    setForm({
      fullName: student.profiles?.full_name ?? '',
      username: student.profiles?.username ?? '',
      password: '',
      nis: student.nis ?? '',
      nisn: student.nisn ?? '',
      gender: student.gender ?? '',
      classId: student.class_id ?? '',
      phone: student.phone ?? '',
      email: student.email ?? '',
      birthPlace: student.birth_place ?? '',
      birthDate: student.birth_date ?? '',
      address: student.address ?? '',
    })
  }, [student])

  const submit = async () => {
    if (!student) return
    if (!form.fullName.trim() || !form.classId) {
      toast.error('Nama dan kelas wajib diisi.')
      return
    }
    setSaving(true)
    try {
      await updateStudent(student.id, {
        nis: form.nis || null,
        nisn: form.nisn || null,
        gender: form.gender === 'L' || form.gender === 'P' ? (form.gender as 'L' | 'P') : null,
        birth_place: form.birthPlace || null,
        birth_date: form.birthDate || null,
        address: form.address || null,
        phone: form.phone || null,
        email: form.email || null,
        class_id: form.classId || null,
      })
      if (form.fullName.trim() !== (student.profiles?.full_name ?? '')) {
        await supabase.from('profiles').update({ full_name: form.fullName.trim() }).eq('id', student.profile_id!)
      }
      toast.success('Data siswa diperbarui.')
      onSaved()
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={student !== null} onClose={onClose} title={`Ubah Data · ${student?.profiles?.full_name ?? ''}`} size="lg">
      <div className="space-y-5 px-6 py-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Username" value={form.username} disabled hint="Username tidak dapat diubah" />
          <Select label="Kelas *" placeholder="Pilih kelas" required value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })} options={classes.map((c) => ({ value: c.id, label: `${c.name}${c.departments?.code ? ` · ${c.departments.code}` : ''}` }))} />
          <Input label="Nama Lengkap *" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
          <Select label="Jenis Kelamin" placeholder="Pilih" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} options={[{ value: 'L', label: 'Laki-laki' }, { value: 'P', label: 'Perempuan' }]} />
          <Input label="NIS" value={form.nis} onChange={(e) => setForm({ ...form, nis: e.target.value })} />
          <Input label="NISN" value={form.nisn} onChange={(e) => setForm({ ...form, nisn: e.target.value })} />
          <Input label="No. Telepon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Tempat Lahir" value={form.birthPlace} onChange={(e) => setForm({ ...form, birthPlace: e.target.value })} />
          <Input label="Tanggal Lahir" type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
        </div>
        <Input label="Alamat" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
        <Button variant="ghost" onClick={onClose}>Batal</Button>
        <Button onClick={submit} loading={saving}>Simpan Perubahan</Button>
      </div>
    </Modal>
  )
}

function ResetPasswordModal({ target, onClose }: { target: { profileId: string; name: string } | null; onClose: () => void }) {
  const toast = useToast()
  const [newPassword, setNewPassword] = useState(randomCode(8))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (target) setNewPassword(randomCode(8))
  }, [target])

  const submit = async () => {
    if (!target) return
    if (newPassword.length < 8) {
      toast.error('Password minimal 8 karakter.')
      return
    }
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
        <Input
          label="Password Baru"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          rightSlot={
            <button type="button" onClick={() => setNewPassword(randomCode(10))} className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-500 hover:bg-slate-200">Acak</button>
          }
          hint="Bagikan password baru melalui jalur yang aman."
        />
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
        <Button variant="ghost" onClick={onClose}>Batal</Button>
        <Button onClick={submit} loading={saving}>Reset Password</Button>
      </div>
    </Modal>
  )
}
