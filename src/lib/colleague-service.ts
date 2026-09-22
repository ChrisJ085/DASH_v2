// src/lib/colleague-service.ts

import { supabase } from './supabase';
import { ColleagueProfile, ColleagueRole, DEFAULT_COLLEAGUE_ROLES } from '../types/colleague';

const STORAGE_PREFIX = 'dash_colleagues_';
const ROLES_STORAGE_PREFIX = 'dash_colleague_roles_';

/**
 * Initial sample colleagues for realistic manufacturing & warehousing shopfloor observations.
 */
function getInitialSeedColleagues(tenantId: string): ColleagueProfile[] {
  return [
    {
      id: 'col-101',
      tenant_id: tenantId,
      full_name: 'Liam Hayes',
      employee_id: 'OP-4081',
      email: 'liam.hayes@ops.internal',
      phone: '+44 7700 900123',
      department: 'Logistics & Inbound',
      shift: 'Morning (06:00 - 14:00)',
      status: 'active',
      role_ids: ['mhe_operator'],
      is_observer: false,
      is_operator: true,
      notes: 'Certified Counterbalance & Reach Truck Operator. 5 years experience.',
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'col-102',
      tenant_id: tenantId,
      full_name: 'Sarah Connor',
      employee_id: 'OP-4092',
      email: 'sarah.connor@ops.internal',
      phone: '+44 7700 900234',
      department: 'Production Line 3',
      shift: 'Afternoon (14:00 - 22:00)',
      status: 'active',
      role_ids: ['machine_operator'],
      is_observer: false,
      is_operator: true,
      notes: 'High-speed automated packaging line and sealer operator.',
      created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'col-103',
      tenant_id: tenantId,
      full_name: 'Marcus Vance',
      employee_id: 'OP-4105',
      email: 'marcus.vance@ops.internal',
      phone: '+44 7700 900345',
      department: 'Cross-Dock & Despatch',
      shift: 'Morning (06:00 - 14:00)',
      status: 'active',
      role_ids: ['mhe_operator', 'observer'],
      is_observer: true,
      is_operator: true,
      notes: 'Dual certified: MHE driver and peer safety observer.',
      created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'col-104',
      tenant_id: tenantId,
      full_name: 'Priya Patel',
      employee_id: 'OP-4118',
      email: 'priya.patel@ops.internal',
      phone: '+44 7700 900456',
      department: 'Assembly & Finishing',
      shift: 'Night (22:00 - 06:00)',
      status: 'active',
      role_ids: ['machine_operator'],
      is_observer: false,
      is_operator: true,
      notes: 'Precision stamping and robotic arm cell operator.',
      created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'col-105',
      tenant_id: tenantId,
      full_name: 'David Miller',
      employee_id: 'OP-4010',
      email: 'david.miller@ops.internal',
      phone: '+44 7700 900567',
      department: 'HSE & Compliance',
      shift: 'Day Shift (08:00 - 16:30)',
      status: 'active',
      role_ids: ['observer', 'supervisor'],
      is_observer: true,
      is_operator: false,
      notes: 'Senior Safety Inspector & Team Leader.',
      created_at: new Date(Date.now() - 40 * 86400000).toISOString(),
      updated_at: new Date().toISOString()
    }
  ];
}

/**
 * Fetch colleague roles available in the tenant.
 */
export async function fetchColleagueRoles(tenantId: string): Promise<ColleagueRole[]> {
  try {
    // 1. Check local storage cache for tenant-specific customized roles
    const local = localStorage.getItem(ROLES_STORAGE_PREFIX + tenantId);
    let customRoles: ColleagueRole[] = [];
    if (local) {
      try {
        customRoles = JSON.parse(local);
      } catch (e) {
        // ignore
      }
    }

    // 2. Fetch custom roles from database `roles` table if available
    const { data: dbRoles } = await supabase
      .from('roles')
      .select('*')
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);

    const mappedDbRoles: ColleagueRole[] = (dbRoles || []).map(r => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description || undefined,
      badge_color: r.code.includes('mhe') 
        ? 'bg-amber-50 text-amber-800 border-amber-200' 
        : r.code.includes('machine')
        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
        : r.code.includes('observer')
        ? 'bg-blue-50 text-blue-750 border-blue-200'
        : 'bg-slate-50 text-slate-800 border-slate-200',
      is_can_observe: r.code === 'observer' || r.code === 'tenant_admin' || r.code === 'site_manager',
      is_can_be_observed: true,
      is_system: r.is_system
    }));

    // Merge: DEFAULT roles + mapped DB roles + custom roles, deduplicating by code
    const roleMap = new Map<string, ColleagueRole>();
    DEFAULT_COLLEAGUE_ROLES.forEach(r => roleMap.set(r.code, r));
    mappedDbRoles.forEach(r => {
      if (!roleMap.has(r.code)) {
        roleMap.set(r.code, r);
      }
    });
    customRoles.forEach(r => roleMap.set(r.code, r));

    return Array.from(roleMap.values());
  } catch (err) {
    console.error('Error fetching colleague roles:', err);
    return DEFAULT_COLLEAGUE_ROLES;
  }
}

/**
 * Save a new or edited colleague role.
 */
export async function saveColleagueRole(tenantId: string, role: ColleagueRole): Promise<ColleagueRole> {
  const current = await fetchColleagueRoles(tenantId);
  const exists = current.some(r => r.id === role.id || r.code === role.code);
  const updated = exists 
    ? current.map(r => (r.id === role.id || r.code === role.code) ? role : r)
    : [...current, role];

  localStorage.setItem(ROLES_STORAGE_PREFIX + tenantId, JSON.stringify(updated));
  return role;
}

/**
 * Fetch all colleagues for the tenant, merging with system user profiles.
 */
export async function fetchColleagues(tenantId: string): Promise<ColleagueProfile[]> {
  try {
    let colleagues: ColleagueProfile[] = [];

    // 1. Read from local storage
    const stored = localStorage.getItem(STORAGE_PREFIX + tenantId);
    if (stored) {
      try {
        colleagues = JSON.parse(stored);
      } catch (e) {
        console.warn('Failed parsing stored colleagues:', e);
      }
    }

    // 2. Read from tenant settings if present
    try {
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('settings')
        .eq('id', tenantId)
        .single();
      
      if (tenantData?.settings?.colleagues && Array.isArray(tenantData.settings.colleagues)) {
        // Merge with local, preferring the most recent
        const remoteList: ColleagueProfile[] = tenantData.settings.colleagues;
        const map = new Map<string, ColleagueProfile>();
        colleagues.forEach(c => map.set(c.id, c));
        remoteList.forEach(c => map.set(c.id, c));
        colleagues = Array.from(map.values());
      }
    } catch (e) {
      // ignore
    }

    // 3. Fetch system profiles and merge any active users as colleagues
    try {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, status')
        .eq('tenant_id', tenantId);

      if (profilesData && profilesData.length > 0) {
        // Fetch their user_roles
        const { data: urData } = await supabase
          .from('user_roles')
          .select('user_id, roles(code, name)')
          .eq('tenant_id', tenantId);

        const rolesByUser = new Map<string, string[]>();
        (urData || []).forEach(ur => {
          const code = (ur.roles as any)?.code;
          if (code) {
            const arr = rolesByUser.get(ur.user_id) || [];
            arr.push(code);
            rolesByUser.set(ur.user_id, arr);
          }
        });

        profilesData.forEach(p => {
          const existing = colleagues.find(c => c.user_id === p.id || c.email === p.email);
          const assignedRoleCodes = rolesByUser.get(p.id) || ['observer'];
          if (existing) {
            // Update link
            existing.user_id = p.id;
            existing.full_name = p.full_name || existing.full_name;
            if (!existing.role_ids || existing.role_ids.length === 0) {
              existing.role_ids = assignedRoleCodes;
            }
          } else {
            // Add as colleague profile
            colleagues.push({
              id: `user-col-${p.id}`,
              tenant_id: tenantId,
              user_id: p.id,
              full_name: p.full_name || 'System Colleague',
              employee_id: `SYS-${p.id.substring(0, 4).toUpperCase()}`,
              email: p.email,
              phone: p.phone,
              department: 'Operations',
              shift: 'Day Shift',
              status: p.status === 'suspended' ? 'inactive' : 'active',
              role_ids: assignedRoleCodes,
              is_observer: assignedRoleCodes.includes('observer'),
              is_operator: assignedRoleCodes.some(r => r.includes('operator') || r.includes('mhe')),
              notes: 'Synced from organization user account.',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          }
        });
      }
    } catch (e) {
      console.warn('Error syncing system profiles to colleagues:', e);
    }

    // 4. If still empty, seed initial sample colleagues
    if (colleagues.length === 0) {
      colleagues = getInitialSeedColleagues(tenantId);
      localStorage.setItem(STORAGE_PREFIX + tenantId, JSON.stringify(colleagues));
    }

    return colleagues;
  } catch (err) {
    console.error('Error in fetchColleagues:', err);
    return getInitialSeedColleagues(tenantId);
  }
}

/**
 * Save or update a colleague profile.
 */
export async function saveColleague(tenantId: string, colleague: ColleagueProfile): Promise<ColleagueProfile> {
  const current = await fetchColleagues(tenantId);
  const exists = current.some(c => c.id === colleague.id);
  const updated = exists
    ? current.map(c => c.id === colleague.id ? { ...colleague, updated_at: new Date().toISOString() } : c)
    : [...current, { ...colleague, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }];

  // 1. Cache to LocalStorage
  localStorage.setItem(STORAGE_PREFIX + tenantId, JSON.stringify(updated));

  // 2. Attempt remote sync to tenant settings
  try {
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    const existingSettings = tenantData?.settings || {};
    await supabase
      .from('tenants')
      .update({
        settings: {
          ...existingSettings,
          colleagues: updated
        }
      })
      .eq('id', tenantId);
  } catch (e) {
    // Non-blocking fallback to local storage
  }

  return colleague;
}

/**
 * Delete a colleague profile.
 */
export async function deleteColleague(tenantId: string, colleagueId: string): Promise<void> {
  const current = await fetchColleagues(tenantId);
  const updated = current.filter(c => c.id !== colleagueId);

  localStorage.setItem(STORAGE_PREFIX + tenantId, JSON.stringify(updated));

  try {
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    const existingSettings = tenantData?.settings || {};
    await supabase
      .from('tenants')
      .update({
        settings: {
          ...existingSettings,
          colleagues: updated
        }
      })
      .eq('id', tenantId);
  } catch (e) {
    // non-blocking
  }
}

/**
 * Helper to match colleagues against an instrument's required/target colleague roles.
 */
export function filterColleaguesByRoles(
  colleagues: ColleagueProfile[],
  targetRoleIdsOrCodes: string[] = []
): { matching: ColleagueProfile[]; nonMatching: ColleagueProfile[] } {
  if (!targetRoleIdsOrCodes || targetRoleIdsOrCodes.length === 0) {
    // If instrument specifies no specific roles, all active colleagues match
    return {
      matching: colleagues.filter(c => c.status === 'active'),
      nonMatching: []
    };
  }

  const normalizedTargets = targetRoleIdsOrCodes.map(r => r.toLowerCase().replace(/^role-/, '').replace(/-/g, '_'));

  const matching: ColleagueProfile[] = [];
  const nonMatching: ColleagueProfile[] = [];

  colleagues.forEach(c => {
    if (c.status !== 'active') return;

    const colleagueRoles = (c.role_ids || []).map(r => r.toLowerCase().replace(/^role-/, '').replace(/-/g, '_'));
    
    // Check if colleague holds any of the target roles
    const isMatch = normalizedTargets.some(target => 
      colleagueRoles.includes(target) ||
      (target === 'observer' && c.is_observer) ||
      ((target.includes('operator') || target.includes('mhe')) && c.is_operator)
    );

    if (isMatch) {
      matching.push(c);
    } else {
      nonMatching.push(c);
    }
  });

  return { matching, nonMatching };
}
