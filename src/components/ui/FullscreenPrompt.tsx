import type { UserRole } from '@/types/models'

export function FullscreenPrompt({ role: _role }: { role: UserRole }) {
  void _role
  return null
}
