# Troubleshooting: Edge Function CORS Error

## Error yang Muncul

> Browser gagal menghubungi Edge Function "ai-proxy". Biasanya karena CORS, ekstensi/adblock, atau jaringan.

## Penyebab Utama

### 1. Edge Function belum di-deploy
Edge Function harus di-deploy ke Supabase sebelum bisa dipanggil dari browser.

**Solusi:**
```bash
npx supabase functions deploy ai-proxy --project-ref eotupdnihxmypwpfblgc
npx supabase functions deploy manage-user --project-ref eotupdnihxmypwpfblgc
```

### 2. Environment Variable belum diatur di Dashboard
Edge Function membutuhkan variable berikut di **Supabase Dashboard → Database → Edge Functions → ai-proxy → Environment Variables**:

| Variabel | Nilai | Sumber |
|----------|-------|--------|
| `SUPABASE_URL` | `https://eotupdnihxmypwpfblgc.supabase.co` | Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | (master key) | Project Settings → API → service_role |
| `SUPABASE_ANON_KEY` | (anon key) | Project Settings → API → anon/public |
| `ALLOWED_ORIGINS` | *(opsional)* | Kosongkan jika kosong, atau isi domain produksi |

**Langkah pengaturan:**
1. Buka [Supabase Dashboard](https://supabase.com/dashboard/project/eotupdnihxmypwpfblgc)
2. Klik **Edge Functions** di sidebar kiri
3. Pilih **ai-proxy** → tab **Environment Variables**
4. Tambahkan 3 variabel wajib di atas
5. Ulangi untuk **manage-user**

### 3. CORS Origin tidak cocok
Jika aplikasi berjalan di domain produksi (bukan localhost), origin dari browser akan diblokir oleh CORS policy Edge Function.

**Solusi otomatis (sudah diperbaiki):**
- Edge Function sekarang otomatis menambahkan `SUPABASE_URL` ke daftar origin yang diizinkan
- Namun, jika aplikasi di-host di domain custom (misal `https://cbt.sekolah.id`), tambahkan ke `ALLOWED_ORIGINS`:
  ```
  https://cbt.sekolah.id,https://yourdomain.com
  ```

### 4. Ekstensi Browser / AdBlock
Ekstensi seperti AdBlock, Privacy Badger, atau uBlock Origin bisa memblokir request ke Edge Function.

**Cek:**
- Buka halaman yang sama di **Incognito Mode**
- Nonaktifkan semua ekstensi sementara
- Coba refresh dan simpan konfigurasi lagi

### 5. Koneksi Internet / Firewall
Beberapa jaringan (sekolah, kantor) memblokir request ke domain supabase.co.

**Cek:**
- Buka tab baru → akses `https://eotupdnihxmypwpfblgc.supabase.co`
- Jika tidak bisa diakses, berarti firewall memblokir

## Langkah Debugging (F12)

1. Buka DevTools (F12) → tab **Network**
2. Klik **Clear** (ikon sampah)
3. Coba simpan konfigurasi AI
4. Cari request ke `ai-proxy` yang berwarna merah
5. Klik request → lihat **Response** dan **Headers**

### Kemungkinan Response Error:

| Status | Pesan | Solusi |
|--------|-------|--------|
| `401` | Sesi tidak valid | Logout → login ulang |
| `403` | Hanya admin | Pastikan akun ber-role admin |
| `500` | Layanan belum terkonfigurasi | Cek env vars di dashboard |
| `404` | Function not found | Deploy ulang edge function |
| (no response) | CORS/network error | Cek poin 1-5 di atas |

## Checklist Deploy

```bash
# 1. Pastikan Supabase CLI terinstall
npm list -g supabase || npm install -g supabase

# 2. Login ke Supabase
npx supabase login

# 3. Deploy semua edge functions
npx supabase functions deploy ai-proxy --project-ref eotupdnihxmypwpfblgc
npx supabase functions deploy manage-user --project-ref eotupdnihxmypwpfblgc

# 4. Verifikasi deploy berhasil
npx supabase functions list --project-ref eotupdnihxmypwpfblgc
```

Setelah deploy, refresh halaman aplikasi dan coba simpan konfigurasi AI lagi.

## Jika Masih Error Setelah Semua Diatas

1. Buka [Supabase Logs](https://supabase.com/dashboard/project/eotupdnihxmypwpfblgc/functions/ai-proxy/logs)
2. Cari log error terbaru saat mencoba menyimpan konfigurasi
3. Screenshot log dan kirim ke developer untuk ditindaklanjuti
