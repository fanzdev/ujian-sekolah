export interface SchoolForm {
  schoolName: string
  city: string
  address: string
  headmaster: string
  academicYear: string
  logoUrl: string
}

export interface AdminForm {
  fullName: string
  username: string
  password: string
  confirmPassword: string
}

export const EMPTY_SCHOOL: SchoolForm = {
  schoolName: 'SMK AL-FATA',
  city: '',
  address: '',
  headmaster: '',
  academicYear: '',
  logoUrl: '',
}

export const EMPTY_ADMIN: AdminForm = {
  fullName: '',
  username: '',
  password: '',
  confirmPassword: '',
}

export function scorePassword(password: string): {
  score: number
  label: string
  tone: 'red' | 'amber' | 'green'
} {
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  if (score <= 2) return { score, label: 'Lemah', tone: 'red' }
  if (score <= 3) return { score, label: 'Cukup', tone: 'amber' }
  return { score, label: 'Kuat', tone: 'green' }
}
