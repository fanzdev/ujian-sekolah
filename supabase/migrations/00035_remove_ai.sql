-- ============================================================
-- SMK AL-FATA CBT — Migration 00035: Hapus Total Fitur AI
-- Menghapus chat AI, AI grading, laporan AI dari database.
-- Untuk database LAMA yang pernah jalankan 00006_ai_keys.sql.
-- Idempotent: aman dijalankan ulang.
-- ============================================================

-- ---------- 1) Hapus tabel realtime publication AI ----------
do $$ begin
  alter publication supabase_realtime drop table public.ai_provider_keys;
exception when others then null; end $$;

do $$ begin
  alter publication supabase_realtime drop table public.essay_grades;
exception when others then null; end $$;

-- ---------- 2) Hapus pool API key AI (tabel + trigger + policy + index) ----------
drop trigger if exists trg_ai_keys_updated on public.ai_provider_keys;
drop table if exists public.ai_provider_keys;

-- ---------- 3) Membersihkan essay_grades (kolom AI + status) ----------
-- 3a. Konversi sisa status ai_graded -> pending (agar constraint berikut bisa dibentuk)
update public.essay_grades
   set status = 'pending'
 where status = 'ai_graded';

-- 3b. Hapus kolom AI
alter table public.essay_grades
  drop column if exists ai_score,
  drop column if exists ai_feedback,
  drop column if exists ai_confidence,
  drop column if exists ai_provider;

-- 3c. Hapus constraint check yang masih mengandung nilai 'ai_graded'
do $$
declare
  con_name text;
begin
  for con_name in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.essay_grades'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%ai_graded%'
  loop
    execute format('alter table public.essay_grades drop constraint %I', con_name);
  end loop;
end $$;

-- 3d. Pembentukan ulang constraint status hanya pending/graded
alter table public.essay_grades
  add constraint essay_grades_status_check check (status in ('pending', 'graded'));

-- ---------- 4) Hapus konfigurasi AI dari system_settings ----------
delete from public.system_settings where key = 'ai';

-- ---------- 5) Hapus audit trail AI grading (resource 'ai') ----------
delete from public.audit_logs where action = 'GRADE_ESSAY' and resource = 'ai';