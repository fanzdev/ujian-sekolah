-- Hybrid theme: preset terkurasi + kustom (Opsi C)
alter table public.school_settings
  add column if not exists theme_preset text;

update public.school_settings
  set theme_preset = 'bengkel-presisi'
  where theme_preset is null;

comment on column public.school_settings.theme_preset is 'Preset tema: bengkel-presisi | veyra-midnight | kertas-blueprint | graphite-slate | custom | null (fallback ke bengkel-presisi)';
