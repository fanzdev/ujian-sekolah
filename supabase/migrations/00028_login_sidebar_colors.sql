-- 00028: Tambah warna kustom untuk login (card kiri) & sidebar
alter table public.school_settings
  add column if not exists login_color text not null default '#0B1E24',
  add column if not exists sidebar_color text not null default '#0B1E24';

comment on column public.school_settings.login_color is 'Warna latar panel kiri halaman login (card branding) — default #0B1E24';
comment on column public.school_settings.sidebar_color is 'Warna latar sidebar navigasi dashboard — default #0B1E24';

update public.school_settings
  set login_color = '#0B1E24'
  where login_color is null or login_color = '';

update public.school_settings
  set sidebar_color = '#0B1E24'
  where sidebar_color is null or sidebar_color = '';
