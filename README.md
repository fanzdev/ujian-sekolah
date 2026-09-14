# 🎓 SMK AL-FATA CBT

> **Sistem Ujian Berbasis Komputer** untuk SMK — gratis di-hosting GitHub Pages, backend penuh dari Supabase.
> Siap menampung ±1000 siswa. Bukan demo — semua fitur benar-benar berfungsi.

<br>

## ⚡ Quick Start (TL;DR)

```bash
# 1. Install
npm install

# 2. Isi kredensial (lihat bagian [C] untuk cara mendapatkannya)
cp .env.example .env        # lalu edit file .env

# 3. Setup database sekali saja (bagian [C])
#    → jalankan 8 file SQL di Supabase SQL Editor

# 4. Buka http://localhost:5173/ujian/setup
#    → wizard pembuatan akun admin & profil sekolah tampil otomatis
#    (jika admin sudah ada, halaman login biasa yang muncul)

# 5. Jalankan!
npm run dev                 # buka http://localhost:5173/ujian/
```

Panduan lengkap tiap langkah ada di bawah. 👇

---

## 📑 Daftar Isi

| # | Bagian | Isi |
|---|--------|-----|
| A | [Fitur Aplikasi](#a-fitur-aplikasi) | Ringkasan kemampuan per role |
| B | [Teknologi yang Digunakan](#b-teknologi-yang-digunakan) | Semua framework & library |
| C | [Setup Supabase + API Key](#c-setup-supabase--api-key) | Dapatkan URL & anon key |
| D | [Jalankan Website Lokal](#d-jalankan-website-lokal) | `npm run dev` step-by-step |
| E | [Admin Pertama](#e-membuat-akun-admin-pertama) | Akun super admin pertama |
| F | [AI Essay Grading (OpenRouter)](#f-ai-essay-grading-openrouter-multi-api-key) | Multi API key + rotasi otomatis |
| G | [Deploy ke GitHub Pages](#g-deploy-ke-github-pages-online) | Online gratis permanen |
| H | [Environment Variables](#h-environment-variables) | Tabel lengkap semua variabel |
| I | [Struktur Folder](#i-struktur-folder) | Peta kode proyek |
| J | [Keamanan](#j-keamanan) | Model keamanan aplikasi |
| K | [Troubleshooting](#k-troubleshooting) | Masalah umum & solusi |
| L | [Dokumen Lanjutan](#l-dokumen-lanjutan) | docs/ TESTING, SECURITY, dst. |

---

## A. Fitur Aplikasi

### 🔴 Super Admin
- Dashboard statistik: siswa, guru, ujian aktif/mendatang, submission, rata-rata nilai, pelanggaran terbaru
- Kelola akun: Siswa, Guru, Kelas, Jurusan, Mata Pelajaran (+ reset password, aktif/nonaktifkan)
- Bank Soal & Ujian seluruh sekolah
- Hasil & Laporan · **Import CSV/Excel** dengan validasi & progress bar · **Export CSV/Excel/PDF**
- Audit Log & Log Pelanggaran Ujian
- Pengaturan: logo, warna tema, nama aplikasi, default ujian, keamanan, **pool API Key AI**

### 🟢 Guru
- Bank Soal dengan **6 tipe soal**: Pilihan Ganda · PG Kompleks · Benar/Salah · Menjodohkan · Isian Singkat · Essay
- Media soal: gambar / audio / video · editor rich text · bobot poin & kunci jawaban per soal
- Wizard buat ujian 5 langkah: Info → Peserta → Soal → Aturan → Review
- Randomisasi urutan soal & opsi (unik per siswa, konsisten saat refresh)
- PIN ujian, batas percobaan, passing grade, aturan anti-curang
- Monitoring peserta · Hasil, ranking & analisis butir soal
- **Penilaian essay**: saran nilai AI (OpenRouter) + nilai final manual guru — nilai guru selalu yang dipakai

### 🔵 Siswa
- Satu akun untuk semua ujian · hanya melihat ujian untuk kelas/jurusannya
- Halaman ujian mobile-friendly: navigasi nomor soal, tandai ragu-ragu, countdown timer
- **Autosave otomatis** — internet putus pun jawaban aman & tersinkron saat online
- Riwayat ujian, nilai, review jawaban + pembahasan (sesuai izin guru)
- Kartu ujian digital siap cetak

### ⚔️ Anti-Curang (berjalan di server)
Deteksi pindah tab / keluar fokus / keluar fullscreen → warning bertingkat → **auto-submit saat melewati batas**. Timer dihitung dari waktu server (kebal manipulasi jam device). Kunci jawaban **tidak pernah dikirim ke browser siswa**.

---

## B. Teknologi yang Digunakan

### Frontend — library yang berjalan di browser

| Teknologi | Fungsi |
|---|---|
| **React 18** | Library UI utama — semua halaman & komponen |
| **TypeScript 5** (strict) | Tipe ketat; bug tertangkap saat build, bukan saat dipakai |
| **Vite 5** | Dev server + build tool; hasil akhir murni file statis |
| **Tailwind CSS 3** | Styling utility-class; warna tema bisa diganti Admin tanpa sentuh kode |
| **React Router 6** | Routing base-path `/ujian/` + fallback `404.html` anti-404-saat-refresh |
| **@supabase/supabase-js 2** | Klien resmi Supabase (auth, database, storage, functions) |
| **Zod** | Validasi form & file import |
| **DOMPurify** | Sanitasi HTML — proteksi XSS pada konten rich text |
| **SheetJS (xlsx)** | Import/export Excel nyata (dimuat on-demand agar ringan) |
| **jsPDF + autotable** | Export PDF laporan/rekap (on-demand juga) |
| **PapaParse** | Pembaca/penulis CSV untuk import-export |
| **lucide-react** | Ikon SVG ringan |

### Backend — layanan Supabase

| Layanan | Fungsi |
|---|---|
| **Supabase Auth** | Login username+password, session, ganti password, banned akun |
| **PostgreSQL** | 25 tabel ter-normalisasi: siswa, guru, bank soal, ujian, attempt, nilai, log… |
| **Row Level Security** | Batas keamanan utama: admin penuh, guru miliknya, siswa datanya sendiri |
| **Postgres Functions (RPC)** | Mesin ujian di server: mulai attempt, autosave, submit + koreksi objektif otomatis, hitung pelanggaran |
| **Storage** | Bucket `media`: logo, gambar/audio/video soal, snapshot kamera opsional |
| **Edge Functions (Deno)** | `manage-user` (kelola akun oleh admin) · `grade-essay` (AI grading via OpenRouter) |

### Infrastruktur
**GitHub Pages** (hosting statis gratis) · **GitHub Actions** (CI/CD otomatis) · **ESLint** (kualitas kode)

---

## C. Setup Supabase + API Key

### C.1 Buat project Supabase

1. Login ke <https://supabase.com/dashboard>
2. Klik **New project** → isi nama (mis. `alfata-cbt`), password database, region **Singapore** → Create
3. Tunggu ±2 menit hingga siap

### C.2 Ambil API KEY (2 nilai)

1. Di dashboard project, klik ikon ⚙️ **Project Settings** (pojok kiri bawah)
2. Menu kiri → **API**
3. Salin dua nilai ini:

   | Yang dicari | Di mana | Dipakai sebagai |
   |---|---|---|
   | **Project URL** → `https://xxxx.supabase.co` | Bagian atas halaman API | `VITE_SUPABASE_URL` |
   | **Key `anon` `public`** → deretan panjang `eyJhbG...` | Bagian *Project API Keys* | `VITE_SUPABASE_ANON_KEY` |

> ⚠️ **Gunakan hanya key `anon public`.** Key `service_role` adalah master key yang melewati semua keamanan — dalam arsitektur ini ia hanya hidup di server (Edge Function), tidak pernah di frontend/repo.
>
> 💡 Kenapa anon key aman dipajang di browser? Karena proteksi data dilakukan RLS di database — tanpa login sah, orang lain tidak bisa membaca satu baris data pun.

### C.3 Jalankan migrasi database (sekali saja)

Dashboard Supabase → **SQL Editor** → *New query*. Untuk **setiap** file di bawah: salin isinya dari proyek → paste → **Run** → tunggu sukses → lanjut file berikutnya (**urutan wajib!**):

| # | File (`supabase/migrations/`) | Isi |
|---|---|---|
| 1️⃣ | `00001_schema.sql` | 25 tabel + enum + index + trigger profil auth |
| 2️⃣ | `00002_functions.sql` | RPC mesin ujian (start, autosave, submit, koreksi, pelanggaran) |
| 3️⃣ | `00003_triggers.sql` | Sinkronisasi peserta & rekalkulasi nilai essay |
| 4️⃣ | `00004_rls.sql` | Keamanan Row Level Security semua tabel |
| 5️⃣ | `00005_storage_seed.sql` | Storage bucket + default pengaturan sistem (**tanpa data demo**) |
| 6️⃣ | `00006_ai_keys.sql` | Tabel pool API Key AI + konfigurasi model default |
| 7️⃣ | `00007_setup_bootstrap.sql` | Wizard setup admin pertama (sekali pakai + kunci permanen) |

> ✅ Semua migrasi **idempotent** — aman dijalankan ulang bila ada yang gagal di tengah jalan.
| 8️⃣ | `00008_remove_demo_data.sql` | Pembersihan data demo lama (aman, hanya menghapus baris yang benar-benar kosong) |

### C.4 Aturan Auth

**Authentication → Sign In / Providers → Email** → matikan toggle **"Confirm email"**.

*(Opsional)* durasi sesi login: Authentication → Sessions → *Access token expiry*.

### C.5 Deploy Edge Function `manage-user` (wajib agar admin bisa membuat akun)

```bash
npm install -g supabase          # jika belum ada
supabase login
supabase link --project-ref xxxx # "ref" = potongan awal Project URL Anda
supabase functions deploy manage-user
```

Verifikasi: aplikasi → **Admin → Siswa → Tambah Siswa → "Cek Kesiapan Sistem"** → sukses ✓

---

## D. Jalankan Website Lokal

### D.1 Install dependencies

```bash
git clone https://github.com/USERNAME/ujian.git
cd ujian
npm install
```

### D.2 Isi file `.env`

Salin template lalu isi dengan nilai dari bagian C.2:

```bat
:: Windows
copy .env.example .env
```
```bash
# macOS/Linux
cp .env.example .env
```

Isi `.env`:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

> File `.env` sengaja diblokir `.gitignore` agar kunci tidak bocor ke repo.

### D.3 Jalankan

```bash
npm run dev
```

Buka alamat yang tampil di terminal — **wajib sertakan `/ujian/`**:

```text
http://localhost:5173/ujian/
```

Perintah lain yang tersedia:

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Development + hot-reload |
| `npm run build` | Build produksi ke `dist/` (+ generate `404.html`, `.nojekyll`) |
| `npm run preview` | Uji hasil build secara lokal (`localhost:4173/ujian/`) |
| `npm run typecheck` | Cek TypeScript saja |
| `npm run lint` | Cek kualitas kode |

---

## E. Membuat Akun Admin Pertama

**Cara utama — Wizard Setup otomatis (tanpa SQL):**

1. Setelah migrasi selesai, buka aplikasi:
   ```text
   http://localhost:5173/ujian/setup        # lokal
   https://USERNAME.github.io/ujian/setup   # produksi
   ```
2. Jika **belum ada admin**, sistem otomatis menampilkan **wizard 2 langkah**:
   - **Langkah 1 — Profil Sekolah**: nama aplikasi, nama sekolah, kota, tahun ajaran, kepala sekolah, alamat, logo (URL)
   - **Langkah 2 — Akun Admin**: nama lengkap, username, password + konfirmasi (dengan indikator kekuatan password)
3. Klik **Selesaikan Setup** → akun admin & branding tersimpan → wizard **terkunci permanen**
4. Anda diarahkan ke halaman login (username sudah terisi otomatis) → login dengan akun tersebut

> 🔒 Keamanan: status setup disimpan sebagai flag di database. Setelah selesai, endpoint setup **ditolak permanen** — bahkan jika suatu saat semua admin terhapus, wizard tidak akan terbuka lagi. Jika admin sudah ada sejak awal, `/setup` langsung dialihkan ke `/login`.

<details>
<summary><strong>Alternatif: SQL script manual</strong></summary>

Jika ingin membuat admin tanpa wizard, `scripts/create-admin.sql` tetap berfungsi:

1. Buka file tersebut → edit blok CONFIG (`v_username`, `v_password`, `v_full_name`)
2. Jalankan di SQL Editor — script menolak bila admin sudah ada
3. Login seperti biasa; wizard tidak akan muncul karena flag setup mengenali admin yang ada
</details>

---

## F. Fitur AI — DiHapus

Fitur AI (**AI Grading**, **Chat AI**, **Laporan AI**) sudah dihapus total dari aplikasi. Tidak perlu konfigurasi API key AI (OpenRouter dst.) — folder Edge Function `chat-ai`/`grade-essay` dijim kantana dan tabel/kolom AI sudah dibersikhanan via migrasi `supabase/migrations/00035_remove_ai.sql`.

Penilaian essay tetap berjalan **manual** dari halaman *Penilaian Essay* (guru beri nilai final & umpan balik langsung).

---

## G. Deploy ke GitHub Pages (Online)

Hasil akhir: live di **`https://USERNAME.github.io/ujian/`** — gratis, HTTPS otomatis.

### G.1 Push ke GitHub

```bash
git init
git add -A
git commit -m "feat: SMK AL-FATA CBT"
git branch -M main
git remote add origin https://github.com/USERNAME/ujian.git
git push -u origin main
```

> Nama repo = **`ujian`** (base path sudah dikunci). `package-lock.json` ikut di-commit. `.env` tidak ikut — disengaja.

### G.2 Masukkan API KEY ke GitHub

Repo GitHub → **Settings → Secrets and variables → Actions**:

| Tab | Name | Value | Contoh |
|---|---|---|---|
| **Variables** | `VITE_SUPABASE_URL` | Project URL | `https://xxxx.supabase.co` |
| **Secrets** | `VITE_SUPABASE_ANON_KEY` | Anon public key | `eyJhbGciOi...` |

### G.3 Aktifkan Pages + Deploy

1. Settings → **Pages** → Source: **GitHub Actions**
2. Selesai! Workflow otomatis berjalan tiap push ke `main` (typecheck → build → deploy)
3. Pantau tab **Actions** hingga lingkaran hijau ✓ → situs live

### G.4 Verifikasi cepat

- [ ] Homepage & `/ujian/login` terbuka
- [ ] Refresh halaman dalam tidak 404
- [ ] Logo/favicon tampil · login admin berhasil · responsif di HP

Checklist lengkap: [`docs/TESTING.md`](docs/TESTING.md).

---

## H. Environment Variables

### Frontend — `.env` lokal & GitHub Variables/Secrets

| Variabel | Wajib | Sumber Nilai | Aman di Browser? |
|---|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | Supabase → Settings → API → *Project URL* | ✅ Ya |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase → Settings → API → key `anon public` | ✅ Ya (dilindungi RLS) |

> Hanya variabel berawalan `VITE_` yang masuk bundle browser — karena itu hanya dua nilai publik di atas yang boleh memakai prefix ini. Penjelasan lengkap ada di file `.env.example`.

---

## I. Struktur Folder

```text
├── .github/workflows/deploy.yml     # CI/CD: typecheck → build → deploy Pages
├── docs/                            # dokumentasi teknis (setup, deploy, security, testing)
├── scripts/create-admin.sql         # bootstrap admin pertama
├── supabase/
│   ├── migrations/                  # 00001–00006 (schema → RLS → seed → AI keys)
│   └── functions/
│       ├── manage-user/index.ts     #   kelola akun (verifikasi JWT admin)
│       └── grade-essay/index.ts     #   AI grading + ROTASI MULTI API KEY
├── src/
│   ├── components/
│   │   ├── ui/                      # Button, Input, Modal, DataTable, Badge, dst.
│   │   ├── layout/                  # Sidebar, Topbar, shell dashboard
│   │   ├── exam/                    # Timer, Navigator, CameraMonitor, ViolationFlash
│   │   └── settings/AiKeysPanel.tsx # Panel pool API Key AI
│   ├── features/exam/               # useExamEngine (state machine ujian) + review
│   ├── hooks/                       # useAuth, useToast, useConfirm, useAsync…
│   ├── lib/                         # utils, datetime WIB, sanitize, constants
│   ├── pages/
│   │   ├── admin/                   # dashboard & manajemen sekolah
│   │   ├── teacher/                 # dashboard guru + penilaian essay
│   │   ├── student/                 # dashboard, ujian, riwayat, kartu ujian
│   │   ├── shared/                  # halaman bersama (bank soal, ujian, hasil…)
│   │   ├── exam/                    # ExamRunnerPage (halaman mengerjakan)
│   │   └── auth/ system/            # login, setup, 404
│   ├── routes/                      # route tree + guard per role
│   ├── services/                    # akses data per domain (exams, ai-keys, dst.)
│   └── types/models.ts              # tipe domain aplikasi
├── index.html                       # entry HTML + skrip restore redirect Pages
└── vite.config.ts                   # base '/ujian/' + generator dist/404.html
```

---

## J. Keamanan

| Ancaman | Mitigasi |
|---|---|
| Kebocoran kunci jawaban | Tidak pernah dikirim ke browser — payload soal disusun fungsi SQL yang menyaring kolom kunci; siswa tanpa hak SELECT ke tabel soal |
| Manipulasi timer/jam device | Deadline disimpan di DB; countdown pakai offset waktu server; submit divalidasi ulang server-side |
| SQL Injection | Semua query parameterized (supabase-js / plpgsql bind) |
| XSS | DOMPurify pada semua rich text |
| Privilege escalation | RLS semua tabel + trigger anti-edit-role + verifikasi role di Edge Function |
| Duplicate submission | Row-lock + cek status attempt di server |
| API Key AI bocor | Disimpan di tabel admin-only (RLS); Edge Function membaca via service role |
| Secret di repo | Hanya anon key publik di frontend; `.env` diblokir git; service role hidup di runtime function |

> Deteksi curang (tab/fokus/fullscreen) bersifat *indikator* — **tidak ada sistem yang bisa mencegah curang 100%**, dan aplikasi tidak mengklaim demikian.

Rincian: [`docs/SECURITY.md`](docs/SECURITY.md).

---

## K. Troubleshooting

| Gejala | Solusi |
|---|---|
| Halaman "Konfigurasi Environment Diperlukan" | `.env` belum diisi → lihat bagian D.2, lalu restart dev server |
| Blank putih pasca-deploy | Repo harus bernama `ujian`; akses via `https://USERNAME.github.io/ujian/` |
| 404 saat refresh halaman dalam | Pastikan deploy via workflow resmi (`dist/404.html` otomatis dibuat) & Pages Source = GitHub Actions |
| Login "Username/password salah" | Admin belum dibuat → jalankan `scripts/create-admin.sql` |
| Login "Profil tidak ditemukan" | Migrasi belum lengkap → ulangi C.3 urutan 1–6 |
| Tombol tambah siswa error | Deploy `manage-user`: `supabase functions deploy manage-user` |
| Tombol AI: "Belum ada API Key OpenRouter" | Tambahkan key di Pengaturan → AI Grading (bagian F) |
| Tombol AI: "Semua API Key gagal" | Semua key limit/invalid → cek status merah di panel AI, tambah/perbarui key |
| Error "row-level security" | Akses di luar wewenang — perilaku benar; cek kolom `role` user |
| Asset 404 pasca-deploy | Hard refresh (Ctrl+F5); nama file asset di-hash Vite sehingga cache aman |

---

## L. Dokumen Lanjutan

| Dokumen | Isi |
|---|---|
| [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md) | Setup Supabase detail + AI keys |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Panduan deployment GitHub Pages |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Arsitektur & keputusan teknis |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Model ancaman & mitigasi |
| [`docs/TESTING.md`](docs/TESTING.md) | Checklist QA end-to-end |

---

© SMK AL-FATA · React + Vite + TypeScript + Tailwind CSS + Supabase
