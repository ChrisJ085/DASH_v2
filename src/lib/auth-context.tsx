import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { Profile, Tenant } from '../types/database';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  tenant: Tenant | null;
  permissions: string[];
  roles: { id: string; code: string; name: string }[];
  scopes: { contracts: string[]; sites: string[] };
  loading: boolean;
  error: string | null;
  hasPermission: (perm: string) => boolean;
  hasOperationalScope: (contractId: string, siteId: string) => boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  tenant: null,
  permissions: [],
  roles: [],
  scopes: { contracts: [], sites: [] },
  loading: true,
  error: null,
  hasPermission: () => false,
  hasOperationalScope: () => false,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [roles, setRoles] = useState<{ id: string; code: string; name: string }[]>([]);
  const [scopes, setScopes] = useState<{ contracts: string[]; sites: string[] }>({ contracts: [], sites: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserData = async (currentUser: User) => {
    try {
      // 1. Fetch user profile
      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (profileErr) {
        throw new Error(`Profile fetch error: ${profileErr.message}`);
      }

      if (!profileData) {
        // Handle race condition where user exists in Auth but public.profiles trigger is still writing
        setProfile(null);
        setTenant(null);
        setPermissions([]);
        setRoles([]);
        setScopes({ contracts: [], sites: [] });
        return;
      }

      setProfile(profileData as Profile);

      // 2. Fetch tenant if associated
      if (profileData.tenant_id) {
        const { data: tenantData, error: tenantErr } = await supabase
          .from('tenants')
          .select('*')
          .eq('id', profileData.tenant_id)
          .maybeSingle();

        if (tenantErr) {
          throw new Error(`Tenant fetch error: ${tenantErr.message}`);
        }

        setTenant(tenantData as Tenant);
      } else {
        setTenant(null);
      }

      // 3. Fetch user authorization state (roles, permissions, scopes)
      const { data: authState, error: authErr } = await supabase
        .rpc('get_user_authorization_state');

      if (!authErr && authState) {
        setPermissions(authState.permissions || []);
        setRoles(authState.roles || []);
        setScopes({
          contracts: authState.contracts || [],
          sites: authState.sites || []
        });
      } else {
        console.warn('Failed to load authorization state:', authErr);
        // Fallback for platform admins if RPC is not compiled yet or throws
        if (profileData.is_platform_admin) {
          setPermissions(['*']);
        } else {
          setPermissions([]);
          setRoles([]);
          setScopes({ contracts: [], sites: [] });
        }
      }

      setError(null);
    } catch (err) {
      console.error('Error fetching user auth data:', err);
      setError((err as Error).message);
    }
  };

  const refreshProfile = async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser) {
      await fetchUserData(currentUser);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
      setProfile(null);
      setTenant(null);
      setPermissions([]);
      setRoles([]);
      setScopes({ contracts: [], sites: [] });
    } catch (err) {
      console.error('Error signing out:', err);
    } finally {
      setLoading(false);
    }
  };

  const hasPermission = (perm: string) => {
    if (profile?.is_platform_admin) return true;
    if (permissions.includes('*')) return true;
    return permissions.includes(perm);
  };

  const hasOperationalScope = (contractId: string, siteId: string) => {
    if (profile?.is_platform_admin) return true;
    
    const isTenantAdmin = roles.some(r => r.code === 'tenant_admin');
    if (isTenantAdmin) return true;

    const hasContracts = scopes.contracts.length > 0;
    const hasSites = scopes.sites.length > 0;

    if (!hasContracts && !hasSites) return false;

    const matchContract = scopes.contracts.includes(contractId);
    const matchSite = scopes.sites.includes(siteId);

    if (hasContracts && hasSites) {
      return matchContract && matchSite;
    }
    if (hasContracts) {
      return matchContract;
    }
    if (hasSites) {
      return matchSite;
    }
    return false;
  };

  useEffect(() => {
    let mounted = true;

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        await fetchUserData(session.user);
      } else {
        setProfile(null);
        setTenant(null);
        setPermissions([]);
        setRoles([]);
        setScopes({ contracts: [], sites: [] });
      }
      setLoading(false);
    });

    // Handle authentication state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!mounted) return;
      console.log('Auth state event:', event, currentSession?.user?.email);

      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        // Only load if user changed or session newly created or token refreshed
        await fetchUserData(currentSession.user);
      } else {
        setProfile(null);
        setTenant(null);
        setPermissions([]);
        setRoles([]);
        setScopes({ contracts: [], sites: [] });
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        tenant,
        permissions,
        roles,
        scopes,
        loading,
        error,
        hasPermission,
        hasOperationalScope,
        refreshProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
