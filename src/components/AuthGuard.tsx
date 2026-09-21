import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';

export const AuthGuard = () => {
  const { session, loading } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return session ? <Outlet /> : <Navigate to="/login" replace />;
};
