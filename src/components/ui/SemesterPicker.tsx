import { useMemo } from 'react'
import { Select } from './Input'

const SEMESTERS = [
  { value: 'Ganjil', label: 'Ganjil' },
  { value: 'Genap', label: 'Genap' },
]

export function SemesterPicker({
  label = 'Semester',
  value,
  onChange,
  error,
}: {
  label?: string
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  const options = useMemo(() => {
    if (value && !SEMESTERS.some((o) => o.value === value)) {
      return [...SEMESTERS, { value, label: value }]
    }
    return SEMESTERS
  }, [value])

  return (
    <Select
      label={label}
      placeholder="Pilih semester"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={options}
      error={error}
    />
  )
}
