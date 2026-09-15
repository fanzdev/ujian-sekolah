import { useMemo } from 'react'
import { Select } from './Input'

function currentJakartaYear(): number {
  try {
    return Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric' }).format(new Date()))
  } catch {
    return new Date().getFullYear()
  }
}

export function academicYearOptions(past = 5, future = 5): { value: string; label: string }[] {
  const y = currentJakartaYear()
  const out: { value: string; label: string }[] = []
  for (let start = y - past; start <= y + future; start++) {
    out.push({ value: `${start}/${start + 1}`, label: `${start}/${start + 1}` })
  }
  return out
}

export function AcademicYearPicker({
  label = 'Tahun Ajaran',
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
    const base = academicYearOptions()
    if (value && !base.some((o) => o.value === value)) {
      return [...base, { value, label: value }]
    }
    return base
  }, [value])

  return (
    <Select
      label={label}
      placeholder="Pilih tahun ajaran"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={options}
      error={error}
    />
  )
}
