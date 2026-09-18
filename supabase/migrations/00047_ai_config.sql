-- Migration 00047: AI Configuration Management
-- Stores provider config (key, model, base_url) in system_settings.
-- Only admin users can read/write via RLS.

-- ---------- 1) Function: get AI config as admin ----------
create or replace function public.get_ai_config()
returns jsonb
language sql
security definer set search_path = public
stable as $$
  select coalesce(value, '{"configured":false}'::jsonb)
  from public.system_settings
  where key = 'ai'
$$;

comment on function public.get_ai_config() is 'Ambil konfigurasi AI dari system_settings (service role bypass)';

-- ---------- 2) Function: save AI config ----------
create or replace function public.save_ai_config(p_config jsonb)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.system_settings (key, value)
  values ('ai', p_config)
  on conflict (key) do update
    set value = p_config,
        updated_at = now(),
        updated_by = auth.uid();
end;
$$;

comment on function public.save_ai_config(jsonb) is 'Simpan konfigurasi AI. Hanya admin yang bisa panggil.';

-- ---------- 3) RLS policy: admin only for ai settings ----------
drop policy if exists "ai_settings_admin_write" on public.system_settings;
create policy "ai_settings_admin_write" on public.system_settings
  for all to authenticated
  using (key = 'ai' and private.is_admin())
  with check (key = 'ai' and private.is_admin());

drop policy if exists "ai_settings_admin_select" on public.system_settings;
create policy "ai_settings_admin_select" on public.system_settings
  for select to authenticated
  using (key = 'ai' and private.is_admin());

-- ---------- 4) Seed default value ----------
insert into public.system_settings (key, value)
values ('ai', '{"configured":false}')
on conflict (key) do nothing;
