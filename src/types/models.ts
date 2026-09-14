export type UserRole = 'admin' | 'teacher' | 'student'

export type QuestionType =
  | 'multiple_choice'
  | 'multiple_response'
  | 'true_false'
  | 'matching'
  | 'short_answer'
  | 'essay'

export type Difficulty = 'easy' | 'medium' | 'hard'
export type BankStatus = 'draft' | 'published' | 'archived'
export type ExamStatus = 'draft' | 'published' | 'completed' | 'cancelled'
export type AttemptStatus = 'in_progress' | 'submitted' | 'auto_submitted' | 'graded' | 'cancelled'

export interface Profile {
  id: string
  username: string
  full_name: string
  role: UserRole
  avatar_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Department {
  id: string
  code: string
  name: string
  description: string | null
  is_active: boolean
}

export interface SchoolClass {
  id: string
  name: string
  level: number
  department_id: string
  homeroom_teacher_id: string | null
  is_active: boolean
  departments?: { code: string; name: string } | null
}

export interface Student {
  id: string
  profile_id: string
  nis: string | null
  nisn: string | null
  gender: 'L' | 'P' | null
  birth_place: string | null
  birth_date: string | null
  address: string | null
  phone: string | null
  email: string | null
  class_id: string | null
  is_active: boolean
  profiles?: Partial<Profile> | null
  classes?: Pick<SchoolClass, 'id' | 'name' | 'level'> & {
    departments?: Pick<Department, 'code' | 'name'> | null
  } | null
}

export interface Teacher {
  id: string
  profile_id: string
  nip: string | null
  phone: string | null
  email: string | null
  address: string | null
  is_active: boolean
  profiles?: Partial<Profile> | null
}

export interface Subject {
  id: string
  code: string
  name: string
  description: string | null
  is_active: boolean
}

export interface QuestionBank {
  id: string
  title: string
  description: string | null
  subject_id: string | null
  grade_level: number | null
  tags: string[]
  status: BankStatus
  author_id: string
  created_at: string
  subjects?: Pick<Subject, 'name'> | null
  profiles?: Pick<Profile, 'full_name'> | null
}

export interface QuestionOption {
  id: string
  question_id?: string
  option_text: string
  media_url: string | null
  is_correct: boolean
  position: number
}

export interface MatchingPair {
  id?: string
  question_id?: string
  left_text: string
  right_text: string
  position: number
}

export interface Question {
  id: string
  bank_id: string
  type: QuestionType
  text: string
  media_url: string | null
  media_type: 'image' | 'audio' | 'video' | null
  difficulty: Difficulty
  points: number
  default_answer: Record<string, unknown> | null
  scoring_rule: Record<string, unknown>
  explanation: string | null
  tags: string[]
  author_id: string
  question_options?: QuestionOption[]
  matching_pairs?: MatchingPair[]
}

export interface ExamTarget {
  id?: string
  exam_id: string
  kind: 'class' | 'department'
  target_id: string
}

export interface ExamParticipant {
  exam_id: string
  student_id: string
  is_removed: boolean
  students?: Student | null
}

export type AnswerValue = string | string[] | boolean | Record<string, number> | null

export interface ExamQuestionLink {
  exam_id: string
  question_id: string
  position: number
  points: number | null
  questions?: Question | null
}

export interface Exam {
  id: string
  title: string
  description: string | null
  instructions: string | null
  subject_id: string | null
  teacher_id: string | null
  created_by: string | null
  starts_at: string
  ends_at: string
  duration_minutes: number
  total_points: number
  passing_grade: number
  shuffle_questions: boolean
  shuffle_options: boolean
  max_attempts: number
  exam_code: string | null
  pin_code: string | null
  status: ExamStatus
  show_result_to_student: boolean
  show_answers_after: boolean
  fullscreen_required: boolean
  camera_monitoring: boolean
  violation_limit: number
  auto_submit_on_limit: boolean
  allow_outside_schedule: boolean
  ip_logging: boolean
  device_logging: boolean
  created_at: string
  subjects?: Pick<Subject, 'name'> | null
  teachers?: { profiles?: Pick<Profile, 'full_name'> } | null
}

export interface ExamAttemptRow {
  id: string
  exam_id: string
  student_id: string
  attempt_number: number
  status: AttemptStatus
  started_at: string
  deadline: string
  duration_minutes: number
  submitted_at: string | null
  violation_count: number
  last_activity_at: string | null
  exams?: Pick<Exam, 'title' | 'duration_minutes'> | null
  students?: { profiles?: Pick<Profile, 'full_name'>; nis?: string | null } | null
}

export interface ExamResult {
  attempt_id: string
  exam_id: string
  student_id: string
  total_questions: number
  correct_count: number
  wrong_count: number
  unanswered_count: number
  objective_score: number
  essay_score: number | null
  final_score: number | null
  passed: boolean | null
  submitted_at: string | null
  duration_seconds: number | null
  violation_count: number
  exams?: Pick<Exam, 'title' | 'passing_grade'> | null
  attempts?: {
    status: AttemptStatus
    students?: { profiles?: Pick<Profile, 'full_name'>; nis?: string | null } | null
  } | null
}

export interface EssayGrade {
  attempt_id: string
  question_id: string
  final_score: number | null
  final_feedback: string | null
  graded_by: string | null
  graded_at: string | null
  status: 'pending' | 'graded'
}

export interface Violation {
  id: string
  attempt_id: string
  exam_id: string
  student_id: string
  violation_type: string
  severity: 'warning' | 'serious' | 'critical'
  metadata: Record<string, unknown>
  user_agent: string | null
  created_at: string
  exams?: Pick<Exam, 'title'> | null
  students?: { profiles?: Pick<Profile, 'full_name'> | null; nis?: string | null } | null
}

export interface AuditLog {
  id: string
  actor_id: string | null
  actor_role: UserRole | null
  action: string
  resource: string | null
  resource_id: string | null
  metadata: Record<string, unknown>
  ip_address: string | null
  user_agent: string | null
  created_at: string
  profiles?: Pick<Profile, 'full_name' | 'username'> | null
}

export interface Notification {
  id: string
  recipient_id: string
  title: string
  body: string | null
  type: string
  link_path: string | null
  is_read: boolean
  created_at: string
}

export interface SchoolSettings {
  app_name: string
  school_name: string
  logo_url: string | null
  favicon_url: string | null
  primary_color: string
  secondary_color: string
  extra_colors: string[] | null
  theme_preset: string | null
  login_color: string | null
  sidebar_color: string | null
  app_bg_color: string | null
  splash_bg_color: string | null
  card_gradients: Record<string, string[]> | null
  address: string | null
  city: string | null
  headmaster: string | null
  academic_year: string | null
  semester: string | null
}

export interface SystemSettingsMap {
  exam_defaults: {
    duration_minutes: number
    max_attempts: number
    violation_limit: number
    auto_submit_on_limit: boolean
    shuffle_questions: boolean
    shuffle_options: boolean
    fullscreen_required: boolean
    camera_monitoring: boolean
    show_result_to_student: boolean
    show_answers_after: boolean
    passing_grade: number
    allow_outside_schedule: boolean
  }
  security: { camera_snapshots_enabled: boolean; ip_logging: boolean; device_logging: boolean }
  password_policy: { min_length: number }
  username_policy: { lowercase: boolean; pattern: string }
}

export type AvailableExamStatus = 'upcoming' | 'can_start' | 'resume' | 'no_attempts' | 'closed'

export interface AvailableExam {
  id: string
  title: string
  description: string | null
  subject_name: string | null
  teacher_name: string | null
  starts_at: string
  ends_at: string
  duration_minutes: number
  total_questions: number
  total_points: number
  passing_grade: number
  max_attempts: number
  attempts_used: number
  has_pin: boolean
  camera_monitoring: boolean
  fullscreen_required: boolean
  violation_limit: number
  auto_submit_on_limit: boolean
  allow_outside_schedule: boolean
  show_result_to_student: boolean
  show_answers_after: boolean
  status_for_me: AvailableExamStatus
  active_attempt_id: string | null
  best_score: number | null
}

export interface ClientOption {
  id: string
  text: string
  media_url: string | null
  is_correct?: boolean | null
}

export interface ClientQuestion {
  id: string
  type: QuestionType
  text: string
  media_url: string | null
  media_type: string | null
  difficulty: Difficulty
  points: number
  options?: ClientOption[]
  left_items?: { k: number; text: string }[]
  right_items?: { k: number; text: string }[]
  correct_pairs?: { left: string; right: string }[] | null
  match_mode?: string
  min_words?: number
  max_words?: number
  accepted_answers?: string[] | null
  correct_answer?: boolean | null
  explanation?: string | null
}

export interface AttemptPayload {
  attempt: {
    id: string
    status: AttemptStatus
    started_at: string
    deadline: string
    duration_minutes: number
    attempt_number: number
    violation_count: number
  }
  exam: {
    id: string
    title: string
    instructions: string | null
    duration_minutes: number
    total_points: number
    passing_grade: number
    shuffle_questions: boolean
    shuffle_options: boolean
    camera_monitoring: boolean
    fullscreen_required: boolean
    show_result_to_student: boolean
    show_answers_after: boolean
    violation_limit: number
    max_attempts: number
    allow_outside_schedule: boolean
    starts_at: string
    ends_at: string
  }
  student: { name: string; nis: string | null; class: string | null; department: string | null }
  questions: Record<string, ClientQuestion>
  order: string[]
  answers: Record<string, AnswerValue>
  remaining_seconds: number
  server_time: string
}

export interface SubmitSummary {
  already_submitted?: boolean
  objective_score?: number
  correct?: number
  wrong?: number
  unanswered?: number
  essay_total?: number
  essay_graded?: number
  essay_pending?: boolean
  final_score?: number | null
  passed?: boolean | null
}

export interface ViolationResponse {
  count?: number
  limit?: number
  submitted?: boolean
  ignored?: boolean
}
