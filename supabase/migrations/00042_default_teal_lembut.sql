-- ============================================================
-- SMK AL-FATA CBT — Migration 00042: Default teal bergradasi lembut
-- Warna bawaan aplikasi hanya teal: primary #0D868F dengan
-- secondary #2DD4BF (tanpa kuning/oranye).
-- AMAN: baris school_settings hanya diubah bila masih berisi
-- nilai default lama dengan preset bawaan — kustom admin
-- (preset kustom / warna lain) tidak disentuh.
-- Idempotent, aman dijalankan ulang di SQL Editor Supabase.
-- ============================================================

alter table public.school_settings
  alter column primary_color set default '#0D868F';

alter table public.school_settings
  alter column secondary_color set default '#2DD4BF';

update public.school_settings
set
  primary_color = '#0D868F',
  secondary_color = '#2DD4BF',
  updated_at = now()
where id = true
  and primary_color in ('#0D868F', '#15803D')
  and secondary_color in ('#0CBCC9', '#22C55E', '#C67C3B', '#2DD4BF')
  and secondary_color <> '#2DD4BF'
  and (theme_preset is null or theme_preset = 'bengkel-presisi');

insert into public.school_settings (id, app_name, school_name, logo_url, favicon_url, primary_color, secondary_color)
values (true, 'SMK AL-FATA CBT', 'SMK AL-FATA', '/logo.webp', '/logo.webp', '#0D868F', '#2DD4BF')
on conflict (id) do nothing;
