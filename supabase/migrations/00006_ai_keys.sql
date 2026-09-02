-- ============================================================
-- SMK AL-FATA CBT — Migration 00006: AI Provider Keys (OpenRouter)
-- Pool banyak API KEY dengan rotasi otomatis saat rate-limit.
-- Hanya ADMIN yang dapat melihat/mengelola tabel ini (RLS total).
-- ============================================================

create table if not exists public.ai_provider_keys (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null default 'openrouter',
  label        text not null default '',
  api_key      text not null,
  model        text,
  priority     int not null default 100,
  is_active    boolean not null default true,
  last_error   text,
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_ai_keys_order on public.ai_provider_keys (provider, is_active, priority, created_at);

drop trigger if exists trg_ai_keys_updated on public.ai_provider_keys;
create trigger trg_ai_keys_updated before update on public.ai_provider_keys
  for each row execute procedure public.set_updated_at();

alter table public.ai_provider_keys enable row level security;

drop policy if exists "ai_keys_admin_only" on public.ai_provider_keys;
create policy "ai_keys_admin_only" on public.ai_provider_keys for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- Konfigurasi global AI (provider & model default)
-- Batalkan RLS sementara agar seed bisa dijalankan dari migration
alter table public.system_settings disable row level security;

insert into public.system_settings (key, value) values
  ('ai', '{ "provider": "openrouter", "model": "meta-llama/llama-3.3-70b-instruct", "temperature": 0.2 }')
on conflict (key) do nothing;

alter table public.system_settings enable row level security;
