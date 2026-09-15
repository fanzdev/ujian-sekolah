-- ============================================================
-- SMK AL-FATA CBT — Migration 00038: Bobot Otomatis 0-100
-- Keinginan: 10 soal benar 7 => nilai 70, nilai maksimal 100.
-- Setiap soal berbobot sama: bobot = 100 / total_soal.
-- Skor parsial (PG kompleks / menjodohkan) ikut proporsional.
-- Essay dinilai 0-100 per soal (persentase kebenaran), lalu
-- dikali bobotnya. Kolom points lama diabaikan untuk nilai
-- akhir (tetap disimpan untuk kompatibilitas).
-- ============================================================

create or replace function public.submit_attempt(p_attempt_id uuid, p_auto boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path = public, private as $$
declare
  v_attempt public.exam_attempts%rowtype;
  v_exam    public.exams%rowtype;
  v_ans     jsonb;
  v_ratio   numeric;
  v_ok      int := 0;
  v_bad     int := 0;
  v_none    int := 0;
  v_obj     numeric := 0;
  v_total_q int := 0;
  v_weight  numeric := 0;
  v_essay_total   int := 0;
  v_essay_graded  int := 0;
  v_essay_score   numeric := 0;
  v_pending       boolean;
  v_final         numeric;
  v_passed        boolean;
  rec       record;
  pr        record;
  v_order   uuid[];
  v_rk      int;
  v_tot     int;
  v_matches int;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if not found then raise exception 'Attempt tidak ditemukan.'; end if;

  if not exists (
    select 1 from public.students s
    where s.id = v_attempt.student_id and s.profile_id = auth.uid()
  ) and not private.is_admin() then
    raise exception 'Akses ditolak.';
  end if;

  if v_attempt.status <> 'in_progress' then
    return jsonb_build_object('already_submitted', true);
  end if;

  select * into v_exam from public.exams where id = v_attempt.exam_id;
  if p_auto is not true and now() > v_attempt.deadline + interval '60 seconds' then
    p_auto := true;
  end if;

  select count(*) into v_total_q
  from public.exam_questions eq where eq.exam_id = v_attempt.exam_id;
  if coalesce(v_total_q, 0) = 0 then
    raise exception 'Ujian belum memiliki soal.';
  end if;
  v_weight := 100.0 / v_total_q;

  for rec in
    select eq.question_id as qid,
           q.type as qtype, q.default_answer, q.scoring_rule
    from public.exam_questions eq
    join public.questions q on q.id = eq.question_id
    where eq.exam_id = v_attempt.exam_id
  loop
    continue when rec.qtype = 'essay';

    select value into v_ans from public.answers
    where attempt_id = p_attempt_id and question_id = rec.qid;

    if v_ans is null or jsonb_typeof(v_ans) = 'null'
       or (rec.qtype in ('short_answer') and coalesce(v_ans #>> '{}', '') = '')
       or (rec.qtype = 'multiple_response' and jsonb_typeof(v_ans) = 'array' and jsonb_array_length(v_ans) = 0) then
      v_none := v_none + 1;
      continue;
    end if;

    begin
      v_ratio := 0;
      if rec.qtype = 'multiple_choice' then
        select case when o.is_correct then 1 else 0 end into v_ratio
        from public.question_options o
        where o.question_id = rec.qid and o.id = (v_ans #>> '{}')::uuid;
        v_ratio := coalesce(v_ratio, 0);

      elsif rec.qtype = 'multiple_response' then
        with sel as (
          select s.value::uuid as oid from jsonb_array_elements_text(v_ans) s(value)
        ),
        tot as (
          select count(*)::int as n from public.question_options
          where question_id = rec.qid and is_correct
        ),
        okc as (
          select count(*)::int as n
          from sel join public.question_options o on o.id = sel.oid and o.is_correct
        ),
        badc as (
          select count(*)::int as n
          from sel join public.question_options o on o.id = sel.oid and not o.is_correct
        )
        select case
                 when tot.n = 0 then 0
                 when coalesce(rec.scoring_rule ->> 'partial', 'false') = 'true'
                   then greatest(0, okc.n - badc.n)::numeric / tot.n
                 else (okc.n = tot.n and badc.n = 0)::int
               end
        into v_ratio from tot, okc, badc;

      elsif rec.qtype = 'true_false' then
        v_ratio := (lower(coalesce(v_ans::text, '')) = lower(coalesce(rec.default_answer ->> 'answer', 'false')))::int;

      elsif rec.qtype = 'short_answer' then
        if coalesce(rec.scoring_rule ->> 'match_mode', 'exact') = 'contains' then
          select exists (
            select 1 from jsonb_array_elements_text(coalesce(rec.default_answer -> 'accepted', '[]'::jsonb)) a(v)
            where position(private.norm_text(a.v) in private.norm_text(v_ans #>> '{}')) > 0
          )::int into v_ratio;
        elsif coalesce(rec.scoring_rule ->> 'match_mode', 'exact') = 'numeric' then
          begin
            v_ratio := (abs((v_ans #>> '{}')::numeric - (coalesce(rec.default_answer -> 'accepted', '[]'::jsonb ->> 0))::numeric)
                        <= coalesce((rec.scoring_rule ->> 'tolerance')::numeric, 0))::int;
          exception when others then v_ratio := 0;
          end;
        else
          select exists (
            select 1
            from jsonb_array_elements_text(coalesce(rec.default_answer -> 'accepted', '[]'::jsonb)) a(v)
            where private.norm_text(a.v) = private.norm_text(v_ans #>> '{}')
          )::int into v_ratio;
        end if;

      elsif rec.qtype = 'matching' then
        select array(select value::uuid
                     from jsonb_array_elements_text(v_attempt.match_orders -> rec.qid::text)) into v_order;
        v_tot := 0; v_matches := 0;
        for pr in
          select mp.id,
                 (row_number() over (order by mp.position)) as rn
          from public.matching_pairs mp where mp.question_id = rec.qid
        loop
          v_tot := v_tot + 1;
          v_rk := coalesce((v_ans ->> pr.rn::text)::int, 0);
          if v_rk between 1 and coalesce(array_length(v_order, 1), 0)
             and v_order[v_rk] = pr.id then
            v_matches := v_matches + 1;
          end if;
        end loop;
        v_ratio := case
                     when v_tot = 0 then 0
                     when coalesce(rec.scoring_rule ->> 'partial', 'false') = 'true'
                       then v_matches::numeric / v_tot
                     else (v_matches = v_tot)::int
                   end;
      end if;
    exception when others then
      v_ratio := 0;
    end;

    v_obj := v_obj + (coalesce(v_ratio, 0) * v_weight);
    if coalesce(v_ratio, 0) >= 1 then v_ok := v_ok + 1; else v_bad := v_bad + 1; end if;
  end loop;

  select count(*) into v_essay_total
  from public.exam_questions eq join public.questions q on q.id = eq.question_id
  where eq.exam_id = v_attempt.exam_id and q.type = 'essay';

  select count(*) into v_essay_graded
  from public.essay_grades g
  where g.attempt_id = p_attempt_id and g.status = 'graded';

  select coalesce(sum(
    (least(100, greatest(0, g.final_score)) / 100.0) * v_weight
  ), 0) into v_essay_score
  from public.essay_grades g
  where g.attempt_id = p_attempt_id and g.status = 'graded';

  v_obj := round(least(100, greatest(0, v_obj)), 2);
  v_essay_score := round(least(100, greatest(0, v_essay_score)), 2);
  v_pending := v_essay_graded < v_essay_total;
  v_final   := round(least(100, v_obj + v_essay_score), 2);
  v_passed  := case when v_pending or v_exam.passing_grade <= 0 then null
                    else v_final >= v_exam.passing_grade end;

  update public.exam_attempts
  set status = (case when p_auto then 'auto_submitted' else 'submitted' end)::public.attempt_status,
      submitted_at = now(),
      last_activity_at = now()
  where id = p_attempt_id;

  insert into public.exam_results (
    attempt_id, exam_id, student_id, total_questions,
    correct_count, wrong_count, unanswered_count,
    objective_score, essay_score, final_score, passed,
    submitted_at, duration_seconds, violation_count
  ) values (
    p_attempt_id, v_attempt.exam_id, v_attempt.student_id,
    v_total_q, v_ok, v_bad, v_none,
    v_obj, case when v_essay_total = 0 then null else v_essay_score end,
    v_final, v_passed,
    now(), extract(epoch from (now() - v_attempt.started_at))::int,
    v_attempt.violation_count
  )
  on conflict (attempt_id) do update set
    total_questions = excluded.total_questions,
    correct_count = excluded.correct_count,
    wrong_count = excluded.wrong_count,
    unanswered_count = excluded.unanswered_count,
    objective_score = excluded.objective_score,
    essay_score = excluded.essay_score,
    final_score = excluded.final_score,
    passed = excluded.passed,
    submitted_at = excluded.submitted_at,
    duration_seconds = excluded.duration_seconds,
    violation_count = excluded.violation_count,
    updated_at = now();

  perform public.log_audit(
    case when p_auto then 'AUTO_SUBMIT' else 'SUBMIT_EXAM' end,
    'exam_attempt', p_attempt_id::text,
    jsonb_build_object('exam_id', v_attempt.exam_id, 'objective_score', v_obj)
  );

  return jsonb_build_object(
    'objective_score', v_obj,
    'correct', v_ok, 'wrong', v_bad, 'unanswered', v_none,
    'essay_total', v_essay_total,
    'essay_graded', v_essay_graded,
    'essay_pending', v_pending,
    'final_score', v_final,
    'passed', v_passed
  );
end $$;

create or replace function public.recalc_result(p_attempt_id uuid)
returns void
language plpgsql volatile security definer set search_path = public, private as $$
declare
  r public.exam_results%rowtype;
  v_exam public.exams%rowtype;
  v_total_q int;
  v_weight numeric;
  v_essay_total int;
  v_essay_graded int;
  v_essay_score numeric;
  v_final numeric;
begin
  select * into r from public.exam_results where attempt_id = p_attempt_id;
  if not found then return; end if;

  select * into v_exam from public.exams where id = r.exam_id;

  select count(*) into v_total_q
  from public.exam_questions where exam_id = r.exam_id;
  v_total_q := greatest(coalesce(v_total_q, 0), 1);
  v_weight := 100.0 / v_total_q;

  select count(*) into v_essay_total
  from public.exam_questions eq join public.questions q on q.id = eq.question_id
  where eq.exam_id = r.exam_id and q.type = 'essay';

  select count(*) into v_essay_graded
  from public.essay_grades g where g.attempt_id = p_attempt_id and g.status = 'graded';

  select coalesce(sum(
    (least(100, greatest(0, g.final_score)) / 100.0) * v_weight
  ), 0) into v_essay_score
  from public.essay_grades where attempt_id = p_attempt_id and status = 'graded';

  v_essay_score := round(least(100, greatest(0, v_essay_score)), 2);
  v_final := round(least(100, coalesce(r.objective_score, 0) + v_essay_score), 2);

  if coalesce(r.objective_score, 0) > 100 then
    update public.exam_results
    set objective_score = round(least(100, greatest(0,
      case when nullif(r.total_questions, 0) is not null and r.total_questions > 0
        then (r.correct_count::numeric / r.total_questions::numeric) * 100
        else 0 end
    )), 2)
    where attempt_id = p_attempt_id
    returning objective_score into r.objective_score;
    v_final := round(least(100, coalesce(r.objective_score, 0) + v_essay_score), 2);
  end if;

  update public.exam_results
  set essay_score = case when v_essay_total = 0 then null else v_essay_score end,
      final_score = v_final,
      total_questions = v_total_q,
      passed = case when v_essay_graded < v_essay_total or v_exam.passing_grade <= 0 then null
                    else v_final >= v_exam.passing_grade end,
      updated_at = now()
  where attempt_id = p_attempt_id;

  if v_essay_graded >= v_essay_total then
    update public.exam_attempts
    set status = 'graded'::public.attempt_status
    where id = p_attempt_id and status in ('submitted'::public.attempt_status, 'auto_submitted'::public.attempt_status);
  end if;
end $$;

-- Normalisasi data lama tanpa essay: nilai = 100 * benar / total
update public.exam_results r
set objective_score = round(
    case when nullif(r.total_questions, 0) is not null
      then (r.correct_count::numeric / r.total_questions::numeric) * 100
      else 0 end, 2),
  final_score = round(
    case when nullif(r.total_questions, 0) is not null
      then (r.correct_count::numeric / r.total_questions::numeric) * 100
      else 0 end, 2),
  updated_at = now()
where r.objective_score > 100
  and not exists (
    select 1 from public.exam_questions eq
    join public.questions q on q.id = eq.question_id
    where eq.exam_id = r.exam_id and q.type = 'essay'
  );
