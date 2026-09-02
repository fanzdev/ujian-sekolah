# Deployment — GitHub Pages

Aplikasi di-deploy sebagai **static site** pada path `/ujian/` dari repository `USERNAME.github.io/ujian` (atau repo apa pun bernama `ujian`).

## 1. Repository

```bash
git init
git add -A
git commit -m "feat: SMK AL-FATA CBT"
git branch -M main
git remote add origin https://github.com/USERNAME/ujian.git
git push -u origin main
```

> Pastikan `.env` tidak ikut ter-commit (sudah ada di `.gitignore`). Commit `package-lock.json`.

## 2. Secrets / Variables Repository

Settings → Secrets and variables → Actions:

| Tab | Name | Value |
|---|---|---|
| Variables | `VITE_SUPABASE_URL` | `https://xxx.supabase.co` |
| Secrets | `VITE_SUPABASE_ANON_KEY` | anon public key |

## 3. Pages Settings

Settings → Pages → **Build and deployment → Source: GitHub Actions**.

## 4. GitHub Actions

Workflow `.github/workflows/deploy.yml` otomatis:

1. checkout → 2. npm ci → 3. typecheck → 4. build (`base=/ujian/`, generate `dist/404.html` + `.nojekyll`) → 5. upload artifact → 6. deploy-pages.

Jalankan juga manual lewat tab **Actions → Deploy to GitHub Pages → Run workflow**.

## 5. Verifikasi Pasca-Deploy

Test URL berikut (semua harus 200, tanpa blank page):

```text
https://USERNAME.github.io/ujian/                    # landing → redirect role/login
https://USERNAME.github.io/ujian/login               # refresh OK (404 fallback)
https://USERNAME.github.io/ujian/admin/students      # direct URL setelah login admin
https://USERNAME.github.io/ujian/favicon.svg         # asset OK
```

Checklist lengkap: lihat `docs/TESTING.md` bagian GitHub Pages Test.

## Catatan Teknis

- `404.html` berisi salinan `index.html` + script yang menyimpan path asli ke `sessionStorage` lalu me-redirect ke `/ujian/`; saat app boot, `history.replaceState` memulihkan URL sebelum router inisialisasi. Inilah yang membuat refresh nested route bekerja tanpa server.
- `.nojekyll` mencegah Jekyll memproses/membuang folder `_file`.
- Asset di-hash Vite dengan absolute path `/ujian/assets/...` — aman terhadap cache stale antar-deploy.
