# Supabase Setup — SMK AL-FATA CBT

Ikuti langkah berikut secara berurutan. Total ±15 menit.

> ✅ **Semua file migrasi bersifat idempotent** — aman dijalankan ulang tanpa error "already exists". Jika ada file yang gagal di tengah jalan, perbaiki penyebabnya lalu jalankan ulang file yang sama; objek yang sudah terbentuk akan dilewati otomatis.

## 1. Buat Project

1. Buka <https://supabase.com/dashboard> → **New project**.
2. Isi nama (cth: `alfata-cbt`), password database (simpan aman), region terdekat (Singapore).
3. Tunggu hingga provisioning selesai.
4. Catat dari *Project Settings → API*:
   - `Project URL` → ini `VITE_SUPABASE_URL`
   - `anon public` key → ini `VITE_SUPABASE_ANON_KEY`

## 2. Jalankan Migrasi Database

Buka **SQL Editor** → New query, lalu jalankan file berikut **sesuai urutan** (satu per satu, dari folder `supabase/migrations/`):

| Urutan | File | Isi |
|---|---|---|
| 1 | `00001_schema.sql` | Enum, tabel, trigger profil auth |
| 2 | `00002_functions.sql` | Fungsi RPC mesin ujian (security definer) |
| 3 | `00003_triggers.sql` | Sinkronisasi peserta, total poin, rekalkulasi nilai |
| 4 | `00004_rls.sql` | Row Level Security seluruh tabel |
| 5 | `00005_storage_seed.sql` | Bucket Storage + default pengaturan sistem (**tanpa** data demo) |
| 6 | `00006_ai_keys.sql` | Tabel pool API Key AI + konfigurasi model default (**dihapus** oleh migrasi `00035_remove_ai.sql`) |
| 7 | `00007_setup_bootstrap.sql` | Wizard setup admin pertama (sekali pakai + kunci permanen) |
| 36 | `00036_reset_setup_on_full_wipe.sql` | Wipe total atomik: hapus semua data + admin, reset flag setup agar wizard `/setup` terbuka lagi |
| 8 | `00008_remove_demo_data.sql` | Hapus sisa data demo dari database lama (guarded delete) |

Setelah selesai, verifikasi: Table Editor menampilkan tabel-tabel di atas dan bucket `media` ada di Storage.

> 💡 Fitur AI (chat AI, AI grading, laporan AI) sudah dihapus total. Jika database lama masih mengandung tabel `ai_provider_keys`, kolom `ai_score`/`ai_feedback`/`ai_confidence`/`ai_provider` pada `essay_grades`, atau setting `system_settings.key='ai'`, jalankan migrasi terakhir **`00035_remove_ai.sql`** untuk membersihkan.

> Semua skema dapat dibuat ulang dari migrasi — tidak ada setup manual yang tidak terdokumentasi.

## 3. Konfigurasi Auth

Buka **Authentication → Sign In / Providers → Email**:

- ❌ Matikan **"Confirm email"** (akun dibuat oleh admin, sudah dikonfirmasi).
- ✅ Biarkan "Secure email change" default.

Opsional (Authentication → Sessions): atur *Access token expiry* sesuai kebijakan sekolah (default 3600s). Ini adalah pengaturan durasi sesi yang dirujuk halaman Pengaturan.

## 4. Deploy Edge Functions

Butuh [Supabase CLI](https://supabase.com/docs/guides/cli). Dari root repo:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Wajib untuk pembuatan akun siswa/guru oleh admin:
supabase functions deploy manage-user
```

### Verifikasi

Halaman **Admin → Siswa → Tambah Siswa → "Cek Kesiapan Sistem"** akan menguji Edge Function `manage-user`.

## 5. RLS

Tidak ada langkah manual — semua policy dibuat oleh migrasi `00004_rls.sql`. Prinsipnya:

- Admin: akses penuh. Guru: miliknya + bank published + ujian miliknya.
- Siswa: hanya data dirinya & payload ujian via RPC (tanpa akses langsung ke soal/kunci).

Uji cepat: login sebagai siswa, coba buka `/ujian/admin` → dialihkan; Network tab tidak boleh berisi response berisi `is_correct`/kunci sebelum submit+show_answers aktif.

## 6. Environment Variables Frontend

Isi `.env` (lokal) dan GitHub Variables/Secrets (produksi):

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>
```

## 7. Buat Admin Pertama

**Cara utama — Wizard Setup (disarankan):**

Setelah migrasi `00007` dijalankan, cukup buka aplikasi:

```text
http://localhost:5173/ujian/setup          # development
https://USERNAME.github.io/ujian/setup     # produksi
```

- Belum ada admin → **wizard setup** tampil: isi profil sekolah (nama, logo URL, alamat, kepala sekolah, tahun ajaran) lalu buat akun admin (username + password).
- Sudah ada admin → otomatis dialihkan ke halaman login biasa.

Wizard dijaga fungsi SQL `bootstrap_setup()` yang:

- hanya berhasil selama flag `setup_completed = false`,
- membuat user auth dengan password bcrypt,
- menyimpan branding sekolah ke `school_settings`,
- mengunci setup selamanya setelah sukses.

**Alternatif:** jalankan `scripts/create-admin.sql` di SQL Editor (edit blok CONFIG dulu). Script juga terkunci bila admin sudah ada. Setelah login pertama, **segera ganti password** di Profil → tab Keamanan.
