-- ============================================================
-- SMK AL-FATA CBT — Migration 00034: Fix RLS for Import Grades
-- Admin perlu bisa insert/update exam_results via import.
-- ============================================================

drop policy if exists "results_insert_admin" on public.exam_results;
create policy "results_insert_admin" on public.exam_results for insert to authenticated
  with check (private.is_admin());

drop policy if exists "results_update_admin" on public.exam_results;
create policy "results_update_admin" on public.exam_results for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- Juga izinkan guru pemilik ujian untuk update nilai (untuk fallback jika RLS membatasi)
drop policy if exists "results_update_owner" on public.exam_results;
create policy "results_update_owner" on public.exam_results for update to authenticated
  using (private.exam_owned_by_me(exam_id))
  with check (private.exam_owned_by_me(exam_id));

-- Pastikan students import juga memperbaiki RLS sebelumnya sudah benar,
-- namun tambahkan kebijakan untuk mengizinkan admin melihat semua hasil walau show_result false (sudah ada)
