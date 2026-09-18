-- ============================================================
-- SMK AL-FATA CBT — Migration 00045: Fix warna hijau → teal
-- Migration 00040 pernah mengubah primary/secondary ke hijau.
-- Migration 00041-00042 memiki kondisi spesifik sehingga tidak
-- berhasil mengubah kembali. Migration ini memperbaiki secara
-- langsung tanpa memperhatikan nilai lama.
-- ============================================================

update public.school_settings
set
  primary_color = '#0D868F',
  secondary_color = '#2DD4BF',
  updated_at = now()
where id = true
  and primary_color in ('#15803D', '#22C55E', '#0D868F')
  and secondary_color in ('#22C55E', '#0CBCC9', '#C67C3B', '#2DD4BF');
