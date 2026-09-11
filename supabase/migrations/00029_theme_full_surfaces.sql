-- 00029: Tema penuh — background aplikasi & splash
alter table public.school_settings
  add column if not exists app_bg_color text not null default '#FDF9F3',
  add column if not exists splash_bg_color text not null default '#0B1E24';

comment on column public.school_settings.app_bg_color is 'Warna latar belakang aplikasi (body, dashboard, login kanan) — default #FDF9F3';
comment on column public.school_settings.splash_bg_color is 'Warna latar splash screen / loading awal — default #0B1E24';

update public.school_settings
  set app_bg_color = '#FDF9F3'
  where app_bg_color is null or app_bg_color = '';

update public.school_settings
  set splash_bg_color = '#0B1E24'
  where splash_bg_color is null or splash_bg_color = '';
