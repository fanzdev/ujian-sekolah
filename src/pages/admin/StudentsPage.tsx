import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GraduationCap, Plus, Pencil, Trash2, KeyRound, Printer, Download } from 'lucide-react'
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
  listDepartments,
} from '@/services/academics.service'
import { pingManageUser, createFullUser, resetUserPassword, updateUser as edgeUpdateUser, deleteUser } from '@/services/users.service'
import { supabase } from '@/services/client'
import { friendlyError } from '@/lib/errors'
import { randomCode } from '@/lib/utils'
import { formatDate } from '@/lib/datetime'
import type { Student } from '@/types/models'
import { downloadIdCard, generateIdCardPreviewDataURL, generateIdCardPrintDataURLs } from '@/services/id-card.service'

export default function StudentsPage() {
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [page, setPage] = useState(1)
  const debounced = useDebounce(search)
  useDocumentTitle('Data Siswa')
  const toast = useToast()
  const confirmDialog = useConfirm()

  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<{ profileId: string; name: string } | null>(null)
  const [previewStudent, setPreviewStudent] = useState<Student | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [downloadBusy, setDownloadBusy] = useState(false)
  const [printingAll, setPrintingAll] = useState(false)
  const [printCards, setPrintCards] = useState<string[] | null>(null)
  const printRequested = useRef(false)
  const printSheetRef = useRef<HTMLDivElement | null>(null)

  const query = useAsync(
    () =>
      Promise.all([
        listStudents({ search: debounced || undefined, classId: classFilter || undefined, departmentId: departmentFilter || undefined, page, pageSize: 15 }),
        listClasses(),
        listDepartments(),
      ]),
    [debounced, classFilter, departmentFilter, page],
  )

  useEffect(() => {
    const done = () => {
      document.body.classList.remove('printing-idcards')
      setPrintCards(null)
    }
    window.addEventListener('afterprint', done)
    return () => window.removeEventListener('afterprint', done)
  }, [])

  useEffect(() => {
    if (!printRequested.current || !printCards) return
    printRequested.current = false
    let cancelled = false
    const wait = async () => {
      const nodes = printSheetRef.current?.querySelectorAll('img') ?? []
      await Promise.all(Array.from(nodes).map((im) => im.decode().catch(() => undefined)))
      if (cancelled) return
      document.body.classList.add('printing-idcards')
      window.print()
      setPrintingAll(false)
    }
    const t = window.setTimeout(() => void wait(), 300)
    return () => { cancelled = true; window.clearTimeout(t) }
  }, [printCards])

  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />

  const [studentsResult, classes, departments] = query.data ?? [{ rows: [], total: 0 }, [], []]

  const openPreview = async (s: Student) => {
    setPreviewStudent(s)
    setPreviewUrl(null)
    setPreviewError(null)
    setPreviewLoading(true)
    try {
      const url = await generateIdCardPreviewDataURL(s)
      setPreviewUrl(url)
    } catch (err) {
      setPreviewError(friendlyError(err))
    } finally {
      setPreviewLoading(false)
    }
  }

  const doDownload = async () => {
    if (!previewStudent || downloadBusy) return
    setDownloadBusy(true)
    try {
      await downloadIdCard(previewStudent)
      toast.success('ID Card berhasil diunduh.')
      setPreviewStudent(null)
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setDownloadBusy(false)
    }
  }

  const doPrintAll = async () => {
    if (printingAll) return
    setPrintingAll(true)
    try {
      const all = await listStudents({ page: 1, pageSize: 500 })
      const urls = await generateIdCardPrintDataURLs(all.rows)
      printRequested.current = true
      setPrintCards(urls)
    } catch (err) {
      toast.error(friendlyError(err))
      setPrintingAll(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Data Siswa"
        subtitle={`${studentsResult.total} siswa terdaftar`}
        icon={<GraduationCap className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              loading={printingAll}
              icon={<Printer className="h-4 w-4" />}
              onClick={() => void doPrintAll()}
            >
              {printingAll ? 'Menyiapkan...' : 'Cetak Semua ID Card'}
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Tambah Siswa</Button>
          </div>
        }
      />

      <Card>
        <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-[1fr_170px_170px] sm:items-center sm:gap-2">
          <SearchInput className="w-full sm:!w-full" placeholder="Cari nama / NIS / NISN..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
          <Select
            className="w-full"
            placeholder="Semua Jurusan"
            value={departmentFilter}
            onChange={(e) => { setDepartmentFilter(e.target.value); setClassFilter(''); setPage(1) }}
            options={departments.map((d) => ({ value: d.id, label: `${d.code} · ${d.name}` }))}
          />
          <Select
            className="w-full"
            placeholder="Semua Kelas"
            value={classFilter}
            onChange={(e) => { setClassFilter(e.target.value); setPage(1) }}
            options={classes.filter((c) => !departmentFilter || c.department_id === departmentFilter).map((c) => ({ value: c.id, label: c.name }))}
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
                { key: 'nisn', header: 'NISN', render: (s) => s.nisn ?? '-', className: 'whitespace-nowrap' },
                {
                  key: 'class',
                  header: 'Kelas',
                  render: (s) => (
                    <Badge tone={s.classes?.name ? 'blue' : 'gray'}>
                      {s.classes?.name ?? '-'}
                    </Badge>
                  ),
                },
                {
                  key: 'department',
                  header: 'Jurusan',
                  render: (s) => {
                    const dept = s.classes?.departments
                    if (!dept) return <span className="text-xs text-slate-400">-</span>
                    return <Badge tone="sky"><span>{dept.code}</span><span className="hidden sm:inline"> · {dept.name}</span></Badge>
                  },
                },
                { key: 'gender', header: 'L/P', render: (s) => (s.gender === 'L' ? 'Laki-laki' : s.gender === 'P' ? 'Perempuan' : '-') },
                {
                  key: 'contact',
                  header: 'Kontak',
                  render: (s) => (
                    <div className="min-w-[140px]">
                      <p className="text-xs text-slate-700 dark:text-slate-300">{s.phone ?? '-'}</p>
                      <p className="max-w-[180px] truncate text-[11px] text-slate-400">{s.email ?? ''}</p>
                    </div>
                  ),
                },
                {
                  key: 'birth',
                  header: 'TTL',
                  render: (s) => {
                    if (!s.birth_place && !s.birth_date) return <span className="text-xs text-slate-400">-</span>
                    return (
                      <div className="min-w-[120px]">
                        <p className="text-xs text-slate-700 dark:text-slate-300">{s.birth_place ?? '-'}</p>
                        <p className="text-[11px] text-slate-400">{s.birth_date ? formatDate(s.birth_date) : ''}</p>
                      </div>
                    )
                  },
                },
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
                      <button onClick={() => setEditingStudent(s)} title="Ubah data" className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-500/10 dark:hover:text-sky-400">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        title="Pratinjau & unduh kartu identitas"
                        onClick={() => void openPreview(s)}
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button onClick={() => setResetTarget({ profileId: s.profile_id!, name: s.profiles?.full_name ?? '' })} title="Reset password" className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-500/10 dark:hover:text-violet-300">
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
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ),
                  headerClassName: 'text-right w-44',
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
        departments={departments}
        onSaved={() => {
          setCreateOpen(false)
          query.reload()
        }}
      />

      <EditStudentModal
        student={editingStudent}
        classes={classes}
        departments={departments}
        onClose={() => setEditingStudent(null)}
        onSaved={() => {
          setEditingStudent(null)
          query.reload()
        }}
      />

      <ResetPasswordModal target={resetTarget} onClose={() => setResetTarget(null)} />

      <IdCardPreviewModal
        student={previewStudent}
        previewUrl={previewUrl}
        previewLoading={previewLoading}
        previewError={previewError}
        downloading={downloadBusy}
        onClose={() => setPreviewStudent(null)}
        onDownload={() => void doDownload()}
      />

      {printCards && printCards.length > 0 && createPortal(
        <div ref={printSheetRef} className="idcard-print-sheet" aria-hidden>
          {chunkSheets(printCards).map((sheet, p) => (
            <div key={p} className="idcard-print-page">
              {sheet.map((url, i) => (
                <img key={i} src={url} alt="" className="idcard-print-card" />
              ))}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

function chunkSheets<T>(items: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += 9) out.push(items.slice(i, i + 9))
  return out
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
  departments,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  classes: Awaited<ReturnType<typeof listClasses>>
  departments: Awaited<ReturnType<typeof listDepartments>>
  onSaved: () => void
}) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [edgeAvailable, setEdgeAvailable] = useState<boolean | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [deptId, setDeptId] = useState('')

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_FORM, password: randomCode(8) })
      setDeptId('')
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

  const filteredClassesCreate = deptId ? classes.filter((c) => c.department_id === deptId) : classes

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
          <Input label="Nama Lengkap" placeholder="Nama sesuai absen" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required autoFocus />
          <Input label="Username" placeholder="cth: budi.santoso" autoCapitalize="none" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.replace(/\s/g, '').toLowerCase() })} required hint="Digunakan untuk login." />
          <Input label="Password Awal" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required hint="Minimal 8 karakter."
            rightSlot={
              <button type="button" onClick={() => setForm((f) => ({ ...f, password: randomCode(8) }))} className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200">Acak</button>
            }
          />
          <Select label="Jurusan" placeholder="Pilih jurusan (filter kelas)" value={deptId} onChange={(e) => { setDeptId(e.target.value); setForm((f) => ({ ...f, classId: '' })) }} options={departments.map((d) => ({ value: d.id, label: `${d.code} · ${d.name}` }))} />
          <Select label="Kelas" placeholder={filteredClassesCreate.length ? 'Pilih kelas' : 'Tidak ada kelas di jurusan ini'} required value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })} options={filteredClassesCreate.map((c) => ({ value: c.id, label: `${c.name}${c.departments?.code ? ` · ${c.departments.code}` : ''}` }))} />
          <Input label="NIS" value={form.nis} onChange={(e) => setForm({ ...form, nis: e.target.value })} />
          <Input label="NISN" value={form.nisn} onChange={(e) => setForm({ ...form, nisn: e.target.value })} />
          <Select label="Jenis Kelamin" placeholder="Pilih" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} options={[{ value: 'L', label: 'Laki-laki' }, { value: 'P', label: 'Perempuan' }]} />
          <Input label="No. Telepon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Tempat Lahir" value={form.birthPlace} onChange={(e) => setForm({ ...form, birthPlace: e.target.value })} />
          <Input label="Tanggal Lahir" type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
        </div>
        <Input label="Alamat" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:bg-slate-800 dark:text-slate-200">
        <Button variant="ghost" onClick={onClose}>Batal</Button>
        <Button onClick={submit} loading={saving}>Buat Akun Siswa</Button>
      </div>
    </Modal>
  )
}

function EditStudentModal({
  student,
  classes,
  departments,
  onClose,
  onSaved,
}: {
  student: Student | null
  classes: Awaited<ReturnType<typeof listClasses>>
  departments: Awaited<ReturnType<typeof listDepartments>>
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [deptId, setDeptId] = useState('')

  useEffect(() => {
    if (!student) return
    const cls = classes.find((c) => c.id === student.class_id)
    setDeptId(cls?.department_id ?? '')
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
  }, [student, classes])

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

  const filteredForEdit = deptId ? classes.filter((c) => c.department_id === deptId) : classes

  return (
    <Modal open={student !== null} onClose={onClose} title={`Ubah Data · ${student?.profiles?.full_name ?? ''}`} size="lg">
      <div className="space-y-5 px-6 py-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Username" value={form.username} disabled hint="Username tidak dapat diubah" />
          <Select label="Jurusan" placeholder="Pilih jurusan" required value={deptId} onChange={(e) => { setDeptId(e.target.value); setForm((f) => ({ ...f, classId: '' })) }} options={departments.map((d) => ({ value: d.id, label: `${d.code} · ${d.name}` }))} />
          <Select label="Kelas" placeholder={filteredForEdit.length ? 'Pilih kelas' : 'Tidak ada kelas di jurusan ini'} required value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })} options={filteredForEdit.map((c) => ({ value: c.id, label: `${c.name}${c.departments?.code ? ` · ${c.departments.code}` : ''}` }))} />
          <Input label="Nama Lengkap" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
          <Select label="Jenis Kelamin" placeholder="Pilih" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} options={[{ value: 'L', label: 'Laki-laki' }, { value: 'P', label: 'Perempuan' }]} />
          <Input label="NIS" value={form.nis} onChange={(e) => setForm({ ...form, nis: e.target.value })} />
          <Input label="NISN" value={form.nisn} onChange={(e) => setForm({ ...form, nisn: e.target.value })} />
          <Input label="No. Telepon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Tempat Lahir" value={form.birthPlace} onChange={(e) => setForm({ ...form, birthPlace: e.target.value })} />
          <Input label="Tanggal Lahir" type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
        </div>
        <Input label="Alamat" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <p className="text-[11px] text-slate-400">Mengubah jurusan akan memfilter daftar kelas. Jurusan siswa ditentukan oleh kelasnya.</p>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:bg-slate-800 dark:text-slate-200">
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
            <button type="button" onClick={() => setNewPassword(randomCode(10))} className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200">Acak</button>
          }
          hint="Bagikan password baru melalui jalur yang aman."
        />
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:bg-slate-800 dark:text-slate-200">
        <Button variant="ghost" onClick={onClose}>Batal</Button>
        <Button onClick={submit} loading={saving}>Reset Password</Button>
      </div>
    </Modal>
  )
}

function IdCardPreviewModal({
  student,
  previewUrl,
  previewLoading,
  previewError,
  downloading,
  onClose,
  onDownload,
}: {
  student: Student | null
  previewUrl: string | null
  previewLoading: boolean
  previewError: string | null
  downloading: boolean
  onClose: () => void
  onDownload: () => void
}) {
  if (!student) return null

  return (
    <Modal open={student !== null} onClose={onClose} size="md" ariaLabel="Pratinjau Kartu Identitas">
      <div className="space-y-5 px-6 py-5">
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Pratinjau Kartu Identitas
          </p>
          <p className="mt-1 text-xs text-slate-400">{student.profiles?.full_name ?? '-'} · {student.classes?.name ?? '-'}</p>
        </div>

        {previewLoading ? (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 py-16 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="flex flex-col items-center gap-3">
              <svg className="h-8 w-8 animate-spin text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <p className="text-xs text-slate-400">Menyiapkan pratinjau...</p>
            </div>
          </div>
        ) : previewError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-5 text-center dark:border-rose-800/40 dark:bg-rose-500/10">
            <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Gagal memuat pratinjau</p>
            <p className="mt-1 text-xs text-rose-500">{previewError}</p>
          </div>
        ) : previewUrl ? (
          <div className="flex justify-center">
            <img
              src={previewUrl}
              alt="Pratinjau kartu identitas"
              className="h-[440px] w-[250px] rounded-xl object-contain shadow-lg"
            />
          </div>
        ) : null}

        {!previewLoading && !previewError && (
          <p className="text-center text-xs text-slate-400">
            Ukuran kartu: 50 × 88 mm · Format PNG resolusi tinggi
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:bg-slate-800 dark:text-slate-200">
        <Button variant="ghost" onClick={onClose}>Tutup</Button>
        <Button
          icon={<Download className="h-4 w-4" />}
          onClick={onDownload}
          loading={downloading}
          disabled={!previewUrl || previewLoading}
        >
          Unduh Kartu
        </Button>
      </div>
    </Modal>
  )
}
