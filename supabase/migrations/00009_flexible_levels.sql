-- ============================================================
-- SMK AL-FATA CBT — Migration 00009: Tingkat Kelas Fleksibel
-- Mengizinkan level 1–13 (sebelumnya terkunci 10–13) agar cocok
-- dengan penamaan tingkat mana pun yang dipakai sekolah.
--
-- CATATAN: grade_level berada pada tabel question_banks.
-- File ini idempotent — aman dijalankan ulang.
-- ============================================================

-- ---------- classes.level ----------
alter table public.classes
  drop constraint if exists classes_level_check;

do $$ begin
  alter table public.classes
    add constraint classes_level_check check (level between 1 and 13);
exception when others then
  if sqlerrm like '%already exists%' then null; else raise; end if;
end $$;

-- ---------- question_banks.grade_level ----------
alter table public.question_banks
  drop constraint if exists question_banks_grade_level_check;

do $$ begin
  alter table public.question_banks
    add constraint question_banks_grade_level_check
    check (grade_level is null or grade_level between 1 and 13);
exception when others then
  if sqlerrm like '%already exists%' then null; else raise; end if;
end $$;
