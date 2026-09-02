import { useEffect, useRef, useState } from 'react'
import { UserCircle, KeyRound, Camera, ChevronRight, Phone, MapPin } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { useDocumentTitle } from '@/hooks/useAsync'
import { Card, CardBody } from '@/components/ui/Card'
import { PasswordInput } from '@/components/ui/FormControls'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Feedback'
import { roleLabel, changePassword, updateMyProfile } from '@/services/auth.service'
import { getStudentByProfile, updateStudentSelfContact, getTeacherByProfile, updateTeacherSelf } from '@/services/academics.service'
import { uploadMedia, deleteMedia } from '@/services/storage.service'
import { friendlyError } from '@/lib/errors'
import { formatDateTime } from '@/lib/datetime'
import { supabase } from '@/services/client'
import type { Student } from '@/types/models'

export default function ProfilePage({ tab = 'profile' }: { tab?: string }) {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState(tab)

  useDocumentTitle('Profil Saya')

  if (!profile) return null

  return (
    <div className="mx-auto max-w-lg">
      <ProfileHero />
      <div className="mt-4 space-y-3">
        {activeTab === 'profile' ? (
          <>
            <ProfileInfoSection />
            <ContactSection />
            <SecuritySection onNavigate={() => setActiveTab('security')} />
          </>
        ) : (
          <>
            <SecurityPanel />
            <Button variant="ghost" className="w-full" onClick={() => setActiveTab('profile')}>
              Kembali ke Profil
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function ProfileHero() {
  const { profile, refresh } = useAuth()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  if (!profile) return null

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Ukuran foto maksimal 2MB.')
      return
    }
    setUploading(true)
    try {
      if (profile.avatar_url) {
        const oldPath = profile.avatar_url.split('/media/')[1]?.split('?')[0]
        if (oldPath) {
          void deleteMedia(oldPath).catch(() => undefined)
        }
      }
      const { url } = await uploadMedia(file, 'avatars')
      await updateMyProfile({ avatar_url: url })
      await refresh()
      toast.success('Foto profil berhasil diperbarui.')
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="card overflow-hidden animate-fade-in">
      <div className="relative bg-gradient-to-br from-primary-500 via-primary-600 to-indigo-700 px-6 py-8 text-center">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(255,255,255,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.2) 0%, transparent 50%)' }} />
        <div className="relative flex flex-col items-center">
          <div className="relative">
            <Avatar name={profile.full_name} src={profile.avatar_url} size="lg" className="ring-4 ring-white/20" />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-white text-primary-600 shadow-lg transition-transform hover:scale-110 dark:bg-slate-800"
              title="Ubah foto profil"
            >
              {uploading ? <Spinner className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          </div>
          <h2 className="mt-3 text-lg font-bold text-white">{profile.full_name}</h2>
          <p className="text-sm text-white/70">@{profile.username}</p>
          <div className="mt-2 flex gap-2">
            <Badge tone={profile.role === 'admin' ? 'purple' : profile.role === 'teacher' ? 'sky' : 'green'}>
              {roleLabel(profile.role)}
            </Badge>
            <Badge tone={profile.is_active ? 'green' : 'red'} dot>
              {profile.is_active ? 'Aktif' : 'Nonaktif'}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProfileInfoSection() {
  const { profile, refresh } = useAuth()
  const toast = useToast()
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  if (!profile) return null

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateMyProfile({ full_name: fullName.trim() })
      await refresh()
      toast.success('Nama berhasil diperbarui.')
      setEditing(false)
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardBody className="p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-medium text-slate-500">Informasi Akun</span>
          <button
            onClick={() => editing ? handleSave() : setEditing(true)}
            disabled={saving || (editing && fullName.trim() === profile.full_name)}
            className="text-sm font-semibold text-primary-600 disabled:opacity-50"
          >
            {saving ? 'Menyimpan...' : editing ? 'Simpan' : 'Ubah'}
          </button>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          <div className="flex items-center gap-4 px-4 py-3">
            <UserCircle className="h-5 w-5 shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-slate-400">Nama Lengkap</p>
              {editing ? (
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-0.5 w-full bg-transparent text-sm font-semibold text-slate-900 outline-none dark:text-slate-100"
                  autoFocus
                />
              ) : (
                <p className="mt-0.5 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{profile.full_name}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 px-4 py-3">
            <div className="h-5 w-5 shrink-0 text-center text-xs font-bold text-slate-400">@</div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-slate-400">Username</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">@{profile.username}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 px-4 py-3">
            <div className="h-5 w-5 shrink-0 text-center text-xs font-bold text-slate-400">#</div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-slate-400">Email Login</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{profile.username}@cbt.local</p>
            </div>
          </div>
          <div className="flex items-center gap-4 px-4 py-3">
            <div className="h-5 w-5 shrink-0 text-center text-xs font-bold text-slate-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-slate-400">Bergabung</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{formatDateTime(profile.created_at)}</p>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

function ContactSection() {
  const { profile } = useAuth()
  const toast = useToast()
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [studentInfo, setStudentInfo] = useState<Student | null>(null)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!profile) return
    let active = true
    const load = async () => {
      try {
        if (profile.role === 'student') {
          const s = await getStudentByProfile(profile.id)
          if (active && s) {
            setStudentInfo(s)
            setPhone(s.phone ?? '')
            setAddress(s.address ?? '')
          }
        } else if (profile.role === 'teacher') {
          const t = await getTeacherByProfile(profile.id)
          if (active && t) {
            const { data } = await supabase.from('teachers').select('phone, address').eq('id', t.id).maybeSingle()
            if (data && active) {
              setPhone((data.phone as string) ?? '')
              setAddress((data.address as string) ?? '')
            }
          }
        }
      } catch { /* ignore */ }
      if (active) setLoaded(true)
    }
    void load()
    return () => { active = false }
  }, [profile])

  if (!profile || (profile.role !== 'student' && profile.role !== 'teacher')) return null
  if (!loaded) return <Card><CardBody className="flex justify-center py-6"><Spinner className="h-5 w-5" /></CardBody></Card>

  const handleSave = async () => {
    setSaving(true)
    try {
      if (profile.role === 'student' && studentInfo) {
        await updateStudentSelfContact(studentInfo.id, { phone: phone || undefined, address: address || undefined })
      } else if (profile.role === 'teacher') {
        const t = await getTeacherByProfile(profile.id)
        if (t) await updateTeacherSelf(t.id, { phone: phone || undefined, address: address || undefined })
      }
      toast.success('Kontak berhasil diperbarui.')
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardBody className="p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-medium text-slate-500">Kontak</span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-sm font-semibold text-primary-600 disabled:opacity-50"
          >
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          <div className="flex items-center gap-4 px-4 py-3">
            <Phone className="h-5 w-5 shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-slate-400">No. Telepon / WA</p>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="08xx xxxx xxxx"
                className="mt-0.5 w-full bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-300 dark:text-slate-100 dark:placeholder:text-slate-600"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 px-4 py-3">
            <MapPin className="h-5 w-5 shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-slate-400">Alamat</p>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Alamat domisili"
                className="mt-0.5 w-full bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-300 dark:text-slate-100 dark:placeholder:text-slate-600"
              />
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

function SecuritySection({ onNavigate }: { onNavigate: () => void }) {
  return (
    <Card>
      <CardBody className="p-0">
        <button
          onClick={onNavigate}
          className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
        >
          <KeyRound className="h-5 w-5 shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Keamanan</p>
            <p className="text-[11px] text-slate-400">Ubah password & tips keamanan</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
        </button>
      </CardBody>
    </Card>
  )
}

function SecurityPanel() {
  const toast = useToast()
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const nextErrors: Record<string, string> = {}
    if (!currentPw) nextErrors.currentPw = 'Password saat ini wajib diisi.'
    if (newPw.length < 8) nextErrors.newPw = 'Password baru minimal 8 karakter.'
    if (newPw !== confirmPw) nextErrors.confirmPw = 'Konfirmasi password tidak sama.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSaving(true)
    try {
      await changePassword(currentPw, newPw)
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
      toast.success('Password berhasil diubah.')
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary-600" />
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Ubah Password</p>
        </div>
        <PasswordInput label="Password Saat Ini" name="current-password" autoComplete="current-password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} error={errors.currentPw} />
        <PasswordInput label="Password Baru" name="new-password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} error={errors.newPw} />
        <PasswordInput label="Konfirmasi Password Baru" name="confirm-password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} error={errors.confirmPw} />
        <Button onClick={submit} loading={saving} className="w-full">Perbarui Password</Button>
      </CardBody>
    </Card>
  )
}
