-- ============================================================
-- SMK AL-FATA CBT — Migration 00040: Default hijau
-- Warna bawaan aplikasi menjadi hijau (primary #15803D,
-- secondary #22C55E) menggantikan teal/cyan/copper.
-- AMAN: baris school_settings hanya diubah bila masih persis
-- nilai default lama (belum dikustom admin).
-- Idempotent, aman dijalankan ulang di SQL Editor Supabase.
-- ============================================================

alter table public.school_settings
  alter column primary_color set default '#15803D';

alter table public.school_settings
  alter column secondary_color set default '#22C55E';

update public.school_settings
set
  primary_color = '#15803D',
  secondary_color = '#22C55E',
  updated_at = now()
where id = true
  and primary_color = '#0D868F'
  and secondary_color = '#0CBCC9';

insert into public.school_settings (id, app_name, school_name, logo_url, favicon_url, primary_color, secondary_color)
values (true, 'SMK AL-FATA CBT', 'SMK AL-FATA', '/logo.webp', '/logo.webp', '#15803D', '#22C55E')
on conflict (id) do nothing;
