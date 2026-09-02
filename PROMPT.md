# MASTER PROMPT: SMK AL-FATA CBT

## 1. ROLE AND OBJECTIVE

Anda adalah **Senior Full-Stack Engineer, Software Architect, UI/UX Engineer, Database Engineer, Security Engineer, dan QA Engineer**.

Tugas Anda adalah membangun aplikasi web ujian sekolah bernama:

**SMK AL-FATA CBT**

Aplikasi ini harus benar-benar berfungsi, bukan sekadar prototype, mockup, atau halaman demo.

Aplikasi harus:

- dapat digunakan oleh Super Admin, Guru, dan Siswa
- responsive pada mobile, tablet, laptop, dan desktop
- modern, profesional, bersih, dan mudah digunakan
- menggunakan Supabase sebagai backend
- menggunakan Supabase Authentication
- menggunakan Supabase PostgreSQL Database
- menggunakan Supabase Storage bila diperlukan
- menggunakan Supabase Edge Functions bila diperlukan untuk operasi server-side yang aman
- dapat di-deploy ke GitHub Pages
- frontend harus bersifat static
- tidak membutuhkan Node.js server ketika production
- tidak membutuhkan VPS
- tidak membutuhkan hosting backend terpisah
- dapat berjalan pada URL:

`https://USERNAME.github.io/ujian/`

- menggunakan GitHub Actions untuk deployment otomatis
- mampu dirancang untuk sekitar **1000 siswa**
- memperhatikan performa, keamanan, concurrency, dan reliabilitas
- tidak menggunakan API key rahasia di frontend
- tidak membuat fitur palsu yang hanya terlihat bekerja

Prioritas utama:

1. Correctness
2. Security
3. Reliability
4. Performance
5. Maintainability
6. UX/UI
7. Visual appearance

Jangan mengorbankan keamanan atau correctness hanya demi tampilan.

---

# 2. ATURAN TEKNIS UTAMA

Gunakan teknologi modern yang kompatibel dengan GitHub Pages.

Jika tidak ada alasan kuat untuk memilih teknologi lain, gunakan:

- React
- Vite
- TypeScript
- Supabase JavaScript Client
- modern CSS/UI framework yang kompatibel dengan static deployment
- PWA/service-worker hanya jika benar-benar diperlukan dan tidak mengganggu deployment GitHub Pages

Pilih library UI yang:

- stabil
- ringan
- kompatibel dengan Vite
- dapat berjalan di static hosting
- tidak membutuhkan server runtime

Jika menggunakan library tambahan, jelaskan alasan penggunaannya.

Jangan menggunakan:

- Next.js server runtime
- Express server
- Node.js production server
- PHP
- Laravel
- server API custom
- database lokal sebagai database utama
- filesystem server
- secret API key di frontend

Semua production frontend harus dapat dibuild menjadi file static.

---

# 3. GITHUB PAGES REQUIREMENT

Repository target:

`USERNAME.github.io/ujian`

Aplikasi harus dikonfigurasi agar bekerja dengan base path:

`/ujian/`

Jangan mengasumsikan aplikasi berada di root domain.

Konfigurasi Vite harus memperhatikan:

`base: '/ujian/'`

Routing harus kompatibel dengan GitHub Pages.

Jangan membuat routing yang menyebabkan:

- 404 ketika refresh halaman
- blank page
- asset CSS tidak ditemukan
- JavaScript chunk 404
- gambar tidak muncul
- favicon tidak muncul

Jika menggunakan client-side routing, implementasikan solusi yang benar untuk GitHub Pages.

Pastikan semua asset menggunakan path yang kompatibel dengan `/ujian/`.

---

# 4. DEPLOYMENT

Buat:

`.github/workflows/deploy.yml`

Workflow harus:

1. checkout repository
2. install dependencies
3. build project
4. deploy hasil build ke GitHub Pages

Gunakan GitHub Actions modern.

Sediakan juga:

- `README.md`
- `.env.example`
- dokumentasi Supabase
- dokumentasi deployment
- dokumentasi setup database
- dokumentasi konfigurasi environment variable

Jangan pernah commit:

- `.env`
- Supabase secret key
- service role key
- AI API key
- password
- credentials

Frontend hanya boleh menggunakan public Supabase configuration yang memang aman untuk frontend.

---

# 5. SUPABASE ARCHITECTURE

Gunakan:

### Supabase Auth
Untuk:

- login
- logout
- session
- authentication
- password management

### Supabase PostgreSQL
Untuk:

- users/profile
- siswa
- guru
- admin
- jurusan
- kelas
- mata pelajaran
- bank soal
- soal
- pilihan jawaban
- ujian
- peserta ujian
- jawaban
- hasil ujian
- jadwal
- audit log
- violation log
- settings
- notification
- dan data lain yang diperlukan

### Supabase Storage

Gunakan Storage untuk:

- logo sekolah
- gambar soal
- audio soal
- video soal
- avatar bila diperlukan
- file import/export bila diperlukan

Jangan menyimpan file besar sebagai blob langsung di PostgreSQL jika Storage lebih sesuai.

### Supabase Edge Functions

Gunakan Edge Functions hanya untuk operasi yang tidak aman dilakukan di frontend.

Contohnya:

- AI essay grading
- operasi administratif sensitif
- validasi server-side tertentu
- operasi yang membutuhkan secret key
- integrasi eksternal

---

# 6. AUTHENTICATION

Role utama:

1. Super Admin
2. Guru
3. Siswa

Login default:

**Username + Password**

Karena Supabase Auth secara native berorientasi pada email, buat arsitektur username yang aman.

Jangan membuat password authentication sendiri dengan plaintext password.

Gunakan Supabase Auth sebagai sistem authentication utama.

Buat profile/role mapping yang jelas.

Pastikan:

- user hanya dapat mengakses dashboard sesuai role
- siswa tidak dapat membuka dashboard guru
- guru tidak dapat membuka dashboard admin
- guru hanya dapat mengelola resource yang menjadi haknya
- admin memiliki kontrol penuh
- unauthorized access ditolak di database melalui RLS

Jangan hanya mengandalkan pengecekan role di frontend.

Frontend authorization adalah UX.

**RLS adalah security boundary.**

---

# 7. ROLE: SUPER ADMIN

Super Admin memiliki kontrol penuh terhadap sistem.

Dashboard harus sangat lengkap.

Menu minimal:

- Dashboard
- Pengguna
- Siswa
- Guru
- Kelas
- Jurusan
- Mata Pelajaran
- Bank Soal
- Ujian
- Jadwal Ujian
- Peserta Ujian
- Hasil Ujian
- Laporan
- Import Data
- Export Data
- Audit Log
- Violation Log
- Pengaturan
- Profil
- Security

Admin dapat:

- membuat akun Guru
- membuat akun Siswa
- mengedit akun
- menghapus/nonaktifkan akun
- reset password
- mengatur role
- mengatur kelas
- mengatur jurusan
- mengatur mata pelajaran
- mengatur ujian
- mengatur jadwal
- mengatur peserta
- melihat seluruh hasil
- export hasil
- melihat aktivitas sistem
- melihat pelanggaran ujian
- mengatur konfigurasi sistem

Admin memberikan username dan password kepada Guru/Siswa.

---

# 8. ROLE: GURU

Guru memiliki dashboard sendiri.

Menu minimal:

- Dashboard
- Profil
- Mata Pelajaran
- Bank Soal
- Soal
- Buat Ujian
- Ujian Saya
- Jadwal
- Peserta
- Hasil Ujian
- Penilaian Essay
- Laporan

Guru dapat:

- membuat soal
- mengedit soal
- menghapus soal
- membuat bank soal
- membuat ujian
- memilih soal
- menentukan bobot soal
- mengatur randomisasi
- mengatur waktu
- menentukan peserta
- melihat hasil
- melakukan penilaian manual
- mengatur nilai essay
- export hasil

Guru tidak boleh mengakses data guru lain yang tidak menjadi haknya kecuali Admin mengizinkannya.

---

# 9. ROLE: SISWA

Dashboard siswa harus sederhana, modern, dan mobile-friendly.

Menu minimal:

- Dashboard
- Ujian Tersedia
- Ujian Berlangsung
- Riwayat Ujian
- Nilai
- Profil
- Kartu Ujian

Siswa menggunakan satu akun untuk seluruh ujian.

Siswa tidak perlu membuat akun baru untuk setiap ujian.

Siswa hanya dapat melihat ujian yang memang ditugaskan kepadanya berdasarkan:

- kelas
- jurusan
- peserta spesifik
- atau konfigurasi ujian

---

# 10. DATA SISWA

Sediakan data siswa yang lengkap dan extensible.

Minimal:

- ID
- username
- nama lengkap
- NIS
- NISN
- kelas
- jurusan
- jenis kelamin
- tempat lahir
- tanggal lahir
- alamat
- nomor telepon
- email jika diperlukan
- status aktif
- password/auth reference
- created_at
- updated_at

Admin dapat mengatur struktur kelas.

Default jurusan:

**TJKT**

Namun sistem harus mendukung banyak jurusan.

Admin dapat:

- membuat jurusan
- mengedit jurusan
- menghapus/nonaktifkan jurusan
- membuat kelas
- memindahkan siswa
- import siswa

---

# 11. DATA GURU

Minimal:

- ID
- username
- nama
- NIP/NUPTK jika digunakan
- email
- nomor telepon
- mata pelajaran
- status
- auth reference
- created_at
- updated_at

Satu guru dapat mengajar beberapa mata pelajaran.

Satu mata pelajaran dapat memiliki beberapa guru.

---

# 12. DATA MATA PELAJARAN

Admin dapat:

- membuat mata pelajaran
- mengedit
- menghapus/nonaktifkan
- menentukan guru
- menentukan kode mata pelajaran

Default:

Satu ujian hanya memiliki **satu mata pelajaran**.

Namun arsitektur database harus cukup fleksibel untuk pengembangan berikutnya.

---

# 13. BANK SOAL

Buat sistem Bank Soal yang serius.

Fitur:

- create bank soal
- edit
- delete
- search
- filter
- pagination
- kategori
- mata pelajaran
- tingkat kelas
- tingkat kesulitan
- tag
- status
- author
- tanggal dibuat

Guru dapat mengambil soal dari bank soal untuk membuat ujian.

Admin dapat mengelola seluruh bank soal.

---

# 14. JENIS SOAL

Sistem harus mendukung:

1. Pilihan Ganda
2. Pilihan Ganda Kompleks
3. Benar/Salah
4. Menjodohkan
5. Isian Singkat
6. Essay

Admin/Guru dapat menentukan jenis soal.

Soal harus mendukung:

- text
- gambar
- audio
- video
- tabel
- rumus
- rich text

Gunakan editor yang aman.

Sanitasi HTML untuk mencegah XSS.

---

# 15. BOBOT SOAL

Setiap soal dapat memiliki:

- point
- weight
- answer key
- scoring rule

Guru/Admin dapat mengatur bobot.

Contoh:

Pilihan Ganda:

2 poin

Essay:

10 poin

Sistem menghitung nilai secara konsisten.

Jangan hardcode nilai.

---

# 16. RANDOMISASI

Ujian harus mendukung konfigurasi:

- randomisasi soal
- randomisasi pilihan jawaban

Randomisasi dapat diaktifkan/nonaktifkan oleh Admin/Guru.

Setiap siswa dapat mendapatkan urutan soal berbeda.

Namun sistem harus menyimpan mapping soal yang diberikan kepada siswa sehingga:

- refresh tidak mengubah urutan
- reconnect tidak mengubah urutan
- hasil tetap konsisten

Jangan randomize setiap render React.

---

# 17. SISTEM UJIAN

Admin/Guru dapat membuat ujian.

Field minimal:

- nama ujian
- deskripsi
- mata pelajaran
- guru
- kelas
- jurusan
- tanggal mulai
- tanggal selesai
- jam mulai
- jam selesai
- durasi
- jumlah soal
- passing grade
- randomisasi soal
- randomisasi jawaban
- maksimal percobaan
- kode ujian
- PIN ujian
- status
- instruksi
- konfigurasi anti-cheating
- konfigurasi hasil
- konfigurasi pembahasan

Default:

**Satu ujian = satu mata pelajaran**

---

# 18. JADWAL UJIAN

Admin dan Guru dapat mengatur:

- tanggal
- jam mulai
- jam selesai
- durasi
- peserta

Siswa masih boleh masuk selama periode ujian masih aktif.

Jika siswa masuk terlambat tetapi waktu ujian masih tersedia, siswa tetap boleh mengerjakan.

Sistem harus menghitung waktu dengan benar.

Jangan hanya mengandalkan JavaScript timer.

Waktu harus divalidasi menggunakan timestamp server/database.

---

# 19. HALAMAN MENGERJAKAN UJIAN

Ini adalah salah satu halaman terpenting.

Desain harus:

- modern
- profesional
- clean
- mobile-first
- nyaman untuk membaca
- tombol besar pada mobile
- tidak terlalu banyak dekorasi
- tidak membuat siswa bingung

Minimal:

### Header

- nama ujian
- mata pelajaran
- identitas siswa
- countdown
- status koneksi

### Content

- nomor soal
- pertanyaan
- media
- pilihan jawaban
- tombol navigasi

### Navigation

- sebelumnya
- berikutnya
- tandai soal
- daftar nomor soal

Nomor soal menunjukkan:

- belum dijawab
- sudah dijawab
- ditandai
- soal aktif

---

# 20. AUTOSAVE

Jawaban harus otomatis tersimpan.

Jangan menunggu tombol "Submit".

Gunakan mekanisme:

- save saat jawaban berubah
- periodic autosave
- retry jika request gagal
- local temporary state
- sync kembali ketika koneksi tersedia

Status:

- Saving...
- Saved
- Offline
- Syncing
- Error

Jika koneksi internet terputus sementara:

1. jawaban tetap tersedia secara lokal
2. UI menunjukkan offline
3. sistem mencoba sync
4. ketika online, data disinkronkan
5. jangan menggandakan jawaban

Gunakan mekanisme idempotent/upsert yang benar.

---

# 21. SUBMIT UJIAN

Siswa dapat menekan:

**Kumpulkan Ujian**

Sebelum submit:

tampilkan konfirmasi.

Setelah submit:

- jawaban dikunci
- status attempt menjadi submitted
- waktu submit dicatat
- nilai objektif dihitung
- essay masuk proses penilaian
- siswa tidak dapat mengubah jawaban

Jika waktu habis:

**automatic submission**

Tetap pastikan submit dilakukan dengan mekanisme server-side yang aman.

---

# 22. ANTI-CHEATING

Implementasikan sistem anti-cheating yang komprehensif.

Deteksi:

- pindah tab
- browser kehilangan focus
- keluar fullscreen
- visibility change
- mencoba membuka halaman lain
- reload
- reconnect
- perubahan session
- aktivitas mencurigakan
- manipulasi timer
- perubahan data attempt
- duplicate submission
- perubahan browser context

Setiap pelanggaran dicatat.

Contoh:

```text
violation_type
timestamp
student
exam
attempt
severity
metadata
ip_address
user_agent
```

Konfigurasi default:

### 3 pelanggaran

Pelanggaran 1:
Warning

Pelanggaran 2:
Warning serius

Pelanggaran 3:
Ujian otomatis dikumpulkan

Admin dapat mengubah aturan.

Jangan mengklaim browser dapat mencegah cheating 100%.

Sistem hanya dapat mendeteksi indikator tertentu.

---

# 23. CAMERA MONITORING

Sistem mendukung camera monitoring selama ujian.

Namun implementasikan secara realistis.

Gunakan browser MediaDevices API dengan permission pengguna.

Sediakan:

- camera permission
- camera status
- preview
- monitoring state
- error state
- permission denied state

Jangan mengklaim kamera dapat membuktikan seseorang benar-benar tidak curang.

Jika diperlukan penyimpanan snapshot:

gunakan Supabase Storage dan kebijakan privasi yang jelas.

Admin dapat mengaktifkan/nonaktifkan fitur camera monitoring.

Jangan membuat camera feature menyebabkan ujian tidak dapat digunakan pada browser yang tidak mendukungnya kecuali konfigurasi ujian memang mewajibkannya.

---

# 24. IP ADDRESS DAN DEVICE

Simpan metadata ujian yang diperlukan seperti:

- IP address
- user agent
- browser
- OS
- device information
- login timestamp
- exam start timestamp
- exam submit timestamp

Jangan mengumpulkan data yang tidak diperlukan.

Perhatikan privasi dan keamanan data siswa.

---

# 25. ESSAY GRADING

Untuk Essay:

Default:

**AI-assisted grading**

Namun sistem harus menyediakan:

### AI grading

AI memberikan:

- suggested score
- reasoning/criteria summary
- confidence
- grading status

### Manual grading

Guru dapat:

- mengubah nilai
- memberikan feedback
- override AI score

Jika guru tidak cocok dengan nilai AI, guru dapat menentukan nilai sendiri.

Nilai final harus selalu dapat ditentukan oleh Guru/Admin sesuai permission.

Jangan menaruh AI API key di frontend.

Jika AI provider membutuhkan secret key:

gunakan Supabase Edge Function.

Sediakan abstraction layer agar provider AI dapat diganti.

Contoh:

```text
AI Provider
   ↓
Supabase Edge Function
   ↓
AI Grading Service
   ↓
Exam System
```

Jangan mengunci seluruh aplikasi pada satu provider AI.

---

# 26. HASIL UJIAN

Sistem menyimpan:

- total soal
- benar
- salah
- tidak dijawab
- nilai objektif
- nilai essay
- nilai akhir
- passing grade
- status lulus/tidak
- waktu mulai
- waktu selesai
- durasi
- pelanggaran

Guru dapat melihat:

- daftar siswa
- nilai
- ranking
- statistik
- distribusi nilai
- soal tersulit
- soal termudah
- persentase jawaban

Admin dapat melihat seluruh data.

---

# 27. HASIL UNTUK SISWA

Admin/Guru dapat menentukan apakah siswa boleh melihat:

- nilai
- benar
- salah
- jawaban
- pembahasan
- nilai essay
- feedback

Pembahasan dapat dijadwalkan untuk muncul setelah ujian selesai.

---

# 28. EXPORT

Sediakan:

### Excel

Untuk:

- siswa
- guru
- soal
- hasil ujian

### CSV

Untuk:

- siswa
- guru
- soal
- hasil

### PDF

Untuk:

- hasil ujian
- laporan
- daftar peserta
- rekap nilai

Pastikan export dilakukan dengan aman dan tidak membocorkan data kepada user yang tidak memiliki permission.

---

# 29. IMPORT

Admin dapat import:

### Siswa

CSV/Excel

### Guru

CSV/Excel

### Soal

CSV/Excel

Sediakan:

- template download
- preview
- validation
- error report
- duplicate detection
- import progress
- success/failure summary

Jangan langsung memasukkan data mentah tanpa validasi.

---

# 30. DASHBOARD ADMIN

Buat dashboard yang sangat lengkap.

Tampilkan:

- total siswa
- total guru
- total kelas
- total jurusan
- total mata pelajaran
- ujian aktif
- ujian akan datang
- ujian selesai
- peserta ujian
- submission
- rata-rata nilai
- tingkat kelulusan
- aktivitas terbaru
- pelanggaran terbaru
- status sistem
- statistik ujian

Gunakan chart hanya ketika membantu memahami data.

Jangan membuat dashboard menjadi festival grafik yang tidak berguna.

---

# 31. DASHBOARD GURU

Tampilkan:

- jumlah ujian
- ujian aktif
- ujian mendatang
- jumlah peserta
- rata-rata nilai
- submission
- essay yang belum dinilai
- aktivitas terbaru

---

# 32. DASHBOARD SISWA

Tampilkan:

- ujian tersedia
- ujian aktif
- ujian mendatang
- ujian selesai
- nilai terakhir
- statistik pribadi
- jadwal

Mobile-first.

---

# 33. KARTU UJIAN

Sediakan kartu ujian digital.

Informasi:

- nama siswa
- ID siswa
- kelas
- jurusan
- ujian
- mata pelajaran
- tanggal
- status

Dapat dicetak jika diperlukan.

---

# 34. SETTINGS

Admin memiliki halaman Pengaturan lengkap.

Pengaturan:

### Branding

- nama aplikasi
- nama sekolah
- logo
- favicon
- warna utama
- warna sekunder

Default:

Nama:

**SMK AL-FATA CBT**

Warna utama:

**Biru**

Logo default:

gunakan placeholder/logo generik yang legal dan mudah diganti.

### Exam Settings

- default duration
- randomisasi
- fullscreen
- violation limit
- camera
- IP logging
- device logging
- result visibility
- auto submit

### User Settings

- default role
- password policy
- username policy

### Security

- session duration
- audit logging
- login restrictions

---

# 35. THEME

Default:

**Modern Minimalist**

Gunakan:

- clean cards
- subtle shadows
- rounded corners
- consistent spacing
- typography jelas
- blue primary color
- responsive layout

Admin dapat mengganti warna utama.

Pastikan perubahan branding tidak merusak accessibility.

Gunakan contrast yang baik.

---

# 36. MOBILE UX

Mobile harus menjadi prioritas.

Pastikan:

- tombol mudah ditekan
- soal tidak terlalu sempit
- sidebar berubah menjadi mobile navigation
- timer selalu terlihat
- pilihan jawaban nyaman disentuh
- tidak ada horizontal overflow
- tabel dapat di-scroll
- modal tidak keluar layar
- keyboard mobile tidak merusak layout
- media soal responsive

Target:

**siswa dapat mengerjakan ujian dengan nyaman menggunakan smartphone.**

---

# 37. DATABASE DESIGN

Buat database schema yang normalized dan scalable.

Minimal pertimbangkan tabel:

```text
profiles
roles
students
teachers
departments
classes
subjects
question_banks
questions
question_options
matching_pairs
exams
exam_questions
exam_participants
exam_attempts
attempt_questions
answers
essay_grades
exam_results
exam_schedules
exam_violations
exam_events
audit_logs
notifications
system_settings
school_settings
media_files
```

Sesuaikan nama dan struktur jika ada desain yang lebih baik.

Gunakan:

- UUID
- foreign keys
- indexes
- unique constraints
- check constraints
- timestamps
- soft delete bila diperlukan

Jangan membuat semua tabel hanya dengan:

`id, name, created_at`

Database harus mencerminkan domain ujian sebenarnya.

---

# 38. RLS

Implementasikan Supabase Row Level Security secara serius.

Contoh:

### Admin

full access sesuai kebijakan.

### Guru

hanya dapat:

- melihat ujian miliknya
- mengelola soal miliknya
- melihat peserta ujian yang menjadi tanggung jawabnya
- melihat hasil ujian yang menjadi haknya

### Siswa

hanya dapat:

- melihat profile sendiri
- melihat ujian yang ditugaskan
- membuat attempt sesuai aturan
- melihat jawaban sendiri
- melihat hasil yang diizinkan

Siswa tidak boleh dapat membaca:

- jawaban siswa lain
- nilai siswa lain
- answer key sebelum waktunya
- bank soal privat
- data guru
- audit log

Jangan menggunakan:

`if (role === 'admin')`

sebagai satu-satunya mekanisme security.

---

# 39. SECURITY REQUIREMENTS

Wajib memperhatikan:

- XSS
- SQL injection
- CSRF jika relevan
- privilege escalation
- insecure direct object reference
- unauthorized database access
- exposed secrets
- leaked answer keys
- exam manipulation
- timer manipulation
- duplicate submission
- replay attacks
- session abuse

Jangan percaya data dari browser.

Semua data penting harus divalidasi kembali.

---

# 40. EXAM SECURITY

Answer key tidak boleh dikirim ke browser sebelum dibutuhkan.

Jangan mengirim seluruh database soal + answer key kepada browser.

Jangan menyimpan answer key di:

- frontend JavaScript
- localStorage
- public JSON
- static files

Jika browser dapat membaca answer key sebelum waktunya, sistem dianggap gagal.

---

# 41. PERFORMANCE

Target:

sekitar **1000 siswa**.

Optimalkan:

- database indexes
- pagination
- select fields seperlunya
- caching bila diperlukan
- lazy loading
- code splitting
- image optimization
- debounce search
- batched queries
- efficient realtime usage

Jangan menggunakan Supabase Realtime untuk semua data secara membabi buta.

Gunakan hanya jika memang dibutuhkan.

---

# 42. OFFLINE / CONNECTION RECOVERY

Aplikasi harus menangani:

- slow internet
- temporary disconnect
- reconnect
- request timeout
- failed autosave
- browser refresh

UI harus memberi tahu siswa kondisi:

`Online`

`Offline`

`Saving`

`Saved`

`Syncing`

`Sync Failed`

Jangan membuat siswa kehilangan jawaban hanya karena koneksi internet berkedip selama beberapa detik.

---

# 43. AUDIT LOG

Catat aktivitas penting.

Contoh:

```text
LOGIN
LOGOUT
CREATE_USER
UPDATE_USER
DELETE_USER
CREATE_EXAM
UPDATE_EXAM
DELETE_EXAM
CREATE_QUESTION
UPDATE_QUESTION
DELETE_QUESTION
START_EXAM
SUBMIT_EXAM
AUTO_SUBMIT
VIOLATION
GRADE_ESSAY
UPDATE_GRADE
IMPORT_DATA
EXPORT_DATA
CHANGE_SETTINGS
```

Simpan:

- actor
- role
- action
- resource
- resource_id
- timestamp
- metadata
- IP jika sesuai kebijakan

Admin dapat melihat Audit Log.

---

# 44. ERROR HANDLING

Jangan pernah membiarkan aplikasi menampilkan:

- blank page
- uncaught error
- white screen
- undefined
- NaN
- broken component

Buat:

- loading state
- empty state
- error state
- retry button
- toast notification
- fallback UI

Error message kepada user harus mudah dipahami.

Detail teknis jangan bocor ke user biasa.

---

# 45. FORM VALIDATION

Semua form harus mempunyai:

- validation
- required fields
- proper error message
- loading state
- disabled submit ketika sedang processing
- duplicate detection
- confirmation untuk destructive actions

Gunakan validation library yang stabil bila diperlukan.

---

# 46. ACCESSIBILITY

Perhatikan:

- keyboard navigation
- focus state
- semantic HTML
- ARIA bila diperlukan
- color contrast
- readable font
- touch target

Jangan menjadikan warna satu-satunya indikator status.

---

# 47. LOADING & EMPTY STATES

Semua halaman harus mempunyai kondisi:

### Loading

Skeleton/loading indicator.

### Empty

Contoh:

"Belum ada ujian."

### Error

Contoh:

"Gagal memuat data. Coba lagi."

### Success

Toast yang jelas.

---

# 48. NOTIFICATION SYSTEM

Sediakan sistem notification sederhana.

Contoh:

- ujian akan dimulai
- ujian tersedia
- hasil tersedia
- essay perlu dinilai
- akun dibuat
- perubahan jadwal

Jangan membuat sistem notification terlalu berat jika tidak diperlukan.

---

# 49. NO FAKE FEATURES

Ini sangat penting.

Jangan membuat tombol:

"AI Grading"

jika sebenarnya tidak bekerja.

Jangan membuat:

"Export Excel"

yang hanya menampilkan alert.

Jangan membuat:

"Camera Monitoring"

yang hanya menampilkan preview tanpa logic.

Jangan membuat:

"Database"

yang sebenarnya hanya menggunakan mock JSON.

Setiap fitur yang ditampilkan harus benar-benar terhubung dengan logic.

Jika suatu integrasi eksternal belum dapat dikonfigurasi, tampilkan konfigurasi yang jelas dan dokumentasikan cara mengaktifkannya.

---

# 50. SEED DATA

Sediakan seed data development.

Default:

School:

**SMK AL-FATA**

Application:

**SMK AL-FATA CBT**

Department:

**TJKT**

Buat akun development dengan mekanisme yang aman.

Jangan menaruh password production di repository.

README harus menjelaskan cara membuat akun Admin pertama.

---

# 51. ENVIRONMENT VARIABLES

Gunakan:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Jangan gunakan:

```env
SUPABASE_SERVICE_ROLE_KEY
```

di frontend.

Secret hanya boleh digunakan pada server-side/Edge Function environment.

Sediakan:

`.env.example`

---

# 52. SUPABASE SQL

Buat folder:

```text
supabase/
```

Berisi:

- migrations
- seed
- functions
- config jika diperlukan

Semua database schema harus dapat dibuat kembali dari migration.

Jangan membuat database manual yang tidak terdokumentasi.

---

# 53. PROJECT STRUCTURE

Gunakan struktur modular.

Contoh:

```text
src/
├── assets/
├── components/
├── layouts/
├── pages/
│   ├── admin/
│   ├── teacher/
│   ├── student/
│   ├── auth/
│   └── exam/
├── features/
│   ├── auth/
│   ├── users/
│   ├── students/
│   ├── teachers/
│   ├── exams/
│   ├── questions/
│   ├── results/
│   ├── anti-cheating/
│   ├── grading/
│   └── settings/
├── hooks/
├── lib/
│   ├── supabase/
│   ├── validation/
│   └── utils/
├── services/
├── types/
├── routes/
├── styles/
└── main.tsx
```

Sesuaikan jika diperlukan.

Jangan membuat satu file React berisi ribuan baris.

---

# 54. UI COMPONENTS

Buat reusable components:

- Button
- Input
- Select
- Modal
- Dialog
- Dropdown
- Table
- Pagination
- Badge
- Card
- Tabs
- Toast
- Tooltip
- Sidebar
- Navbar
- DataTable
- ConfirmDialog
- Loading
- EmptyState
- ErrorState
- ExamTimer
- QuestionNavigator
- ExamQuestion
- ViolationWarning
- ConnectionStatus

---

# 55. ROUTING

Buat route berdasarkan role.

Contoh:

```text
/login

/admin
/admin/dashboard
/admin/students
/admin/teachers
/admin/classes
/admin/subjects
/admin/question-banks
/admin/exams
/admin/schedules
/admin/results
/admin/reports
/admin/audit-logs
/admin/settings

/teacher
/teacher/dashboard
/teacher/question-banks
/teacher/questions
/teacher/exams
/teacher/results
/teacher/grading

/student
/student/dashboard
/student/exams
/student/exams/:id
/student/history
/student/results
/student/profile
```

Tambahkan route yang diperlukan.

Gunakan route guard.

---

# 56. EXAM STATE MACHINE

Jangan mengandalkan boolean sederhana.

Ujian/attempt harus memiliki state yang jelas.

Contoh:

```text
draft
scheduled
available
in_progress
submitted
auto_submitted
graded
published
cancelled
```

Gunakan transition logic yang valid.

Jangan mengizinkan state transition ilegal.

---

# 57. EXAM ATTEMPT

Setiap siswa memiliki exam attempt.

Attempt menyimpan:

- student
- exam
- start time
- end time
- status
- question order
- violation count
- last autosave
- submit time

Jika browser refresh:

attempt harus dilanjutkan.

Jika siswa sudah submit:

attempt tidak boleh dibuka lagi kecuali Admin mempunyai mekanisme khusus.

---

# 58. TIMER

Timer harus menggunakan server timestamp sebagai sumber kebenaran.

Frontend hanya menampilkan countdown.

Jangan membuat:

```text
setInterval(() => timeLeft--, 1000)
```

sebagai satu-satunya sumber waktu.

Perhitungkan:

- refresh
- timezone
- tab switching
- clock manipulation
- slow network

---

# 59. TIMEZONE

Gunakan timezone yang konsisten.

Default:

**Asia/Jakarta**

Simpan timestamp dalam format yang konsisten, idealnya UTC di database.

Convert ke timezone lokal hanya pada UI.

---

# 60. RESPONSIVE DESIGN

Pastikan semua halaman:

- mobile
- tablet
- desktop

tidak rusak.

Khusus halaman ujian:

mobile harus menjadi prioritas.

---

# 61. BROWSER COMPATIBILITY

Target modern:

- Chrome
- Edge
- Firefox
- Safari

Jika browser tidak mendukung fitur tertentu, berikan pesan yang jelas.

---

# 62. TESTING

Sebelum menyatakan aplikasi selesai, lakukan:

### Build test

```bash
npm run build
```

harus berhasil tanpa error.

### Type check

Tidak boleh ada TypeScript error.

### Lint

Tidak boleh ada error kritis.

### Production preview

Jalankan hasil build.

### Routing test

Test:

- login
- logout
- refresh
- direct URL
- `/ujian/`
- nested route

### Database test

Test:

- auth
- RLS
- CRUD
- permissions

### Exam test

Test:

- create exam
- start
- answer
- autosave
- refresh
- reconnect
- submit
- auto submit
- result

### Security test

Test:

- student mencoba akses admin
- teacher mencoba akses admin
- student mencoba membaca jawaban siswa lain
- student mencoba membaca answer key
- unauthorized user mencoba mengubah exam

Semua harus ditolak.

---

# 63. GITHUB PAGES TEST

Sebelum final:

Build project.

Deploy.

Kemudian test URL:

```text
https://USERNAME.github.io/ujian/
```

Test:

- homepage
- login
- dashboard
- CSS
- JavaScript
- images
- Supabase connection
- routing
- refresh
- mobile
- logout

Pastikan tidak ada:

```text
404
Failed to load resource
ChunkLoadError
Cannot find module
Blank screen
Supabase connection error
```

---

# 64. README

Buat README yang menjelaskan:

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Preview

```bash
npm run preview
```

## Supabase Setup

Jelaskan:

1. membuat project
2. menjalankan migration
3. konfigurasi Auth
4. membuat Storage bucket
5. konfigurasi RLS
6. konfigurasi environment
7. membuat Admin pertama

## GitHub Pages

Jelaskan:

1. repository
2. secrets/variables
3. GitHub Actions
4. Pages settings
5. deployment

---

# 65. DEVELOPMENT PHASE

Jangan langsung membuat seluruh aplikasi dalam satu langkah tanpa validasi.

Gunakan fase:

### Phase 1
Project setup + architecture.

### Phase 2
Supabase schema + migration + RLS.

### Phase 3
Authentication + roles.

### Phase 4
Admin dashboard.

### Phase 5
Teacher dashboard.

### Phase 6
Student dashboard.

### Phase 7
Question bank.

### Phase 8
Exam creation.

### Phase 9
Exam execution.

### Phase 10
Autosave + offline recovery.

### Phase 11
Anti-cheating.

### Phase 12
Grading.

### Phase 13
Results + reports.

### Phase 14
Import/export.

### Phase 15
Settings + branding.

### Phase 16
Security hardening.

### Phase 17
Performance optimization.

### Phase 18
GitHub Pages deployment.

### Phase 19
End-to-end testing.

Setelah setiap fase:

1. jalankan build
2. cek TypeScript
3. cek lint
4. cek runtime
5. cek database
6. perbaiki error
7. baru lanjut

---

# 66. CRITICAL REQUIREMENT: DO NOT STOP AT UI

Jika saya meminta pembangunan aplikasi, jangan hanya membuat:

- navbar
- sidebar
- dashboard cards
- dummy table
- fake data
- mock buttons

Semua harus terhubung ke sistem nyata.

Jika data berasal dari database, gunakan Supabase.

Jika authentication dibutuhkan, gunakan Supabase Auth.

Jika data membutuhkan authorization, gunakan RLS.

Jika membutuhkan secret, gunakan Edge Function.

---

# 67. CRITICAL REQUIREMENT: STATIC FRONTEND

Production frontend harus dapat berjalan di:

**GitHub Pages**

Tidak boleh membutuhkan:

```text
npm run start
node server.js
express
php
python server
```

setelah deployment.

Frontend harus menjadi static assets.

Backend capability berasal dari:

**Supabase**

Bukan dari GitHub Pages.

---

# 68. CRITICAL REQUIREMENT: PUBLIC REPOSITORY

Repository akan public.

Karena itu:

JANGAN pernah commit:

- password
- service role key
- JWT secret
- AI API key
- database password
- private credentials

Anggap seluruh repository dapat dibaca internet.

---

# 69. CRITICAL REQUIREMENT: NO HARDCODED SCHOOL DATA

Default:

```text
SMK AL-FATA CBT
SMK AL-FATA
TJKT
Blue
```

Tetapi semuanya harus dapat diubah Admin melalui Settings.

Jangan hardcode sehingga Admin tidak dapat menggantinya.

---

# 70. ERROR PREVENTION

Jika menemukan konflik requirement, pilih solusi yang:

1. paling aman
2. paling sederhana
3. paling scalable
4. kompatibel dengan GitHub Pages
5. kompatibel dengan Supabase

Dokumentasikan keputusan arsitektur.

Jangan mengubah requirement penting tanpa alasan.

---

# 71. FINAL QUALITY STANDARD

Aplikasi dianggap selesai hanya jika:

- frontend berhasil build
- tidak ada TypeScript error
- tidak ada runtime error
- Supabase terkoneksi
- authentication berjalan
- RLS berjalan
- Admin berjalan
- Guru berjalan
- Siswa berjalan
- CRUD berjalan
- bank soal berjalan
- ujian berjalan
- timer berjalan
- autosave berjalan
- reconnect berjalan
- randomisasi berjalan
- anti-cheating berjalan
- camera monitoring berjalan sesuai konfigurasi
- essay grading berjalan sesuai konfigurasi
- manual grading berjalan
- hasil berjalan
- export berjalan
- import berjalan
- audit log berjalan
- settings berjalan
- responsive berjalan
- GitHub Pages deployment berjalan
- refresh pada route tidak menyebabkan 404
- repository tidak membocorkan secret

---

# 72. FINAL INSTRUCTION TO THE AI AGENT

Sebelum menulis kode:

1. analisis requirement
2. buat architecture plan
3. buat database ERD/logical schema
4. buat RLS strategy
5. buat folder structure
6. buat implementation plan

Setelah itu implementasikan aplikasi secara bertahap.

Jangan membuat keputusan teknis penting secara diam-diam.

Jika terdapat dua pilihan teknologi, pilih yang paling kompatibel dengan:

**React/Vite + Supabase + GitHub Pages**

Jangan menggunakan backend custom.

Jangan membuat mock implementation untuk fitur production.

Jangan menganggap frontend security sebagai security utama.

Jangan mengirim answer key ke client sebelum waktunya.

Jangan menyimpan secret di frontend.

Jangan membuat timer client-side sebagai sumber waktu utama.

Jangan membuat randomisasi soal setiap render.

Jangan kehilangan jawaban ketika koneksi internet sementara terputus.

Jangan menghapus data penting secara permanen tanpa confirmation dan permission.

Jangan menyelesaikan task dengan mengatakan "fitur ini dapat ditambahkan nanti" jika fitur tersebut termasuk requirement.

Jika menemukan bug selama implementasi, perbaiki sebelum melanjutkan.

Jika build gagal, jangan lanjut ke fitur berikutnya sebelum memperbaikinya.

Jika RLS gagal, jangan menganggap frontend authorization sudah cukup.

Jika GitHub Pages gagal pada nested route, perbaiki konfigurasi deployment/routing.

---

# 73. OUTPUT YANG DIHARAPKAN

Pada akhir pembangunan, berikan:

1. source code lengkap
2. folder structure
3. Supabase migrations
4. RLS policies
5. Edge Functions jika diperlukan
6. seed data
7. `.env.example`
8. GitHub Actions workflow
9. README lengkap
10. setup instructions
11. deployment instructions
12. security notes
13. testing checklist
14. daftar environment variables
15. daftar fitur yang sudah benar-benar berfungsi
16. daftar konfigurasi yang masih membutuhkan input dari Admin

Jangan memberikan source code yang hanya berupa contoh.

Buat aplikasi yang benar-benar runnable.

**Target akhir:**

```text
GitHub Repository
       │
       ▼
GitHub Pages
       │
       │ Static Frontend
       ▼
React + Vite
       │
       ├──────────────► Supabase Auth
       │
       ├──────────────► Supabase Database
       │
       ├──────────────► Supabase Storage
       │
       └──────────────► Supabase Edge Functions
                              │
                              └──► AI Grading / Secure Operations
```

Aplikasi harus dapat digunakan sebagai **CBT sekolah sungguhan**, bukan sekadar website demonstrasi.

Mulai dari **Phase 1**, dan setelah setiap fase pastikan project tetap dapat di-build dan dijalankan sebelum melanjutkan ke fase berikutnya.