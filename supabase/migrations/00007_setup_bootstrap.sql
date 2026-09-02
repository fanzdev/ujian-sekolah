-- ============================================================
-- SMK AL-FATA CBT — Migration 00007: First-run Setup Bootstrap
-- Jika belum ada admin → wizard setup tersedia (sekali pakai).
-- Setelah selesai → terkunci permanen (berbasis flag, bukan jumlah admin),
-- sehingga menghapus admin tidak akan membuka kembali celah setup.
-- ============================================================

-- Flag status setup; otomatis "done" bila ternyata admin sudah ada
-- (aman untuk database yang sudah berjalan).
insert into public.system_settings (key, value)
values (
  'setup_completed',
  jsonb_build_object(
    'done',
    exists (select 1 from public.profiles where role = 'admin')
  )
)
on conflict (key) do nothing;

-- Dipanggil anon/login page: apakah wizard setup perlu ditampilkan?
create or replace function public.check_setup_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'needs_setup',
    not coalesce(
      (select (value ->> 'done')::boolean
       from public.system_settings where key = 'setup_completed'),
      false
    )
  )
$$;

-- Menjalankan setup pertama: buat akun admin + simpan profil sekolah.
-- HANYA berhasil selama setup belum selesai (guard paling atas).
create or replace function public.bootstrap_setup(
  p_username      text,
  p_password      text,
  p_full_name     text,
  p_app_name      text    default null,
  p_school_name   text    default null,
  p_logo_url      text    default null,
  p_city          text    default null,
  p_address       text    default null,
  p_headmaster    text    default null,
  p_academic_year text    default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_uid   uuid;
  v_mail  text;
  v_done  boolean;
  v_ident jsonb;
  v_sub   text;
begin
  -- ---------- GUARD: sekali pakai ----------
  select coalesce((value ->> 'done')::boolean, false)
    into v_done
  from public.system_settings
  where key = 'setup_completed';

  if coalesce(v_done, false) then
    raise exception 'Setup telah selesai sebelumnya. Silakan login dengan akun Anda.';
  end if;

  -- ---------- Validasi ----------
  p_username := lower(trim(coalesce(p_username, '')));
  if p_username !~ '^[a-z0-9._-]{3,30}$' then
    raise exception 'Username harus 3-30 karakter: huruf kecil, angka, titik, garis bawah atau strip.';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'Password minimal 8 karakter.';
  end if;
  if length(coalesce(trim(coalesce(p_full_name, '')))) < 2 then
    raise exception 'Nama lengkap admin wajib diisi.';
  end if;
  if exists (select 1 from public.profiles where username = p_username) then
    raise exception 'Username "%" sudah digunakan.', p_username;
  end if;

  -- ---------- Buat user Supabase Auth ----------
  v_uid  := gen_random_uuid();
  v_mail := p_username || '@cbt.local';

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
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('username', p_username, 'full_name', trim(p_full_name), 'role', 'admin'),
    now(), now(),
    '', '', '', '',
    null, null
  );

  -- ---------- Buat baris identities (best-effort, adaptif skema apa pun) ----------
  -- Baris ini bersifat pelengkap; login email+password tetap berfungsi tanpa itu,
  -- sehingga kegagalan di sini TIDAK boleh menggagalkan setup.
  v_sub   := v_uid::text;
  v_ident := jsonb_build_object('sub', v_sub, 'email', v_mail, 'email_verified', true);

  begin
    declare
      v_has_id     boolean;
      v_id_is_uuid boolean;
    begin
      select count(*) filter (where column_name = 'id') > 0,
             count(*) filter (where column_name = 'id' and udt_name = 'uuid') > 0
        into v_has_id, v_id_is_uuid
      from information_schema.columns
      where table_schema = 'auth'
        and table_name   = 'identities'
        and column_name in ('id','user_id','provider_id','identity_data',
                            'provider','last_sign_in_at','created_at','updated_at');

      if v_has_id then
        execute format(
          'insert into auth.identities
             (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
           values (%s, $1, $2, $3, ''email'', now(), now(), now())',
          case when v_id_is_uuid then 'gen_random_uuid()' else 'gen_random_uuid()::text' end
        ) using v_uid, v_sub, v_ident;
      else
        execute format(
          'insert into auth.identities
             (user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
           values ($1, $2, $3, ''email'', now(), now(), now())'
        ) using v_uid, v_sub, v_ident;
      end if;
    end;
  exception when others then
    -- Skema auth berbeda dari perkiraan → lewati; login tetap normal.
    raise notice 'identities insert dilewati: %', sqlerrm;
  end;

  -- Profil admin dibuat otomatis oleh trigger on_auth_user_created.

  -- ---------- Simpan profil sekolah ----------
  update public.school_settings set
    app_name       = coalesce(nullif(trim(coalesce(p_app_name, '')), ''), app_name),
    school_name    = coalesce(nullif(trim(coalesce(p_school_name, '')), ''), school_name),
    logo_url       = nullif(trim(coalesce(p_logo_url, '')), ''),
    city           = nullif(trim(coalesce(p_city, '')), ''),
    address        = nullif(trim(coalesce(p_address, '')), ''),
    headmaster     = nullif(trim(coalesce(p_headmaster, '')), ''),
    academic_year  = nullif(trim(coalesce(p_academic_year, '')), '')
  where id = true;

  -- ---------- Kunci setup selamanya ----------
  insert into public.system_settings (key, value)
  values ('setup_completed', '{"done": true}')
  on conflict (key) do update set value = '{"done": true}', updated_at = now();

  perform public.log_audit('SETUP_COMPLETED', 'school_settings', v_uid::text,
                           jsonb_build_object('username', p_username));

  return jsonb_build_object('ok', true, 'username', p_username);
end $$;
