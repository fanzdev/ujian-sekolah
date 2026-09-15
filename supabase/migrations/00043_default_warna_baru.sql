-- ============================================================
-- SMK AL-FATA CBT — Migration 00043: Default warna baru
-- Sidebar #0D868F, splash screen #064247, background #EDEDED.
-- Warna login tidak diubah.
-- AMAN: tiap kolom hanya diubah bila masih bernilai default lama
-- — kustom admin tidak disentuh.
-- Idempotent, aman dijalankan ulang di SQL Editor Supabase.
-- ============================================================

alter table public.school_settings
  alter column sidebar_color set default '#0D868F';

alter table public.school_settings
  alter column splash_bg_color set default '#064247';

alter table public.school_settings
  alter column app_bg_color set default '#EDEDED';

update public.school_settings
set sidebar_color = '#0D868F', updated_at = now()
where id = true and sidebar_color = '#0B1E24';

update public.school_settings
set splash_bg_color = '#064247', updated_at = now()
where id = true and splash_bg_color = '#0B1E24';

update public.school_settings
set app_bg_color = '#EDEDED', updated_at = now()
where id = true and app_bg_color = '#FDF9F3';

insert into public.school_settings (id, app_name, school_name, logo_url, favicon_url, primary_color, secondary_color, sidebar_color, splash_bg_color, app_bg_color)
values (true, 'SMK AL-FATA CBT', 'SMK AL-FATA', '/logo.webp', '/logo.webp', '#0D868F', '#2DD4BF', '#0D868F', '#064247', '#EDEDED')
on conflict (id) do nothing;
