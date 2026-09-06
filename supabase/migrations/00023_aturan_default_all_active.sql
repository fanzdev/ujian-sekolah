-- Aturan ujian default semua aktif sesuai permintaan user
-- 1) Ubah default kolom exams agar ujian baru langsung aktif semua fitur
-- 2) Update system_settings exam_defaults agar panel Admin & ExamEditor menampilkan ON

alter table public.exams alter column fullscreen_required set default true;
alter table public.exams alter column camera_monitoring set default true;
alter table public.exams alter column show_answers_after set default true;

-- Update system_settings exam_defaults jika sudah ada (jangan overwrite custom admin jika sudah diubah, tapi pastikan semua true untuk instalasi baru)
-- Untuk instalasi existing, paksa update agar default baru aktif semua (admin masih bisa matikan manual per ujian)
update public.system_settings
set value = jsonb_set(
  jsonb_set(
    jsonb_set(
      coalesce(value, '{}'::jsonb),
      '{fullscreen_required}', 'true'::jsonb
    ),
    '{camera_monitoring}', 'true'::jsonb
  ),
  '{show_answers_after}', 'true'::jsonb
)
where key = 'exam_defaults';

-- Jika belum ada row exam_defaults (fresh install via 00005), insert dengan semua true
insert into public.system_settings (key, value)
values (
  'exam_defaults',
  '{
    "duration_minutes": 60,
    "max_attempts": 1,
    "violation_limit": 3,
    "auto_submit_on_limit": true,
    "shuffle_questions": true,
    "shuffle_options": true,
    "fullscreen_required": true,
    "camera_monitoring": true,
    "show_result_to_student": true,
    "show_answers_after": true,
    "passing_grade": 0
  }'
)
on conflict (key) do nothing;
