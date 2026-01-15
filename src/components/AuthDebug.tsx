import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'

export function AuthDebug() {
  // Debug component disabled - authentication is working correctly
  return null
}