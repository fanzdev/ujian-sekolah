-- ============================================================
-- SMK AL-FATA CBT — Migration 00041: Default teal + copper
-- Warna bawaan aplikasi menjadi teal #0D868F + copper #C67C3B
-- (preset "Bengkel Presisi").
-- AMAN: baris school_settings hanya diubah bila masih berisi
-- nilai default lama (teal/cyan/hijau) dengan preset bawaan —
-- kustom admin (preset kustom / warna lain) tidak disentuh.
-- Idempotent, aman dijalankan ulang di SQL Editor Supabase.
-- ============================================================

alter table public.school_settings
  alter column primary_color set default '#0D868F';

alter table public.school_settings
  alter column secondary_color set default '#C67C3B';

update public.school_settings
set
  primary_color = '#0D868F',
  secondary_color = '#C67C3B',
  updated_at = now()
where id = true
  and primary_color in ('#0D868F', '#15803D')
  and secondary_color in ('#0CBCC9', '#22C55E', '#C67C3B')
  and (theme_preset is null or theme_preset = 'bengkel-presisi');

insert into public.school_settings (id, app_name, school_name, logo_url, favicon_url, primary_color, secondary_color)
values (true, 'SMK AL-FATA CBT', 'SMK AL-FATA', '/logo.webp', '/logo.webp', '#0D868F', '#C67C3B')
on conflict (id) do nothing;
