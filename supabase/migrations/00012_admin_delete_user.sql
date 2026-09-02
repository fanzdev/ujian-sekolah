-- ============================================================
-- SMK AL-FATA CBT — Migration 00012: Admin delete user fallback
-- Fallback tanpa Edge Function: admin dapat menghapus akun
-- langsung via RPC security definer. Edge tetap utama jika tersedia.
-- ============================================================

create or replace function public.admin_delete_user(
  p_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, auth
as $$
declare
  v_is_admin boolean;
  v_exists   boolean;
begin
  select private.is_admin() into v_is_admin;
  if not coalesce(v_is_admin, false) then
    raise exception 'Hanya admin yang diizinkan menghapus akun.';
  end if;

  if p_user_id is null then
    raise exception 'user_id wajib diisi.';
  end if;

  -- prevent self-deletion
  if p_user_id = auth.uid() then
    raise exception 'Tidak dapat menghapus akun sendiri.';
  end if;

  select exists(select 1 from auth.users where id = p_user_id) into v_exists;
  if not v_exists then
    -- auth user sudah tidak ada, bersihkan profile & student jika masih ada
    delete from public.students where profile_id = p_user_id;
    delete from public.profiles where id = p_user_id;
    return jsonb_build_object('ok', true, 'message', 'Auth user tidak ditemukan, profile & student sudah dibersihkan.');
  end if;

  -- delete auth.users (will cascade to profiles via FK, and profiles cascade to students)
  delete from auth.users where id = p_user_id;

  perform public.log_audit('DELETE_USER', 'profile', p_user_id::text,
    jsonb_build_object('via', 'rpc_fallback'));

  return jsonb_build_object('ok', true, 'user_id', p_user_id);
end
$$;

revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;

comment on function public.admin_delete_user is 'Fallback RPC untuk menghapus akun tanpa Edge Function manage-user';
