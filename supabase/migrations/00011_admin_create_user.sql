-- ============================================================
-- SMK AL-FATA CBT — Migration 00011: Admin create user fallback
-- Fallback tanpa Edge Function: admin dapat membuat akun siswa/guru
-- langsung via RPC security definer. Edge tetap utama jika tersedia.
-- ============================================================

create or replace function public.admin_create_user(
  p_username  text,
  p_password  text,
  p_full_name text,
  p_role      public.user_role,
  p_student   jsonb default null,
  p_teacher   jsonb default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, auth
as $$
declare
  v_is_admin boolean;
  v_uid      uuid;
  v_mail     text;
  v_uname    text;
  v_sub      text;
  v_ident    jsonb;
  v_prof_id  uuid;
  v_teacher_id uuid;
begin
  select private.is_admin() into v_is_admin;
  if not coalesce(v_is_admin, false) then
    raise exception 'Hanya admin yang diizinkan membuat akun.';
  end if;

  v_uname := lower(trim(coalesce(p_username, '')));
  if v_uname !~ '^[a-z0-9._-]{3,30}$' then
    raise exception 'Username hanya boleh huruf, angka, titik, garis bawah/strip (3-30 karakter).';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'Password minimal 8 karakter.';
  end if;
  if length(trim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'Nama lengkap wajib diisi (min. 2 karakter).';
  end if;
  if p_role not in ('admin','teacher','student') then
    raise exception 'Role tidak valid.';
  end if;

  if exists (select 1 from public.profiles where username ilike v_uname) then
    raise exception 'Username "%" sudah digunakan.', v_uname;
  end if;

  v_uid  := gen_random_uuid();
  v_mail := v_uname || '@cbt.local';

  if exists (select 1 from auth.users where email = v_mail) then
    raise exception 'Email "%" sudah terdaftar.', v_mail;
  end if;

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
    jsonb_build_object('username', v_uname, 'full_name', trim(p_full_name), 'role', p_role::text),
    now(), now(),
    '', '', '', '',
    null, null
  );

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
        and column_name in ('id','user_id','provider_id','identity_data','provider','last_sign_in_at','created_at','updated_at');
      if v_has_id then
        execute format(
          'insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) values (%s, $1, $2, $3, ''email'', now(), now(), now())',
          case when v_id_is_uuid then 'gen_random_uuid()' else 'gen_random_uuid()::text' end
        ) using v_uid, v_sub, v_ident;
      else
        execute format(
          'insert into auth.identities (user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) values ($1, $2, $3, ''email'', now(), now(), now())'
        ) using v_uid, v_sub, v_ident;
      end if;
    end;
  exception when others then
    raise notice 'identities insert dilewati: %', sqlerrm;
  end;

  -- profiles dibuat otomatis via trigger handle_new_user, tapi pastikan field sinkron
  perform pg_sleep(0.01);
  select id into v_prof_id from public.profiles where id = v_uid;
  if v_prof_id is null then
    -- fallback jika trigger belum jalan (race), buat manual
    insert into public.profiles (id, username, full_name, role, is_active)
    values (v_uid, v_uname, trim(p_full_name), p_role, true)
    on conflict (id) do update set username = excluded.username, full_name = excluded.full_name, role = excluded.role;
  else
    update public.profiles
      set username = v_uname, full_name = trim(p_full_name), role = p_role
      where id = v_uid;
  end if;

  if p_role = 'student' then
    insert into public.students (profile_id, nis, nisn, gender, birth_place, birth_date, address, phone, email, class_id)
    values (
      v_uid,
      nullif(trim(coalesce(p_student->>'nis','')), ''),
      nullif(trim(coalesce(p_student->>'nisn','')), ''),
      nullif(p_student->>'gender','')::public.gender_type,
      nullif(trim(coalesce(p_student->>'birth_place','')), ''),
      nullif(trim(coalesce(p_student->>'birth_date','')), '')::date,
      nullif(trim(coalesce(p_student->>'address','')), ''),
      nullif(trim(coalesce(p_student->>'phone','')), ''),
      nullif(trim(coalesce(p_student->>'email','')), ''),
      nullif(trim(coalesce(p_student->>'class_id','')), '')::uuid
    );
  elsif p_role = 'teacher' then
    insert into public.teachers (profile_id, nip, phone, email, address)
    values (
      v_uid,
      nullif(trim(coalesce(p_teacher->>'nip','')), ''),
      nullif(trim(coalesce(p_teacher->>'phone','')), ''),
      nullif(trim(coalesce(p_teacher->>'email','')), ''),
      nullif(trim(coalesce(p_teacher->>'address','')), '')
    )
    returning id into v_teacher_id;
    if coalesce(p_teacher->'subject_ids','[]'::jsonb) != '[]'::jsonb then
      insert into public.teacher_subjects (teacher_id, subject_id)
      select v_teacher_id, (value #>> '{}')::uuid
      from jsonb_array_elements_text(p_teacher->'subject_ids') with ordinality
      on conflict do nothing;
    end if;
  end if;

  perform public.log_audit('CREATE_USER', 'profile', v_uid::text,
    jsonb_build_object('role', p_role, 'username', v_uname, 'via', 'rpc_fallback'));

  return jsonb_build_object('ok', true, 'user_id', v_uid, 'email', v_mail);
end
$$;

revoke all on function public.admin_create_user(text,text,text,public.user_role,jsonb,jsonb) from public;
grant execute on function public.admin_create_user(text,text,text,public.user_role,jsonb,jsonb) to authenticated;

comment on function public.admin_create_user is 'Fallback RPC untuk pembuatan akun tanpa Edge Function manage-user';
