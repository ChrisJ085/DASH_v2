import { useState } from 'react';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';
import { ShieldAlert, KeyRound, CheckCircle2, LogOut } from 'lucide-react';

export const ForcePasswordChangeModal = () => {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Show modal if user metadata specifies must_change_password or profile status is 'invited'
  const mustChange = Boolean(
    user && (user.user_metadata?.must_change_password || profile?.status === 'invited')
  );

  if (!mustChange) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match. Please verify and try again.');
      return;
    }

    setLoading(true);

    try {
      // 1. Update user password and clear metadata flag
      const { error: updateAuthErr } = await supabase.auth.updateUser({
        password: newPassword,
        data: { must_change_password: false }
      });

      if (updateAuthErr) throw updateAuthErr;

      // 2. Update user profile status from 'invited' to 'active'
      if (profile && (profile.status === 'invited' || !profile.status)) {
        const { error: profileErr } = await supabase
          .from('profiles')
          .update({ status: 'active' })
          .eq('id', user!.id);

        if (profileErr) {
          console.warn('Profile status update warning:', profileErr.message);
        }
      }

      await refreshProfile();
    } catch (err: any) {
      setError(err.message || 'Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl p-6 sm:p-8 space-y-6">
        
        {/* Header Icon & Title */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-xs mb-1">
            <KeyRound className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Initial Login: Password Change Required
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed max-w-xs">
            Your account was provisioned with a temporary password. You must set a permanent password before proceeding.
          </p>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg flex items-start space-x-2 text-xs">
            <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {/* Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 block">
              New Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
              required
              minLength={8}
            />
            <p className="text-[10px] text-slate-400">Must be at least 8 characters long.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 block">
              Confirm New Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
              required
              minLength={8}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold shadow-xs transition-colors disabled:opacity-50 mt-2 cursor-pointer flex justify-center items-center font-sans"
          >
            {loading ? (
              <span className="flex items-center space-x-2">
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Updating Password...</span>
              </span>
            ) : (
              'Set New Password & Continue'
            )}
          </button>
        </form>

        <div className="pt-2 border-t border-slate-100 flex justify-center">
          <button
            type="button"
            onClick={signOut}
            className="text-xs text-slate-500 hover:text-slate-800 flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>

      </div>
    </div>
  );
};
