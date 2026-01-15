import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface SuperAdminStatus {
  isSuperAdmin: boolean;
  loading: boolean;
}

/**
 * Hook to check if the current user is a super admin
 * @returns {SuperAdminStatus} Object with isSuperAdmin boolean and loading state
 */
export function useIsSuperAdmin(): SuperAdminStatus {
  const { user } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSuperAdminStatus = async () => {
      if (!user) {
        setIsSuperAdmin(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('is_super_admin', {
          p_user_id: user.id
        });

        if (error) {
          console.error('Error checking super admin status:', error);
          setIsSuperAdmin(false);
          setLoading(false);
          return;
        }

        setIsSuperAdmin(data || false);
        setLoading(false);
      } catch (error) {
        console.error('Error checking super admin status:', error);
        setIsSuperAdmin(false);
        setLoading(false);
      }
    };

    checkSuperAdminStatus();
  }, [user]);

  return { isSuperAdmin, loading };
}
