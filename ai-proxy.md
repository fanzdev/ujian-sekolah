Saya memiliki aplikasi web berbasis React/TypeScript yang menggunakan Supabase dan Supabase Edge Function bernama "ai-proxy".

Saat fitur AI dijalankan dari browser localhost, muncul error:

"Browser gagal menghubungi Edge Function 'ai-proxy'. Biasanya karena diblokir ekstensi/adblock/antivirus atau jaringan."

Saya sudah melakukan debugging melalui Chrome DevTools → Network.

Hasil debugging:
- Request OPTIONS/preflight ke ai-proxy mendapatkan HTTP 200.
- Tetapi request utama ke ai-proxy gagal dengan "CORS error".
- Request URL mengarah ke Supabase Edge Function:
  /functions/v1/ai-proxy
- Frontend berjalan di:
  http://localhost:3000
- Supabase Edge Function dapat diakses/deployed.
- Supabase secara umum berjalan normal.
- Masalah terjadi ketika browser melakukan request sebenarnya ke ai-proxy.

TUGAS UTAMA:
Perbaiki masalah ini sampai fitur AI dapat digunakan normal dari browser.

JANGAN langsung mengubah kode secara membabi buta. Audit dan pahami implementasi yang sudah ada terlebih dahulu.

LANGKAH YANG WAJIB DILAKUKAN:

1. AUDIT FRONTEND
Cari seluruh penggunaan:
- supabase.functions.invoke("ai-proxy")
- fetch() yang menuju ai-proxy
- konfigurasi Supabase client
- cara Authorization/JWT dikirim
- request body yang dikirim ke ai-proxy

Pastikan frontend menggunakan Supabase client secara benar.

2. AUDIT EDGE FUNCTION
Cari source code Edge Function:
- ai-proxy
- index.ts
- deno.json / deno.jsonc
- dependency/import yang digunakan

Periksa seluruh response dari Edge Function.

Pastikan CORS header diterapkan pada:
- OPTIONS/preflight
- response sukses 200
- response 400
- response 401
- response 403
- response 500
- seluruh response error lainnya

Jangan hanya menambahkan CORS header pada OPTIONS.

Gunakan struktur CORS yang benar, misalnya:

const corsHeaders = {
  "Access-Control-Allow-Origin": "http://localhost:3000",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Namun jangan hardcode "*" jika arsitektur aplikasi membutuhkan origin tertentu.

Jika aplikasi memiliki production domain, buat mekanisme origin yang aman sehingga:
- localhost development dapat digunakan
- production domain dapat digunakan
- origin asing tidak otomatis diizinkan

3. PERIKSA URUTAN CORS DAN AUTH
Pastikan OPTIONS/preflight ditangani SEBELUM validasi authentication yang membutuhkan JWT.

Contoh pola:

if (req.method === "OPTIONS") {
  return new Response("ok", {
    status: 200,
    headers: corsHeaders,
  });
}

Setelah itu baru lakukan authentication dan logic utama.

Tetapi JANGAN mematikan authentication/JWT hanya untuk menghilangkan error CORS.

Keamanan tetap harus dipertahankan.

4. PASTIKAN SEMUA RESPONSE MEMILIKI CORS HEADER

Gunakan helper function jika diperlukan, misalnya:

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Kemudian gunakan helper tersebut untuk seluruh response.

Tujuannya agar ketika Edge Function mengalami error, browser tetap menerima response yang valid dan tidak mengubah error backend menjadi "CORS error" yang membingungkan.

5. AUDIT AI PROVIDER
Setelah masalah CORS diperbaiki, pastikan ai-proxy masih dapat:
- menerima request dari frontend
- membaca body request
- membaca JWT/user authentication
- mengambil API key AI dari Supabase Secrets/environment
- menghubungi AI provider
- mengembalikan hasil AI ke frontend

JANGAN pernah memindahkan secret API key AI ke frontend.

API key AI harus tetap berada di Edge Function/Supabase Secrets.

6. PERIKSA SECRET DAN ENVIRONMENT
Periksa apakah Edge Function menggunakan environment variable yang benar.

Contoh:
Deno.env.get("OPENAI_API_KEY")
atau provider AI yang memang digunakan project.

Jangan mencetak secret/API key ke console, response, atau frontend.

Jika secret tidak ditemukan, tampilkan error yang aman dan jelas di server log.

7. AUDIT ERROR HANDLING
Pastikan error seperti:
- authentication gagal
- body request invalid
- AI provider gagal
- API key tidak tersedia
- rate limit
- timeout
- server error

menghasilkan JSON response yang valid dan tetap memiliki CORS headers.

Contoh:

{
  "error": "Pesan error yang aman"
}

Jangan mengirim secret, API key, JWT, atau informasi internal sensitif ke client.

8. AUDIT FRONTEND ERROR HANDLING
Pastikan frontend tidak hanya menampilkan:

"Failed to fetch"

Tetapi jika Edge Function mengembalikan JSON error, frontend membaca dan menampilkan pesan error yang sebenarnya.

Namun jangan mengubah UI secara besar-besaran jika tidak diperlukan.

Fokus utama adalah memperbaiki koneksi ai-proxy.

9. TEST SECARA NYATA
Setelah melakukan perubahan:

- jalankan aplikasi
- pastikan localhost:3000 aktif
- buka DevTools → Network
- jalankan fitur "Buat Soal dengan AI"
- cari request ai-proxy

Pastikan hasil akhirnya:

OPTIONS /ai-proxy → 200
POST /ai-proxy → 200

atau jika terjadi error bisnis:

POST /ai-proxy → 4xx/5xx dengan CORS header yang benar

Yang TIDAK BOLEH terjadi lagi:

POST /ai-proxy → CORS error

10. VERIFIKASI RESPONSE HEADERS
Pastikan response POST ai-proxy memiliki:

Access-Control-Allow-Origin

dan header CORS lain yang memang diperlukan.

Jangan hanya memeriksa OPTIONS.

11. JANGAN MERUSAK FITUR LAIN
Sebelum mengubah kode:
- pahami struktur project
- pahami authentication
- pahami Supabase client
- pahami Edge Function
- pahami flow AI yang sudah ada

Pertahankan behavior yang sudah bekerja.

Jangan menghapus fitur.
Jangan mengganti provider AI tanpa alasan.
Jangan mengubah database schema kecuali benar-benar diperlukan.
Jangan menonaktifkan RLS.
Jangan mematikan JWT hanya untuk menyelesaikan masalah.
Jangan memasukkan API key ke frontend.

12. JIKA MASALAH BUKAN HANYA CORS
Jika setelah audit ternyata CORS bukan satu-satunya masalah, lanjutkan debugging sampai ditemukan root cause sebenarnya.

Periksa:
- URL Supabase
- function name
- JWT
- Authorization header
- Supabase anon/publishable key
- Edge Function deployment
- secrets
- request body
- response body
- AI provider
- network error
- browser error

Jangan berhenti hanya karena kode berhasil di-build.

13. SETELAH SELESAI
Berikan laporan singkat:

ROOT CAUSE:
[jelaskan penyebab sebenarnya]

FILES CHANGED:
[list file yang diubah]

FIX:
[jelaskan perubahan]

TEST:
[jelaskan pengujian yang dilakukan]

RESULT:
[berhasil/gagal]

Jika masih gagal, jangan mengatakan "selesai".
Tunjukkan error terakhir yang ditemukan dan lanjutkan debugging.

DEFINITION OF DONE:

Fitur "Buat Soal dengan AI" harus dapat dipanggil dari:
http://localhost:3000

Tanpa:
- CORS error
- Failed to fetch akibat CORS
- error preflight
- API key AI terekspos
- JWT authentication dinonaktifkan

Dan request utama ai-proxy harus mendapatkan response yang dapat dibaca oleh frontend.