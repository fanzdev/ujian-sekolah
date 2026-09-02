-- 00009: Branding palette gradasi — dukung >2 warna
alter table public.school_settings
  add column if not exists extra_colors jsonb not null default '[]'::jsonb;

comment on column public.school_settings.extra_colors is 'Warna tambahan untuk tema gradasi (array hex, dipakai bila >1 warna)';

update public.school_settings set extra_colors = '[]'::jsonb where extra_colors is null;
