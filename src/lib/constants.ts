import type { QuestionType } from '@/types/models'

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'Pilihan Ganda',
  multiple_response: 'PG Kompleks',
  true_false: 'Benar / Salah',
  matching: 'Menjodohkan',
  short_answer: 'Isian Singkat',
  essay: 'Essay',
}

export const QUESTION_TYPE_SHORT: Record<QuestionType, string> = {
  multiple_choice: 'PG',
  multiple_response: 'PGK',
  true_false: 'B/S',
  matching: 'JDH',
  short_answer: 'ISN',
  essay: 'ESS',
}

export const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Mudah',
  medium: 'Sedang',
  hard: 'Sulit',
}

export const EXAM_STATUS_LABELS: Record<string, string> = {
  draft: 'Draf',
  published: 'Aktif',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
}

export const ATTEMPT_STATUS_LABELS: Record<string, string> = {
  in_progress: 'Berlangsung',
  submitted: 'Dikumpulkan',
  auto_submitted: 'Otomatis',
  graded: 'Dinilai',
  cancelled: 'Dibatalkan',
}

export const AVAILABLE_EXAM_STATUS_LABELS: Record<string, string> = {
  upcoming: 'Akan Datang',
  can_start: 'Bisa Dikerjakan',
  resume: 'Lanjutkan',
  no_attempts: 'Kesempatan Habis',
  closed: 'Berakhir',
}

export const VIOLATION_TYPE_LABELS: Record<string, string> = {
  tab_switch: 'Pindah Tab',
  window_blur: 'Keluar Jendela',
  fullscreen_exit: 'Keluar Fullscreen',
  reload_attempt: 'Coba Muat Ulang',
  copy_paste: 'Copy/Paste',
  context_menu: 'Klik Kanan',
  camera_denied: 'Kamera Ditolak',
  suspicious_activity: 'Aktivitas Mencurigakan',
  session_change: 'Perubahan Sesi',
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Login',
  LOGOUT: 'Logout',
  CREATE_USER: 'Buat Pengguna',
  UPDATE_USER: 'Ubah Pengguna',
  DELETE_USER: 'Hapus Pengguna',
  RESET_PASSWORD: 'Reset Password',
  CREATE_EXAM: 'Buat Ujian',
  UPDATE_EXAM: 'Ubah Ujian',
  DELETE_EXAM: 'Hapus Ujian',
  PUBLISH_EXAM: 'Publikasikan Ujian',
  CREATE_QUESTION: 'Buat Soal',
  UPDATE_QUESTION: 'Ubah Soal',
  DELETE_QUESTION: 'Hapus Soal',
  START_EXAM: 'Mulai Ujian',
  SUBMIT_EXAM: 'Kumpulkan Ujian',
  AUTO_SUBMIT: 'Auto Submit',
  VIOLATION: 'Pelanggaran',
  GRADE_ESSAY: 'Nilai Essay',
  CANCEL_ATTEMPT: 'Batalkan Attempt',
  IMPORT_DATA: 'Import Data',
  EXPORT_DATA: 'Export Data',
  CHANGE_SETTINGS: 'Ubah Pengaturan',
}

export const ROLE_HOME: Record<string, string> = {
  admin: '/admin',
  teacher: '/teacher',
  student: '/student',
}
