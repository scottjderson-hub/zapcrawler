import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface SuperAdminRouteProps {
  children: ReactNode;
}

/**
 * Route wrapper that only allows super admins to access the wrapped content
 * Redirects non-admin users to the dashboard
 */
export function SuperAdminRoute({ children }: SuperAdminRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: adminLoading } = useIsSuperAdmin();

  // Show loading state while checking authentication and admin status
  if (authLoading || adminLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If not authenticated, redirect to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If authenticated but not super admin, redirect to dashboard
  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // User is super admin, render the protected content
  return <>{children}</>;
}
