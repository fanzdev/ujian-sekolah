-- ============================================================
-- SMK AL-FATA CBT — Migration 00008: Hapus Data Demo/Dummy
-- Membersihkan seed contoh dari migrasi lama (mapel, kelas, jurusan).
--
-- AMAN: baris hanya dihapus bila BENAR-BENAR masih kosong.
-- Jika Anda sudah memakai salah satu data itu untuk data nyata
-- (sudah ada soal/ujian/siswa yang menautkannya), baris tersebut
-- TIDAK akan dihapus.
-- ============================================================

-- Mata pelajaran contoh: hapus hanya jika belum dipakai bank soal / ujian / guru
delete from public.subjects s
where s.code in ('MTK', 'BIND', 'BING', 'INF', 'PABP', 'PPKN')
  and not exists (select 1 from public.question_banks b where b.subject_id = s.id)
  and not exists (select 1 from public.exams e where e.subject_id = s.id)
  and not exists (select 1 from public.teacher_subjects ts where ts.subject_id = s.id);

-- Kelas contoh: hapus hanya jika belum berisi siswa
delete from public.classes c
where c.name in ('X TJKT 1', 'XI TJKT 1', 'XII TJKT 1')
  and not exists (select 1 from public.students st where st.class_id = c.id);

-- Jurusan contoh: hapus hanya jika tidak lagi memiliki kelas / target ujian
delete from public.departments d
where d.code = 'TJKT'
  and not exists (select 1 from public.classes c where c.department_id = d.id)
  and not exists (
    select 1 from public.exam_targets t
    where t.kind = 'department' and t.target_id = d.id
  );
