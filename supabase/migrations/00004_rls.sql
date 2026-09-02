-- ============================================================
-- SMK AL-FATA CBT — Migration 00004: RLS (Row Level Security)
-- RLS adalah security boundary. Frontend authorization hanyalah UX.
-- ============================================================

-- ---------- Helper functions ----------
create or replace function private.my_uid()
returns uuid language sql stable as
$$ select auth.uid() $$;

create or replace function private.my_role()
returns public.user_role
language sql stable security definer set search_path = public as
$$ select p.role from public.profiles p where p.id = auth.uid() $$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = public as
$$ select private.my_role() = 'admin' $$;

create or replace function private.my_teacher_id()
returns uuid language sql stable security definer set search_path = public as
$$ select t.id from public.teachers t where t.profile_id = auth.uid() $$;

create or replace function private.my_student_id()
returns uuid language sql stable security definer set search_path = public as
$$ select s.id from public.students s where s.profile_id = auth.uid() $$;

create or replace function private.exam_owned_by_me(p_exam_id uuid)
returns boolean language sql stable security definer set search_path = public as
$$ select exists (
  select 1 from public.exams e
  where e.id = p_exam_id
    and (e.created_by = auth.uid() or e.teacher_id = private.my_teacher_id())
) $$;

-- ============================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================
alter table public.profiles           enable row level security;
alter table public.departments        enable row level security;
alter table public.classes            enable row level security;
alter table public.teachers           enable row level security;
alter table public.students           enable row level security;
alter table public.subjects           enable row level security;
alter table public.teacher_subjects   enable row level security;
alter table public.question_banks     enable row level security;
alter table public.questions          enable row level security;
alter table public.question_options   enable row level security;
alter table public.matching_pairs     enable row level security;
alter table public.exams              enable row level security;
alter table public.exam_targets       enable row level security;
alter table public.exam_participants  enable row level security;
alter table public.exam_questions     enable row level security;
alter table public.exam_attempts      enable row level security;
alter table public.answers            enable row level security;
alter table public.essay_grades       enable row level security;
alter table public.exam_results       enable row level security;
alter table public.exam_violations    enable row level security;
alter table public.audit_logs         enable row level security;
alter table public.notifications      enable row level security;
alter table public.system_settings    enable row level security;
alter table public.school_settings    enable row level security;
alter table public.media_files        enable row level security;

-- ============================================================
-- PROFILES
-- insert ditangani trigger on_auth_user_created / Edge Function (service role).
-- ============================================================
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated
  using (
    id = private.my_uid()
    or private.is_admin()
    or private.my_role() = 'teacher'
  );

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles for update to authenticated
  using (id = private.my_uid() or private.is_admin())
  with check (id = private.my_uid() or private.is_admin());

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles for delete to authenticated
  using (private.is_admin());

-- ============================================================
-- ACADEMIC TABLES — read: semua user terautentikasi; write: admin
-- ============================================================
drop policy if exists "departments_select" on public.departments;
create policy "departments_select" on public.departments for select to authenticated using (true);
drop policy if exists "departments_write_admin" on public.departments;
create policy "departments_write_admin" on public.departments for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

drop policy if exists "classes_select" on public.classes;
create policy "classes_select" on public.classes for select to authenticated using (true);
drop policy if exists "classes_write_admin" on public.classes;
create policy "classes_write_admin" on public.classes for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

drop policy if exists "subjects_select" on public.subjects;
create policy "subjects_select" on public.subjects for select to authenticated using (true);
drop policy if exists "subjects_write_admin" on public.subjects;
create policy "subjects_write_admin" on public.subjects for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

drop policy if exists "teacher_subjects_select" on public.teacher_subjects;
create policy "teacher_subjects_select" on public.teacher_subjects for select to authenticated using (true);
drop policy if exists "teacher_subjects_write_admin" on public.teacher_subjects;
create policy "teacher_subjects_write_admin" on public.teacher_subjects for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- TEACHERS
drop policy if exists "teachers_select" on public.teachers;
create policy "teachers_select" on public.teachers for select to authenticated using (true);
drop policy if exists "teachers_insert_admin" on public.teachers;
create policy "teachers_insert_admin" on public.teachers for insert to authenticated
  with check (private.is_admin());
drop policy if exists "teachers_update_admin_or_self" on public.teachers;
create policy "teachers_update_admin_or_self" on public.teachers for update to authenticated
  using (private.is_admin() or profile_id = private.my_uid())
  with check (private.is_admin() or profile_id = private.my_uid());
drop policy if exists "teachers_delete_admin" on public.teachers;
create policy "teachers_delete_admin" on public.teachers for delete to authenticated
  using (private.is_admin());

-- STUDENTS: staff baca; siswa hanya data sendiri; tulis: admin
drop policy if exists "students_select" on public.students;
create policy "students_select" on public.students for select to authenticated
  using (profile_id = private.my_uid() or private.is_admin() or private.my_role() = 'teacher');
drop policy if exists "students_insert_admin" on public.students;
create policy "students_insert_admin" on public.students for insert to authenticated
  with check (private.is_admin());
drop policy if exists "students_update_admin" on public.students;
create policy "students_update_admin" on public.students for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
drop policy if exists "students_delete_admin" on public.students;
create policy "students_delete_admin" on public.students for delete to authenticated
  using (private.is_admin());

-- ============================================================
-- QUESTION BANKS & QUESTIONS
-- Siswa TIDAK punya akses langsung (answer key tidak pernah keluar dari DB).
-- ============================================================
drop policy if exists "banks_select" on public.question_banks;
create policy "banks_select" on public.question_banks for select to authenticated
  using (
    private.is_admin()
    or author_id = private.my_uid()
    or (status = 'published' and private.my_role() = 'teacher')
  );
drop policy if exists "banks_insert_own" on public.question_banks;
create policy "banks_insert_own" on public.question_banks for insert to authenticated
  with check (author_id = private.my_uid());
drop policy if exists "banks_update_own_or_admin" on public.question_banks;
create policy "banks_update_own_or_admin" on public.question_banks for update to authenticated
  using (private.is_admin() or author_id = private.my_uid())
  with check (private.is_admin() or author_id = private.my_uid());
drop policy if exists "banks_delete_own_or_admin" on public.question_banks;
create policy "banks_delete_own_or_admin" on public.question_banks for delete to authenticated
  using (private.is_admin() or author_id = private.my_uid());

drop policy if exists "questions_select" on public.questions;
create policy "questions_select" on public.questions for select to authenticated
  using (
    exists (
      select 1 from public.question_banks b
      where b.id = bank_id
        and (private.is_admin()
             or b.author_id = private.my_uid()
             or (b.status = 'published' and private.my_role() = 'teacher'))
    )
  );
drop policy if exists "questions_write_via_bank" on public.questions;
create policy "questions_write_via_bank" on public.questions for all to authenticated
  using (
    exists (
      select 1 from public.question_banks b
      where b.id = bank_id and (private.is_admin() or b.author_id = private.my_uid())
    )
  )
  with check (
    exists (
      select 1 from public.question_banks b
      where b.id = bank_id and (private.is_admin() or b.author_id = private.my_uid())
    )
  );

drop policy if exists "options_select" on public.question_options;
create policy "options_select" on public.question_options for select to authenticated
  using (
    exists (
      select 1 from public.questions q join public.question_banks b on b.id = q.bank_id
      where q.id = question_id
        and (private.is_admin()
             or b.author_id = private.my_uid()
             or (b.status = 'published' and private.my_role() = 'teacher'))
    )
  );
drop policy if exists "options_write_via_bank" on public.question_options;
create policy "options_write_via_bank" on public.question_options for all to authenticated
  using (
    exists (
      select 1 from public.questions q join public.question_banks b on b.id = q.bank_id
      where q.id = question_id and (private.is_admin() or b.author_id = private.my_uid())
    )
  )
  with check (
    exists (
      select 1 from public.questions q join public.question_banks b on b.id = q.bank_id
      where q.id = question_id and (private.is_admin() or b.author_id = private.my_uid())
    )
  );

drop policy if exists "pairs_select" on public.matching_pairs;
create policy "pairs_select" on public.matching_pairs for select to authenticated
  using (
    exists (
      select 1 from public.questions q join public.question_banks b on b.id = q.bank_id
      where q.id = question_id
        and (private.is_admin()
             or b.author_id = private.my_uid()
             or (b.status = 'published' and private.my_role() = 'teacher'))
    )
  );
drop policy if exists "pairs_write_via_bank" on public.matching_pairs;
create policy "pairs_write_via_bank" on public.matching_pairs for all to authenticated
  using (
    exists (
      select 1 from public.questions q join public.question_banks b on b.id = q.bank_id
      where q.id = question_id and (private.is_admin() or b.author_id = private.my_uid())
    )
  )
  with check (
    exists (
      select 1 from public.questions q join public.question_banks b on b.id = q.bank_id
      where q.id = question_id and (private.is_admin() or b.author_id = private.my_uid())
    )
  );

-- ============================================================
-- EXAMS + TABEL ANAK
-- Siswa TIDAK PERNAH query exams langsung — melalui RPC payload.
-- ============================================================
drop policy if exists "exams_select_staff" on public.exams;
create policy "exams_select_staff" on public.exams for select to authenticated
  using (private.is_admin() or created_by = private.my_uid() or teacher_id = private.my_teacher_id());
drop policy if exists "exams_insert_staff" on public.exams;
create policy "exams_insert_staff" on public.exams for insert to authenticated
  with check (private.is_admin() or private.my_role() = 'teacher');
drop policy if exists "exams_update_owner" on public.exams;
create policy "exams_update_owner" on public.exams for update to authenticated
  using (private.is_admin() or created_by = private.my_uid() or teacher_id = private.my_teacher_id())
  with check (private.is_admin() or created_by = private.my_uid() or teacher_id = private.my_teacher_id());
drop policy if exists "exams_delete_owner" on public.exams;
create policy "exams_delete_owner" on public.exams for delete to authenticated
  using (private.is_admin() or created_by = private.my_uid() or teacher_id = private.my_teacher_id());

drop policy if exists "targets_staff" on public.exam_targets;
create policy "targets_staff" on public.exam_targets for all to authenticated
  using (private.is_admin() or private.exam_owned_by_me(exam_id))
  with check (private.is_admin() or private.exam_owned_by_me(exam_id));

drop policy if exists "participants_staff" on public.exam_participants;
create policy "participants_staff" on public.exam_participants for all to authenticated
  using (private.is_admin() or private.exam_owned_by_me(exam_id))
  with check (private.is_admin() or private.exam_owned_by_me(exam_id));

drop policy if exists "exam_questions_staff" on public.exam_questions;
create policy "exam_questions_staff" on public.exam_questions for all to authenticated
  using (private.is_admin() or private.exam_owned_by_me(exam_id))
  with check (private.is_admin() or private.exam_owned_by_me(exam_id));

-- ============================================================
-- ATTEMPTS / ANSWERS / GRADES / RESULTS / VIOLATIONS
-- insert/update attempt & results hanya via SECURITY DEFINER RPC.
-- ============================================================
drop policy if exists "attempts_select" on public.exam_attempts;
create policy "attempts_select" on public.exam_attempts for select to authenticated
  using (
    student_id = private.my_student_id()
    or private.is_admin()
    or private.exam_owned_by_me(exam_id)
  );
drop policy if exists "attempts_delete_admin" on public.exam_attempts;
create policy "attempts_delete_admin" on public.exam_attempts for delete to authenticated
  using (private.is_admin());

drop policy if exists "answers_select" on public.answers;
create policy "answers_select" on public.answers for select to authenticated
  using (
    exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_id
        and (a.student_id = private.my_student_id()
             or private.is_admin()
             or private.exam_owned_by_me(a.exam_id))
    )
  );
drop policy if exists "answers_insert_own_active" on public.answers;
create policy "answers_insert_own_active" on public.answers for insert to authenticated
  with check (
    exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_id
        and a.student_id = private.my_student_id()
        and a.status = 'in_progress'
    )
  );
drop policy if exists "answers_update_own_active" on public.answers;
create policy "answers_update_own_active" on public.answers for update to authenticated
  using (
    exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_id
        and a.student_id = private.my_student_id()
        and a.status = 'in_progress'
    )
  )
  with check (
    exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_id
        and a.student_id = private.my_student_id()
        and a.status = 'in_progress'
    )
  );
drop policy if exists "answers_delete_admin" on public.answers;
create policy "answers_delete_admin" on public.answers for delete to authenticated
  using (private.is_admin());

drop policy if exists "essay_grades_select" on public.essay_grades;
create policy "essay_grades_select" on public.essay_grades for select to authenticated
  using (
    exists (
      select 1 from public.exam_attempts a join public.exams e on e.id = a.exam_id
      where a.id = attempt_id
        and (private.is_admin()
             or private.exam_owned_by_me(a.exam_id)
             or (a.student_id = private.my_student_id() and e.show_result_to_student))
    )
  );
drop policy if exists "essay_grades_write_grader" on public.essay_grades;
create policy "essay_grades_write_grader" on public.essay_grades for all to authenticated
  using (
    exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_id
        and (private.is_admin() or private.exam_owned_by_me(a.exam_id))
    )
  )
  with check (
    exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_id
        and (private.is_admin() or private.exam_owned_by_me(a.exam_id))
    )
  );

drop policy if exists "results_select" on public.exam_results;
create policy "results_select" on public.exam_results for select to authenticated
  using (
    private.is_admin()
    or private.exam_owned_by_me(exam_id)
    or (
      student_id = private.my_student_id()
      and exists (
        select 1 from public.exams e where e.id = exam_id and e.show_result_to_student
      )
    )
  );
drop policy if exists "results_delete_admin" on public.exam_results;
create policy "results_delete_admin" on public.exam_results for delete to authenticated
  using (private.is_admin());

drop policy if exists "violations_select_staff" on public.exam_violations;
create policy "violations_select_staff" on public.exam_violations for select to authenticated
  using (private.is_admin() or private.exam_owned_by_me(exam_id));
drop policy if exists "violations_delete_admin" on public.exam_violations;
create policy "violations_delete_admin" on public.exam_violations for delete to authenticated
  using (private.is_admin());

-- ============================================================
-- SYSTEM TABLES
-- ============================================================
drop policy if exists "audit_select_admin" on public.audit_logs;
create policy "audit_select_admin" on public.audit_logs for select to authenticated
  using (private.is_admin());

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications for select to authenticated
  using (recipient_id = private.my_uid() or private.is_admin());
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications for update to authenticated
  using (recipient_id = private.my_uid() or private.is_admin())
  with check (recipient_id = private.my_uid() or private.is_admin());
drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications for delete to authenticated
  using (recipient_id = private.my_uid() or private.is_admin());
drop policy if exists "notifications_insert_admin" on public.notifications;
create policy "notifications_insert_admin" on public.notifications for insert to authenticated
  with check (private.is_admin());

drop policy if exists "system_settings_select" on public.system_settings;
create policy "system_settings_select" on public.system_settings for select to authenticated using (true);
drop policy if exists "system_settings_write_admin" on public.system_settings;
create policy "system_settings_write_admin" on public.system_settings for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

drop policy if exists "school_settings_read_public" on public.school_settings;
create policy "school_settings_read_public" on public.school_settings for select
  to anon, authenticated using (true);
drop policy if exists "school_settings_write_admin" on public.school_settings;
create policy "school_settings_write_admin" on public.school_settings for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

drop policy if exists "media_files_select" on public.media_files;
create policy "media_files_select" on public.media_files for select to authenticated
  using (owner_id = private.my_uid() or private.is_admin() or private.my_role() = 'teacher');
drop policy if exists "media_files_insert_own" on public.media_files;
create policy "media_files_insert_own" on public.media_files for insert to authenticated
  with check (owner_id = private.my_uid());
drop policy if exists "media_files_delete_own_or_admin" on public.media_files;
create policy "media_files_delete_own_or_admin" on public.media_files for delete to authenticated
  using (owner_id = private.my_uid() or private.is_admin());
