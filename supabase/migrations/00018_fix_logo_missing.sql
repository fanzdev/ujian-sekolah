-- ============================================================
-- SMK AL-FATA CBT — Migration 00018: Perbaiki logo hilang
-- Penyebab: 00016 set logo_url='/vcbt-01.png' & favicon='/vcbt-02.png'
-- tetapi file tidak ada di public/ (hanya logo.webp) → 404 broken image
-- + fallback BASE_URL tidak konsisten (/ vs /logo.webp vs /ujian/logo.webp)
-- Fix: kembalikan ke /logo.webp yang memang ada, bersihkan cache lama
-- ============================================================

-- Pastikan default kolom tetap teal tapi logo kembali ke yang ada
alter table public.school_settings
  alter column primary_color set default '#0D868F';
alter table public.school_settings
  alter column secondary_color set default '#0CBCC9';

-- Perbaiki baris yang sudah terlanjur jadi /vcbt-01.png / /vcbt-02.png / /vcbt* / kosong
update public.school_settings
set
  logo_url = '/logo.webp',
  favicon_url = '/logo.webp',
  updated_at = now()
where id = true
  and (
    logo_url in ('/vcbt-01.png','/vcbt-02.png','/vcbt-01.png ','/logo.svg','/favicon.svg')
    or favicon_url in ('/vcbt-01.png','/vcbt-02.png','/vcbt-01.png ','/logo.svg','/favicon.svg')
    or logo_url like '%vcbt%' or favicon_url like '%vcbt%'
    or logo_url like '%logo.svg%' or favicon_url like '%favicon.svg%'
    or logo_url is null or favicon_url is null
    or logo_url = '' or favicon_url = ''
  );

-- Fallback generik: jika masih ada yang tidak diawali http/https/data: dan bukan /logo.webp, normalisasi ke /logo.webp
-- (misal: vcbt-01.png tanpa slash, ujian/logo.webp salah path)
update public.school_settings
set
  logo_url = case
    when logo_url ~ '^https?://' then logo_url
    when logo_url ~ '^data:' then logo_url
    when logo_url = '/logo.webp' then logo_url
    else '/logo.webp'
  end,
  favicon_url = case
    when favicon_url ~ '^https?://' then favicon_url
    when favicon_url ~ '^data:' then favicon_url
    when favicon_url = '/logo.webp' then favicon_url
    else '/logo.webp'
  end,
  updated_at = now()
where id = true
  and (logo_url <> '/logo.webp' or favicon_url <> '/logo.webp')
  and (logo_url not like 'http%' and logo_url not like 'data:%' or logo_url like '%vcbt%')
;

-- Jika baris belum ada (fresh install yang belum sempat dibuat 00016), buat dengan logo benar
insert into public.school_settings (id, app_name, school_name, logo_url, favicon_url, primary_color, secondary_color)
values (true, 'SMK AL-FATA CBT', 'SMK AL-FATA', '/logo.webp', '/logo.webp', '#0D868F', '#0CBCC9')
on conflict (id) do nothing;
