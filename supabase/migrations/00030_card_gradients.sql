-- 00030: Gradasi per-card branding — setiap warna bisa di-gradasi-kan
alter table public.school_settings
  add column if not exists card_gradients jsonb not null default '{}'::jsonb;

comment on column public.school_settings.card_gradients is 'Gradasi per permukaan: { primary: string[], secondary: string[], login: string[], sidebar: string[], app_bg: string[], splash: string[] } — tiap array hex untuk gradient linear 135deg';

update public.school_settings
  set card_gradients = '{}'::jsonb
  where card_gradients is null;
