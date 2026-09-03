-- ============================================================
-- SMK AL-FATA CBT — Migration 00016: Branding defaults update
-- Ganti warna default #2563eb -> #0D868F (teal)
-- Set logo default ke vcbt-01.png & vcbt-02.png
-- Hapus jejak logo lama (logo.svg / favicon.svg) tidak ada di DB,
-- hanya update baris school_settings jika masih default lama.
-- ============================================================

-- Update default value kolom primary_color & secondary_color (gradasi #0D868F → #0CBCC9)
alter table public.school_settings
  alter column primary_color set default '#0D868F';

alter table public.school_settings
  alter column secondary_color set default '#0CBCC9';

-- Update baris yang sudah ada jika masih pakai default lama
update public.school_settings
set
  primary_color = '#0D868F',
  secondary_color = '#0CBCC9',
  logo_url = coalesce(
    nullif(logo_url, ''),
    case when logo_url like '%logo.svg' or logo_url like '%favicon.svg' then null else logo_url end,
    '/vcbt-01.png'
  ),
  favicon_url = coalesce(
    nullif(favicon_url, ''),
    case when favicon_url like '%logo.svg' or favicon_url like '%favicon.svg' then null else favicon_url end,
    '/vcbt-02.png'
  ),
  updated_at = now()
where id = true
  and (
    primary_color in ('#2563eb', '#3b82f6', '#0D868F')
    or secondary_color in ('#0ea5e9', '#0D868F', '#2563eb')
    or logo_url like '%logo.svg' or logo_url like '%favicon.svg' or logo_url is null
    or favicon_url like '%logo.svg' or favicon_url like '%favicon.svg' or favicon_url is null
  );

-- Jika baris belum ada (fresh install), sisipkan default baru
insert into public.school_settings (id, app_name, school_name, logo_url, favicon_url, primary_color, secondary_color)
values (true, 'SMK AL-FATA CBT', 'SMK AL-FATA', '/vcbt-01.png', '/vcbt-02.png', '#0D868F', '#0CBCC9')
on conflict (id) do nothing;
