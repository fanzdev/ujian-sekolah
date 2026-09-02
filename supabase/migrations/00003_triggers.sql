-- ============================================================
-- SMK AL-FATA CBT — Migration 00003: Triggers
-- ============================================================

-- Recompute exams.total_points whenever exam_questions change
create or replace function public.recalc_exam_total_points()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_exam uuid := coalesce(new.exam_id, old.exam_id);
begin
  update public.exams e
  set total_points = coalesce((
    select sum(coalesce(eq.points, q.points))
    from public.exam_questions eq
    join public.questions q on q.id = eq.question_id
    where eq.exam_id = v_exam
  ), 0)
  where e.id = v_exam;
  return null;
end $$;

drop trigger if exists trg_recalc_points_ins on public.exam_questions;
create constraint trigger trg_recalc_points_ins
  after insert on public.exam_questions deferrable initially deferred
  for each row execute procedure public.recalc_exam_total_points();
drop trigger if exists trg_recalc_points_upd on public.exam_questions;
create constraint trigger trg_recalc_points_upd
  after update of points on public.exam_questions deferrable initially deferred
  for each row execute procedure public.recalc_exam_total_points();
drop trigger if exists trg_recalc_points_del on public.exam_questions;
create constraint trigger trg_recalc_points_del
  after delete on public.exam_questions deferrable initially deferred
  for each row execute procedure public.recalc_exam_total_points();

-- Populate exam_participants based on targets (class / department)
create or replace function public.sync_exam_participants(p_exam_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.exam_participants (exam_id, student_id, added_by)
  select p_exam_id, s.id, null
  from public.students s
  join public.classes c on c.id = s.class_id
  where s.is_active
    and exists (
      select 1 from public.exam_targets t
      where t.exam_id = p_exam_id
        and ((t.kind = 'class' and t.target_id = c.id)
          or (t.kind = 'department' and t.target_id = c.department_id))
    )
  on conflict (exam_id, student_id) do nothing;
end $$;

create or replace function public.trg_populate_participants()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.sync_exam_participants(new.exam_id);
  return null;
end $$;

drop trigger if exists trg_targets_populate on public.exam_targets;
create trigger trg_targets_populate
  after insert on public.exam_targets
  for each row execute procedure public.trg_populate_participants();

-- Re-sync participants when a student moves class
create or replace function public.trg_student_class_changed()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_exam uuid;
begin
  if tg_op = 'UPDATE' and new.class_id is not distinct from old.class_id then
    return null;
  end if;

  for v_exam in
    select distinct t.exam_id
    from public.exam_targets t
    join public.classes c on c.id = new.class_id
    join public.exams e on e.id = t.exam_id
    where ((t.kind = 'class' and t.target_id = c.id)
        or (t.kind = 'department' and t.target_id = c.department_id))
      and e.status in ('draft', 'published')
  loop
    perform public.sync_exam_participants(v_exam);
  end loop;
  return null;
end $$;

drop trigger if exists trg_students_resync on public.students;
create trigger trg_students_resync
  after insert or update of class_id on public.students
  for each row execute procedure public.trg_student_class_changed();

-- Recalculate final score whenever an essay grade is written
create or replace function public.trg_essay_grade_written()
returns trigger
language plpgsql security definer set search_path = public, private
as $$
begin
  perform public.recalc_result(new.attempt_id);
  return null;
end $$;

drop trigger if exists trg_essay_grades_recalc on public.essay_grades;
create trigger trg_essay_grades_recalc
  after insert or update on public.essay_grades
  for each row execute procedure public.trg_essay_grade_written();
