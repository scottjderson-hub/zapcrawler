import { createClient } from '@supabase/supabase-js';

// Get environment variables - hardcoded for now to ensure they're available
// These should match the values in your .env file
const supabaseUrl = 'https://amakhxbunjvmtrnixhkk.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtYWtoeGJ1bmp2bXRybml4aGtrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NDEyNjMsImV4cCI6MjA2OTUxNzI2M30.tTbkHTZEF2T_cZau4LYVFjitYOr1EIWxze_95AkVlmM';

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Helper function to check if Supabase is properly configured
export const isSupabaseConfigured = () => {
  return supabaseUrl && supabaseAnonKey;
};

// Auth helper functions
export const authHelpers = {
  signUp: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })
    return { data, error }
  },

  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { data, error }
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  },

  resetPassword: async (email: string) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    return { data, error }
  },

  getCurrentUser: () => {
    return supabase.auth.getUser()
  },

  getSession: () => {
    return supabase.auth.getSession()
  }
};
