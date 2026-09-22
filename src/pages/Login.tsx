import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Layers, ShieldAlert, CheckCircle2, Building2, KeyRound } from 'lucide-react';
import { validateInvitationCode } from '../lib/invitation-code-service';

export const Login = () => {
  const [isRegisterOrg, setIsRegisterOrg] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      if (isRegisterOrg) {
        // Enforce invitation code unless registering user is chris.jeal@gxo.com
        if (email.trim().toLowerCase() !== 'chris.jeal@gxo.com') {
          if (!invitationCode.trim()) {
            throw new Error('An Invitation Code is required. Tenant creation is strictly restricted by invitation only.');
          }

          // Validate code against database
          const valRes = await validateInvitationCode(invitationCode);
          if (!valRes.valid) {
            throw new Error(valRes.message);
          }
        }

        // Save invitation code to localStorage so Screen A can auto-populate it
        if (invitationCode.trim()) {
          localStorage.setItem('dash_pending_invite_code', invitationCode.trim().toUpperCase());
        }

        // Controlled flow: Register a brand new user who will immediately bootstrap an organization
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              invitation_code: invitationCode.trim().toUpperCase()
            },
          },
        });

        if (signUpError) throw signUpError;
        
        setInfo('Account registered successfully! Please sign in with your email and password to complete organisation setup.');
        setIsRegisterOrg(false);
        setPassword('');
      } else {
        // Standard user or admin sign in
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;
        navigate('/');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 text-slate-900 font-sans p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xs p-8 space-y-6">
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center text-white font-black text-xl tracking-wider shadow-sm">
            D2
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">DASH V2</h1>
            <p className="text-xs text-slate-500 mt-1">
              Multi-Tenant Behavioural Observation Platform
            </p>
          </div>
        </div>

        {/* Message Banner */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg flex items-start space-x-2.5 text-xs">
            <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {info && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-start space-x-2.5 text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{info}</span>
          </div>
        )}

        {/* Info box for Controlled Registration */}
        {isRegisterOrg && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-2.5 text-xs text-amber-950">
            <KeyRound className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Invitation Required:</strong> Registration & tenant creation is restricted. You must provide a valid invitation code.
            </p>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegisterOrg && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">Invitation Code</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="e.g. GXO-VIP-2026"
                    value={invitationCode}
                    onChange={(e) => setInvitationCode(e.target.value.toUpperCase())}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm font-mono font-bold tracking-wider uppercase focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                    required={email.trim().toLowerCase() !== 'chris.jeal@gxo.com'}
                  />
                  <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                </div>
                <p className="text-[10px] text-slate-400">
                  Contact chris.jeal@gxo.com to request a tenant registration code.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">Your Name (Admin)</label>
                <input
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                  required
                />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 block">Email Address</label>
            <input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 block">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
              required
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
                <span>Processing...</span>
              </span>
            ) : isRegisterOrg ? (
              'Register Admin Account'
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* Toggle link */}
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => {
              setIsRegisterOrg(!isRegisterOrg);
              setError(null);
              setInfo(null);
            }}
            className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline font-medium cursor-pointer"
          >
            {isRegisterOrg
              ? 'Already have an admin account? Sign In'
              : 'Register a New Organisation'}
          </button>
        </div>
      </div>
    </div>
  );
};
