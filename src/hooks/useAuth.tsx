import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Profile } from '@/types/models'
import * as authService from '@/services/auth.service'
import { supabase } from '@/services/client'

interface AuthState {
  profile: Profile | null
  loading: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  profile: null,
  loading: true,
  refresh: async () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = async () => {
    try {
      const p = await authService.fetchMyProfile()
      setProfile(p)
    } catch {
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadProfile()

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setProfile(null)
        return
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        void loadProfile()
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    await authService.signOut()
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ profile, loading, refresh: loadProfile, signOut: handleSignOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  return useContext(AuthContext)
}
