import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase, authHelpers } from '@/lib/supabase'
import { toast } from 'sonner'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error?: any }>
  signUp: (email: string, password: string) => Promise<{ error?: any }>
  signOut: () => Promise<{ error?: any }>
  resetPassword: (email: string) => Promise<{ error?: any }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  // Helper function to initialize user billing data
  const initializeUserBillingData = async (user: User, accessToken: string) => {
    try {
      const response = await fetch('/api/user/initialize', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        // Don't show error to user for initialization failures
        console.warn('Failed to initialize user billing data:', response.statusText)
        return
      }

      const result = await response.json()
      if (result.success) {
        console.log('User billing data initialized successfully')
        
        // Trigger a subscription context refresh by dispatching a custom event
        window.dispatchEvent(new CustomEvent('subscription-refresh'))
      } else {
        console.warn('User billing initialization warning:', result.message)
      }
    } catch (error) {
      // Silently handle initialization errors
      console.warn('Error initializing user billing data:', error)
    }
  }

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('Error getting session:', error)
        } else {
          setSession(session)
          setUser(session?.user ?? null)
        }
      } catch (error) {
        console.error('Error in getInitialSession:', error)
      } finally {
        setLoading(false)
      }
    }

    getInitialSession()

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth event:', event, session?.user?.email)
      
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)

      // Handle different auth events
      switch (event) {
        case 'SIGNED_IN':
          toast.success('Successfully signed in!')
          // Initialize user billing data if this is a new user
          if (session?.user) {
            initializeUserBillingData(session.user, session.access_token)
          }
          break
        case 'SIGNED_OUT':
          toast.success('Successfully signed out!')
          break
        case 'TOKEN_REFRESHED':
          console.log('Token refreshed')
          break
        case 'USER_UPDATED':
          console.log('User updated')
          break
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true)
      const { data, error } = await authHelpers.signIn(email, password)
      
      if (error) {
        toast.error(`Sign in failed: ${error.message}`)
        return { error }
      }

      return { error: null }
    } catch (error: any) {
      toast.error(`Sign in failed: ${error.message}`)
      return { error }
    } finally {
      setLoading(false)
    }
  }

  const signUp = async (email: string, password: string) => {
    try {
      setLoading(true)
      const { data, error } = await authHelpers.signUp(email, password)
      
      if (error) {
        toast.error(`Sign up failed: ${error.message}`)
        return { error }
      }

      toast.success('Check your email for the confirmation link!')
      return { error: null }
    } catch (error: any) {
      toast.error(`Sign up failed: ${error.message}`)
      return { error }
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    try {
      setLoading(true)
      const { error } = await authHelpers.signOut()
      
      if (error) {
        toast.error(`Sign out failed: ${error.message}`)
        return { error }
      }

      return { error: null }
    } catch (error: any) {
      toast.error(`Sign out failed: ${error.message}`)
      return { error }
    } finally {
      setLoading(false)
    }
  }

  const resetPassword = async (email: string) => {
    try {
      const { data, error } = await authHelpers.resetPassword(email)
      
      if (error) {
        toast.error(`Password reset failed: ${error.message}`)
        return { error }
      }

      toast.success('Password reset email sent!')
      return { error: null }
    } catch (error: any) {
      toast.error(`Password reset failed: ${error.message}`)
      return { error }
    }
  }

  const value = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}