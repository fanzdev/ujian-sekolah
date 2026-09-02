-- ============================================================
-- SMK AL-FATA CBT — Buat Admin Pertama
-- ============================================================
-- CARA PAKAI:
--   1. Buka Supabase Dashboard > SQL Editor.
--   2. Ganti nilai di blok CONFIG di bawah.
--   3. Jalankan script SEKALI saja.
--
-- Keamanan:
--   - Password di-hash bcrypt (kompatibel dengan Supabase Auth/GoTrue).
--   - Script menolak berjalan jika sudah ada admin lain (bootstrap lock).
--   - Hapus / biarkan script ini setelah dijalankan; ia menjadi inert.
-- ============================================================

do $$
declare
  -- ================= CONFIG =================
  v_username constant text := 'admin';
  v_password constant text := 'GantiPasswordAm@n2026';
  v_full_name constant text := 'Administrator';
  -- ==========================================
  v_uid  uuid;
  v_mail text;
begin
  if exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'Admin sudah ada. Script bootstrap dikunci demi keamanan.';
  end if;

  if length(v_password) < 8 then
    raise exception 'Password minimal 8 karakter.';
  end if;

  v_uid  := gen_random_uuid();
  v_mail := v_username || '@cbt.local';

  insert into auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    recovery_sent_at, last_sign_in_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_uid, 'authenticated', 'authenticated', v_mail,
    extensions.crypt(v_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('username', v_username, 'full_name', v_full_name, 'role', 'admin'),
    now(), now(),
    '', '', '', '',
    null, null
  );

  -- identities bersifat pelengkap — best-effort, jangan gagalkan setup
  begin
    insert into auth.identities
      (user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      v_uid,
      v_uid::text,
      jsonb_build_object('sub', v_uid::text, 'email', v_mail, 'email_verified', true),
      'email',
      now(), now(), now()
    );
  exception when others then
    raise notice 'identities insert dilewati: %', sqlerrm;
  end;

  insert into public.profiles (id, username, full_name, role)
  values (v_uid, v_username, v_full_name, 'admin')
  on conflict (id) do update set role = 'admin';

  raise notice 'Admin "%" berhasil dibuat. Login dengan username & password tersebut.', v_username;
end $$;
